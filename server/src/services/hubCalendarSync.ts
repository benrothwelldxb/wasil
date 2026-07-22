// Wasil Hub calendar sync (Stage 4 / Phase A) — pull Hub's school calendar and
// mirror it into Connect's Event table, one-way and read-only.
//
// Hub owns the calendar. Every Hub CalendarEvent is upserted into a Connect
// Event keyed on `hubCalendarEventId` (idempotent — a re-run updates the same
// row, never duplicates). The presence of `hubCalendarEventId` is the read-only
// marker: the events route refuses PUT/DELETE on such rows (edit in Hub).
//
// Cohort → targeting: Hub events can target several year-groups/classes, so we
// extend Connect's Event to multi-target via EventTarget rows.
//   - cohort `{whole_school:true}` (or absent)  → no EventTarget rows,
//     targetClass = 'Whole School'.
//   - cohort with year-group / class **names**  → resolve each to a Connect
//     YearGroup / Class (hub-linked row's name, else plain name match) and
//     write one EventTarget row per resolved target. Unresolved names are
//     skipped and logged — never fatal.
//
// Dormant + scope-gated: if HUB_SERVICE_TOKEN is unset, the school isn't
// Hub-linked, or the calendar isn't available to this token (no `calendar:read`
// scope → the client returns null), this is a clean no-op that NEVER throws.

import prisma from './prisma.js'
import { getEvents, type CalendarEventDTO, type CalendarCohort } from './hubCalendar.js'

export interface CalendarSyncSummary {
  /** True when nothing ran (dormant): no token, unlinked school, or no scope. */
  skipped: boolean
  reason?: 'no_service_token' | 'school_not_linked' | 'calendar_unavailable'
  /** Hub events upserted into Connect Events. */
  upserted: number
  /** EventTarget rows written across all events (resolved cohort targets). */
  targetsResolved: number
  /** Cohort targets whose name didn't resolve to a Connect class/year-group. */
  targetsSkipped: number
  /** The /changes cursor persisted for this school (null if Hub sent none). */
  cursor: number | null
}

/** A default forward-looking window when a caller (webhook) has none: from a
 * month ago through ~13 months out (Hub windows are ≤400 days). */
export function defaultCalendarWindow(): { from: string; to: string } {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - 30)
  const to = new Date()
  to.setUTCDate(to.getUTCDate() + 395)
  return { from: day(from), to: day(to) }
}

/**
 * Pull a window of the Hub calendar for one Connect school and upsert it.
 * Idempotent, keyed on `hubCalendarEventId`. Dormant (no-op, never throws) when
 * the token is unset, the school isn't Hub-linked, or the calendar isn't
 * available to this token.
 */
export async function syncCalendar(
  connectSchoolId: string,
  window: { from: string; to: string },
): Promise<CalendarSyncSummary> {
  const empty = (
    reason: CalendarSyncSummary['reason'],
  ): CalendarSyncSummary => ({
    skipped: true,
    reason,
    upserted: 0,
    targetsResolved: 0,
    targetsSkipped: 0,
    cursor: null,
  })

  // Dormant: token entirely unset — don't even resolve the school.
  if (!process.env.HUB_SERVICE_TOKEN) return empty('no_service_token')

  const school = await prisma.school.findUnique({ where: { id: connectSchoolId } })
  if (!school || !school.hubSchoolId) return empty('school_not_linked')

  // Windowed pull. `null` = 404/no-scope → dormant.
  const res = await getEvents(school.hubSchoolId, window.from, window.to)
  if (!res) return empty('calendar_unavailable')

  // Resolve the school's classes + year-groups once, by name (Hub cohort carries
  // names). Lowercased for a tolerant match.
  const [classes, yearGroups] = await Promise.all([
    prisma.class.findMany({ where: { schoolId: school.id }, select: { id: true, name: true } }),
    prisma.yearGroup.findMany({ where: { schoolId: school.id }, select: { id: true, name: true } }),
  ])
  const classByName = new Map<string, string>()
  for (const c of classes) classByName.set(c.name.trim().toLowerCase(), c.id)
  const ygByName = new Map<string, string>()
  for (const y of yearGroups) ygByName.set(y.name.trim().toLowerCase(), y.id)

  let upserted = 0
  let targetsResolved = 0
  let targetsSkipped = 0

  for (const dto of res.events) {
    const resolved = resolveCohort(dto.cohort, classByName, ygByName)
    targetsSkipped += resolved.skipped

    const { date, time } = localDateTime(dto.starts_at, school.timezone, dto.all_day)

    // A single resolved target still populates the legacy scalar column so
    // single-target Connect callers/consumers keep working; multi-target leaves
    // the scalars null (ambiguous) and relies on EventTarget rows.
    const single = resolved.targets.length === 1 ? resolved.targets[0] : null

    const data = {
      title: dto.title,
      description: dto.description ?? null,
      date,
      time,
      location: dto.location ?? null,
      targetClass: resolved.label,
      classId: single?.classId ?? null,
      yearGroupId: single?.yearGroupId ?? null,
    }

    const event = await prisma.event.upsert({
      where: { hubCalendarEventId: dto.id },
      create: { ...data, hubCalendarEventId: dto.id, schoolId: school.id },
      update: data,
    })
    upserted++

    // Replace this event's targets so a Hub-side cohort change is reflected.
    await prisma.eventTarget.deleteMany({ where: { eventId: event.id } })
    if (resolved.targets.length > 0) {
      await prisma.eventTarget.createMany({
        data: resolved.targets.map((t) => ({ eventId: event.id, ...t })),
      })
      targetsResolved += resolved.targets.length
    }
  }

  // Persist the incremental cursor for the next /changes pull.
  const cursor = res.cursor ?? null
  if (cursor !== null) {
    await prisma.school.update({
      where: { id: school.id },
      data: { hubCalendarCursor: cursor },
    })
  }

  return { skipped: false, upserted, targetsResolved, targetsSkipped, cursor }
}

/** Convenience for the webhook: resync a school over the default window. Always
 * dormant-safe — swallows the "not linked / no scope" cases via syncCalendar. */
export async function resyncCalendarForSchool(
  connectSchoolId: string,
): Promise<CalendarSyncSummary> {
  return syncCalendar(connectSchoolId, defaultCalendarWindow())
}

interface ResolvedTarget {
  classId: string | null
  yearGroupId: string | null
}

/** Map a Hub cohort to Connect EventTarget rows + a human display label. */
function resolveCohort(
  cohort: CalendarCohort | undefined,
  classByName: Map<string, string>,
  ygByName: Map<string, string>,
): { targets: ResolvedTarget[]; label: string; skipped: number } {
  // Absent cohort or explicit whole-school → no targets.
  if (!cohort || 'whole_school' in cohort) {
    return { targets: [], label: 'Whole School', skipped: 0 }
  }

  const targets: ResolvedTarget[] = []
  const resolvedNames: string[] = []
  const rawNames: string[] = []
  let skipped = 0

  for (const name of cohort.year_groups ?? []) {
    rawNames.push(name)
    const id = ygByName.get(name.trim().toLowerCase())
    if (id) {
      targets.push({ classId: null, yearGroupId: id })
      resolvedNames.push(name)
    } else {
      skipped++
      console.warn(`[hubCalendarSync] unresolved year-group cohort target: "${name}"`)
    }
  }
  for (const name of cohort.classes ?? []) {
    rawNames.push(name)
    const id = classByName.get(name.trim().toLowerCase())
    if (id) {
      targets.push({ classId: id, yearGroupId: null })
      resolvedNames.push(name)
    } else {
      skipped++
      console.warn(`[hubCalendarSync] unresolved class cohort target: "${name}"`)
    }
  }

  // Label prefers the names we actually resolved; falls back to the raw cohort
  // names (so an all-unresolved event still shows intent), then whole-school.
  const label =
    (resolvedNames.length ? resolvedNames : rawNames).join(', ') || 'Whole School'
  return { targets, label, skipped }
}

/** Split a Hub `starts_at` instant into Connect's stored `date` (midnight-UTC of
 * the school-local calendar date) + `time` ('HH:MM', or null for all-day). */
function localDateTime(
  iso: string,
  timezone: string,
  allDay: boolean,
): { date: Date; time: string | null } {
  let dateStr: string
  let time: string
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date(iso))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    dateStr = `${get('year')}-${get('month')}-${get('day')}`
    const hour = get('hour') === '24' ? '00' : get('hour')
    time = `${hour}:${get('minute')}`
  } catch {
    const d = new Date(iso)
    dateStr = d.toISOString().slice(0, 10)
    time = d.toISOString().slice(11, 16)
  }
  return { date: new Date(dateStr), time: allDay ? null : time }
}
