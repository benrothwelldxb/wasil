// Wasil Hub term-dates sync — pull Hub's academic terms and mirror them into
// Connect's TermDate calendar, one-way and read-only.
//
// Hub owns the term boundaries. Each Hub term becomes TWO Connect TermDate rows
// (a "term-start" and a "term-end"), keyed on (hubTermId, type) so a re-run
// updates the same rows instead of duplicating them. The presence of hubTermId
// is the read-only marker: the term-dates route refuses PUT/DELETE on such rows
// (edit them in Hub). Manual rows (hubTermId null — half-terms, public-holidays,
// inductions admins still add in Connect) are never touched by this sync.
//
// Dormant-safe: if the school isn't Hub-linked this is a clean no-op. The MIS
// client itself throws HubServiceTokenMissingError when the token is unset,
// consistent with the roster sync; the caller (hubSync) wraps this in try/catch.

import prisma from './prisma.js'
import { listTerms, getCalendarStructure } from './hubMis.js'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Shift a `YYYY-MM-DD` date by whole days (UTC), returning `YYYY-MM-DD`. */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Nudge a date to the nearest weekday (UAE weekend = Sat/Sun) in a direction, so
 * a half-term break reads as the school week off (Mon–Fri) rather than spilling
 * onto the flanking weekend. */
function toWeekday(iso: string, dir: 1 | -1): string {
  let d = new Date(`${iso}T00:00:00.000Z`)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d = new Date(`${addDaysISO(d.toISOString().slice(0, 10), dir)}T00:00:00.000Z`)
  }
  return d.toISOString().slice(0, 10)
}

export interface TermDateSyncSummary {
  /** True when nothing ran (dormant): the school isn't Hub-linked. */
  skipped: boolean
  /** TermDate rows upserted (2 per Hub term: a start + an end). */
  upserted: number
  /** Hub-sourced TermDate rows deleted because Hub dropped their term. */
  pruned: number
}

/**
 * Pull the Hub academic terms for one Connect school and mirror them into
 * TermDate. Idempotent, keyed on (hubTermId, type). No-op (skipped) when the
 * school isn't Hub-linked. Never touches manual rows (hubTermId null).
 */
export async function syncTermDates(connectSchoolId: string): Promise<TermDateSyncSummary> {
  const school = await prisma.school.findUnique({ where: { id: connectSchoolId } })
  if (!school || !school.hubSchoolId) {
    return { skipped: true, upserted: 0, pruned: 0 }
  }
  const schoolId = school.id

  const terms = await listTerms(school.hubSchoolId)

  // Deterministic term numbering: order Hub terms by start date and use the
  // 1-based index as Connect's `term` (Term 1, 2, 3 …). Copy before sorting so
  // we never rely on Hub's array order.
  const ordered = [...terms].sort((a, b) => a.startDate.localeCompare(b.startDate))

  let upserted = 0
  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i]
    const term = i + 1

    // term-start (green) + term-end (red). Dates parsed as UTC midnight, matching
    // how calendar events store their local calendar date.
    const rows = [
      {
        type: 'term-start',
        label: `${t.name} starts`,
        date: new Date(t.startDate),
        color: 'green',
      },
      {
        type: 'term-end',
        label: `${t.name} ends`,
        date: new Date(t.endDate),
        color: 'red',
      },
    ]

    for (const row of rows) {
      const shared = {
        term,
        termName: t.name,
        label: row.label,
        date: row.date,
        type: row.type,
        color: row.color,
        // Hub sends "2026/27"; Connect's TermDate calendar (and the admin year
        // selector) use the dashed form "2026-27" — normalise so rows match.
        academicYear: t.academicYear.replace(/\//g, '-'),
        hubTermId: t.id,
      }
      // No unique constraint on (hubTermId, type) — find-then-write for idempotency.
      const existing = await prisma.termDate.findFirst({
        where: { schoolId, hubTermId: t.id, type: row.type },
      })
      if (existing) {
        await prisma.termDate.update({ where: { id: existing.id }, data: shared })
      } else {
        await prisma.termDate.create({ data: { ...shared, schoolId } })
      }
      upserted++
    }
  }

  // Prune terms Hub dropped: delete this school's Hub-sourced rows whose hubTermId
  // is no longer among the current Hub term ids. NEVER touches rows with
  // hubTermId = null (manual half-terms / public-holidays / inductions stay).
  const currentTermIds = ordered.map((t) => t.id)
  const prune = await prisma.termDate.deleteMany({
    where: {
      schoolId,
      hubTermId:
        currentTermIds.length > 0
          ? { not: null, notIn: currentTermIds }
          : { not: null },
    },
  })

  // --- Half-term breaks (ADR-style follow-on) ------------------------------
  // Hub's /terms surface is whole terms only, so a term with an October/February/
  // May half-term (e.g. Autumn split into Autumn 1 + Autumn 2 in Hub) shows in
  // Connect as one long term. Hub's /calendar/structure carries each term's
  // half-terms; the GAP between two consecutive half-terms is a half-term break.
  // Mirror each gap as a read-only `half-term` TermDate ROW spanning the school
  // week off — the whole-term start/end rows are untouched, so the break slots
  // inside the existing term (see the Term Dates parent view). Best-effort: if
  // the structure can't be read (missing calendar scope / 404 / token) we skip
  // breaks and keep the whole-term rows. The /terms and /calendar/structure id
  // spaces may differ, so we match a structure term to a synced term by DATE
  // OVERLAP and reuse the synced term's id — keeping these rows inside the
  // whole-term prune's keep-set above.
  try {
    const structure = await getCalendarStructure(school.hubSchoolId)
    const keptHalfTermRowIds: string[] = []
    for (const st of structure.terms ?? []) {
      const halfTerms = [...(st.half_terms ?? [])].sort((a, b) => a.starts_on.localeCompare(b.starts_on))
      if (halfTerms.length < 2) continue // no gap → no break

      const parent = ordered.find((t) => t.startDate <= st.ends_on && t.endDate >= st.starts_on)
      if (!parent) continue // can't tie the break to a synced term → skip
      const term = ordered.indexOf(parent) + 1
      const academicYear = parent.academicYear.replace(/\//g, '-')

      for (let i = 0; i < halfTerms.length - 1; i++) {
        const rawStart = addDaysISO(halfTerms[i].ends_on, 1) // day after a half-term ends
        const rawEnd = addDaysISO(halfTerms[i + 1].starts_on, -1) // day before the next begins
        if (rawEnd < rawStart) continue // adjacent half-terms, no break
        const start = toWeekday(rawStart, 1) // trim onto the school week (Mon–Fri)
        const end = toWeekday(rawEnd, -1)
        if (end < start) continue

        const shared = {
          term,
          termName: parent.name,
          label: `${MONTHS[new Date(`${start}T00:00:00.000Z`).getUTCMonth()]} Half-Term`,
          date: new Date(start),
          endDate: new Date(end),
          type: 'half-term',
          color: 'amber',
          academicYear,
          hubTermId: parent.id,
        }
        // Idempotent on (schoolId, hubTermId, type='half-term', date), mirroring
        // the whole-term find-then-write.
        const existing = await prisma.termDate.findFirst({
          where: { schoolId, hubTermId: parent.id, type: 'half-term', date: new Date(start) },
        })
        const row = existing
          ? await prisma.termDate.update({ where: { id: existing.id }, data: shared })
          : await prisma.termDate.create({ data: { ...shared, schoolId } })
        keptHalfTermRowIds.push(row.id)
        upserted++
      }
    }

    // Prune stale Hub-sourced half-term rows (break dates changed, or Hub removed
    // the half-terms) — never touches manual (hubTermId null) rows.
    await prisma.termDate.deleteMany({
      where: {
        schoolId,
        type: 'half-term',
        hubTermId: { not: null },
        ...(keptHalfTermRowIds.length > 0 ? { id: { notIn: keptHalfTermRowIds } } : {}),
      },
    })
  } catch (err) {
    console.error('[hubTermSync] half-term break sync skipped:', err)
  }

  return { skipped: false, upserted, pruned: prune.count }
}
