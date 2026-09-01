// Shared reading of an ECA activity's shape, used by both the provider-portal
// routes that write clubs and the parent-facing routes that show them.

/** eligibleYearGroupIds is a Json column, and older rows written by the admin
 * ECA routes hold a JSON *string* rather than an array. Read both. */
export function parseYearGroupIds(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** A club's times on the clock: its own override, else the term's default for
 * the slot it sits in. Either may be null when the term has no default set. */
export function effectiveTimes(
  a: { timeSlot: string; customStartTime: string | null; customEndTime: string | null },
  term?: {
    defaultBeforeSchoolStart: string | null; defaultBeforeSchoolEnd: string | null
    defaultAfterSchoolStart: string | null; defaultAfterSchoolEnd: string | null
  } | null,
): { startTime: string | null; endTime: string | null } {
  const before = a.timeSlot === 'BEFORE_SCHOOL'
  return {
    startTime: a.customStartTime ?? (before ? term?.defaultBeforeSchoolStart : term?.defaultAfterSchoolStart) ?? null,
    endTime: a.customEndTime ?? (before ? term?.defaultBeforeSchoolEnd : term?.defaultAfterSchoolEnd) ?? null,
  }
}
