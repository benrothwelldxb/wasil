// Who else teaches your child — the specialist teachers behind the parent
// inbox's "new message" contact list.
//
// Connect's StaffClassAssignment mirrors Hub's class `teachers[]`, which is the
// CLASS teacher (and any co-teacher) — not the specialists who take the class
// for PE, music, Arabic, Islamic and so on. Those only ever appear on the
// class's published timetable, so that's where we read them from, reusing the
// same per-class-day cache the timetable pages use (30 min TTL, invalidated by
// Hub's publish webhook) — a parent opening "New message" costs no extra Hub
// traffic once any parent in that class has loaded a timetable.
//
// Hub's timetable teachers carry a NAME ONLY (no id, no email), so they're
// matched to Connect users by normalised name within the school. A name that
// matches two staff is ambiguous and skipped — better a missing contact than a
// message sent to the wrong teacher.
import prisma from './prisma.js'
import { getClassDayCached, getCalendarStructureCached } from './timetableCache.js'
import { computeTermStatus } from './timetableTerms.js'
import type { HubTimetableBlock } from './hubMis.js'

/** Roles a timetable name may resolve to — never a parent or an ILSA. */
const STAFF_ELIGIBLE_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const

/** Can we read timetables at all? Callers use this to skip the Class lookup
 * (and any other prep) when Hub isn't configured or the school isn't linked. */
export function timetableLookupPossible(hubSchoolId: string | null | undefined): hubSchoolId is string {
  return !!process.env.HUB_SERVICE_TOKEN && !!hubSchoolId
}

/** A specialist teacher of one class, resolved to a messageable Connect user. */
export interface ClassTeachingStaff {
  userId: string
  name: string
  avatarUrl: string | null
  /** Distinct subjects they take this class for, in timetable order. */
  subjects: string[]
}

/** Mon–Fri of the week containing `dateISO` (UTC-anchored string arithmetic,
 * matching the timetable route). */
function weekdays(dateISO: string): { monday: string; friday: string; dates: string[] } {
  const anchor = new Date(`${dateISO}T00:00:00.000Z`)
  const dow = anchor.getUTCDay() // 0=Sun … 6=Sat
  const monday = new Date(anchor)
  monday.setUTCDate(anchor.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
  const dates: string[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return { monday: dates[0], friday: dates[4], dates }
}

const HONORIFIC_RE = /^(mr|mrs|ms|miss|mx|dr|prof|sir)\s+/

/** Normalise a person's name for matching: case, punctuation, spacing and a
 * leading honorific all vary between Hub and Connect. */
function normaliseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .replace(HONORIFIC_RE, '')
    .trim()
}

/** Every teacher named on a block — Hub sends a primary plus a full list. */
function blockTeachers(b: HubTimetableBlock): string[] {
  const all = b.teachers?.length ? b.teachers : b.teacher ? [b.teacher] : []
  return all
    .map((t) => `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim())
    .filter((n) => n.length > 0)
}

/** name (normalised) → the one Connect user it identifies. Ambiguous names are
 * dropped, so they simply never resolve. */
async function staffIndex(schoolId: string): Promise<Map<string, { id: string; name: string; avatarUrl: string | null }>> {
  const staff = await prisma.user.findMany({
    where: { schoolId, role: { in: [...STAFF_ELIGIBLE_ROLES] } },
    select: { id: true, name: true, avatarUrl: true },
  })
  const byName = new Map<string, { id: string; name: string; avatarUrl: string | null } | null>()
  for (const u of staff) {
    const key = normaliseName(u.name)
    if (!key) continue
    byName.set(key, byName.has(key) ? null : u) // second hit → ambiguous
  }
  const resolved = new Map<string, { id: string; name: string; avatarUrl: string | null }>()
  for (const [key, u] of byName) if (u) resolved.set(key, u)
  return resolved
}

/**
 * The specialist teachers of each given class, keyed by Connect class id.
 *
 * `excludeUserIds` is the class's existing class teachers — they're already in
 * the contact list, so we don't list them twice.
 *
 * Best-effort by design: no Hub token, no class link, an unpublished timetable
 * or a Hub blip all yield an empty list for that class rather than an error.
 * The contact list must still render.
 */
export async function teachingStaffForClasses(
  schoolId: string,
  classes: ReadonlyArray<{ classId: string; hubClassId: string | null }>,
  opts: { hubSchoolId: string | null; today: string; excludeUserIds?: ReadonlySet<string> },
): Promise<Map<string, ClassTeachingStaff[]>> {
  const out = new Map<string, ClassTeachingStaff[]>()
  const hubSchoolId = opts.hubSchoolId
  const linked = classes.filter((c) => c.hubClassId)
  if (!timetableLookupPossible(hubSchoolId) || linked.length === 0) return out

  // Which week to read? The pattern repeats, so any teaching week describes the
  // same staff — but an out-of-term week (holiday, half-term) has no blocks at
  // all, which would silently empty the list. Sample the week lessons resume in
  // instead. Best-effort: a calendar blip just leaves us on this week.
  let { dates } = weekdays(opts.today)
  try {
    const { monday, friday } = weekdays(opts.today)
    const structure = await getCalendarStructureCached(hubSchoolId)
    const status = computeTermStatus(structure, monday, friday)
    if (status.outOfTerm && status.resumeDate) dates = weekdays(status.resumeDate).dates
  } catch (err) {
    console.error('[classTeachingStaff] term-status lookup failed (using this week):', err)
  }

  const index = await staffIndex(schoolId)
  if (index.size === 0) return out

  for (const cls of linked) {
    // subjects keyed by resolved user, insertion-ordered (Mon→Fri).
    const found = new Map<string, { name: string; avatarUrl: string | null; subjects: string[] }>()
    // Timetable names with no (or an ambiguous) Connect account. Logged once per
    // class so a teacher missing from a parent's contact list is diagnosable —
    // it's almost always a name that doesn't match, not a broken lookup.
    const unmatched = new Set<string>()
    for (const date of dates) {
      let day
      try {
        day = await getClassDayCached(hubSchoolId, cls.hubClassId!, date)
      } catch {
        continue // a day Hub can't answer just contributes nothing
      }
      if (!day) continue
      for (const block of day.blocks) {
        const subject = block.subject?.name?.trim() || block.label?.trim() || null
        for (const rawName of blockTeachers(block)) {
          const user = index.get(normaliseName(rawName))
          if (!user) {
            unmatched.add(rawName)
            continue
          }
          if (opts.excludeUserIds?.has(user.id)) continue
          const entry = found.get(user.id) ?? { name: user.name, avatarUrl: user.avatarUrl, subjects: [] }
          if (subject && !entry.subjects.includes(subject)) entry.subjects.push(subject)
          found.set(user.id, entry)
        }
      }
    }
    if (unmatched.size > 0) {
      console.warn(
        `[classTeachingStaff] class ${cls.classId}: no Connect staff match for ${[...unmatched].join(', ')}`,
      )
    }
    if (found.size === 0) continue
    out.set(
      cls.classId,
      Array.from(found.entries())
        .map(([userId, v]) => ({ userId, name: v.name, avatarUrl: v.avatarUrl, subjects: v.subjects }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
  }

  return out
}
