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
import { listTerms } from './hubMis.js'

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
        academicYear: t.academicYear,
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

  return { skipped: false, upserted, pruned: prune.count }
}
