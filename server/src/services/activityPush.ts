import { EcaActivityType, EcaGender, EcaTimeSlot } from '@prisma/client'

/**
 * Mapping for a catalogue activity published into Connect by an outside system.
 *
 * Connect displays these; it does not run the choice or the allocation. The
 * publisher's vocabulary and ours differ in a few places, and most of the ways
 * this can go wrong are quiet ones — a value that maps to something plausible
 * and wrong reads as data rather than as a bug. The mappings that carry a
 * decision are pure functions here so they can be tested without a database.
 */

export interface PushedMeeting {
  dayOfWeek: number
  startTime: string
  endTime: string
}

/**
 * Times arrive as "15:30" school-local, which is how the school writes them and
 * how a parent reads them. Deliberately not converted to an instant: an
 * activity meets at half three whatever the offset does in October.
 */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export function normaliseMeetings(raw: unknown): PushedMeeting[] {
  if (!Array.isArray(raw)) return []
  const out: PushedMeeting[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue
    const { dayOfWeek, startTime, endTime } = m as Record<string, unknown>
    if (typeof dayOfWeek !== 'number' || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue
    if (typeof startTime !== 'string' || !TIME.test(startTime)) continue
    if (typeof endTime !== 'string' || !TIME.test(endTime)) continue
    out.push({ dayOfWeek, startTime, endTime })
  }
  return out
}

/**
 * Before or after school, inferred from the start time because the publisher
 * has no such concept and Connect's screens group by it.
 *
 * Noon is the split. It is a guess, but a legible one: nothing in a school's
 * day makes an 11am club "after school", and the alternative — defaulting
 * everything to AFTER_SCHOOL — puts breakfast clubs in the wrong list.
 */
export function timeSlotFor(startTime: string): EcaTimeSlot {
  const hour = Number(startTime.slice(0, 2))
  return hour < 12 ? EcaTimeSlot.BEFORE_SCHOOL : EcaTimeSlot.AFTER_SCHOOL
}

export function genderFor(raw: unknown): EcaGender {
  switch (typeof raw === 'string' ? raw.trim().toLowerCase() : '') {
    case 'boys': return EcaGender.BOYS_ONLY
    case 'girls': return EcaGender.GIRLS_ONLY
    // An unrecognised value means mixed. Narrowing a club to one gender on a
    // word we don't understand would exclude children; widening it doesn't.
    default: return EcaGender.MIXED
  }
}

export function activityTypeFor(inviteOnly: unknown): EcaActivityType {
  return inviteOnly === true ? EcaActivityType.INVITE_ONLY : EcaActivityType.OPEN
}

/**
 * Capacity, where 0 means "no limit" on the publisher's side and null means it
 * here.
 *
 * This is the mapping most likely to cause real harm if skipped. Stored as 0,
 * a club with no limit reads as a club with no places, and Connect would tell a
 * parent it was full — a wrong answer that looks exactly like a right one.
 */
export function capacityFor(raw: unknown): { minCapacity: number | null; maxCapacity: number | null } {
  const c = (raw ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null)
  return { minCapacity: num(c.min), maxCapacity: num(c.max) }
}

/**
 * `published` or `withdrawn`.
 *
 * Withdrawn is not a delete and not a hide. A parent who already saw the club
 * on Monday and finds it simply gone on Tuesday learns nothing; one who finds
 * it marked cancelled learns what happened. So it stays visible and says so —
 * the same rule the inbox follows for a withdrawn message.
 */
export function statusFor(raw: unknown): { isPublished: boolean; isCancelled: boolean; isActive: boolean } {
  const withdrawn = typeof raw === 'string' && raw.trim().toLowerCase() === 'withdrawn'
  return { isPublished: true, isCancelled: withdrawn, isActive: true }
}

/**
 * The version we compare against what we last accepted.
 *
 * Returns null for anything unparseable rather than falling back to "now" — a
 * bad timestamp treated as current would accept a stale retry over a newer
 * publish, which is the exact failure the version exists to prevent.
 */
export function parseVersion(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Strictly newer wins; equal is a no-op, so a retry that recomputes to the
 *  same state costs nothing and cannot revert a later edit. */
export function isNewer(incoming: Date, accepted: Date | null | undefined): boolean {
  return !accepted || incoming.getTime() > accepted.getTime()
}

export interface PushedYearGroup {
  ordinal?: number
  hubYearGroupId?: string
  name?: string
}

/**
 * Year groups arrive as triples so we never have to infer "Year 3" from a
 * number in a school where FS1 is -1.
 *
 * We join on hubYearGroupId today. The ordinal is carried but not yet trusted:
 * it should survive a rollover better than an id, and that is worth proving on
 * real data before relying on it.
 *
 * An empty list means open to every year group, NOT open to none — the
 * difference between "anyone may come" and "nobody may".
 */
export function hubYearGroupIdsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(y => (y && typeof y === 'object' ? (y as PushedYearGroup).hubYearGroupId : undefined))
    .filter((id): id is string => typeof id === 'string' && !!id.trim())
    .map(id => id.trim())
}
