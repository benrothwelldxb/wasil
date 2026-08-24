// Term awareness for the timetable — Hub's timetable pattern repeats every week
// regardless of term, so a holiday/half-term week would otherwise read as a
// normal teaching week. Lives in a service (not the route) because both the
// parent timetable and the inbox contact list need it.
import type { HubCalendarStructure } from './hubMis.js'

/** Out-of-term detection for one viewed week (weekMon..weekFri, YYYY-MM-DD).
 * Teaching periods are the half-terms where a term has them (so half-term breaks
 * also read as out of term), else the whole term. Date-string compare is safe
 * for fixed-width YYYY-MM-DD. */
export function computeTermStatus(
  structure: HubCalendarStructure,
  weekMon: string,
  weekFri: string,
): { outOfTerm: boolean; resumeDate: string | null } {
  const periods = structure.terms.flatMap((t) =>
    t.half_terms?.length
      ? t.half_terms.map((h) => ({ starts_on: h.starts_on, ends_on: h.ends_on }))
      : [{ starts_on: t.starts_on, ends_on: t.ends_on }],
  )
  if (periods.length === 0) return { outOfTerm: false, resumeDate: null }

  const inTerm = periods.some((p) => p.starts_on <= weekFri && p.ends_on >= weekMon)
  if (inTerm) return { outOfTerm: false, resumeDate: null }

  const resumeDate =
    periods
      .filter((p) => p.starts_on > weekFri)
      .map((p) => p.starts_on)
      .sort((a, b) => a.localeCompare(b))[0] ?? null
  return { outOfTerm: true, resumeDate }
}
