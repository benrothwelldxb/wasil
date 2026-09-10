import prisma from './prisma.js'

/**
 * Keeping a service-derived group true.
 *
 * A group marked with `sourceServiceId` means "the children currently in this
 * service", optionally narrowed to one year group. Its membership is recomputed
 * here rather than maintained as registrations change, for a specific reason:
 * registrations are written in nine places across three files, including the
 * partner API when Accounts confirm a place or take a payment in Desk. Hooking
 * all nine would work until somebody added a tenth, and the failure mode is a
 * group that looks fine and quietly holds last month's list — you would
 * broadcast to the wrong families believing you had the right ones.
 *
 * So it is refreshed at the moment it is used. It can never be more stale than
 * the send that reads it.
 */

/**
 * CONFIRMED only.
 *
 * Not pending, not waitlisted, not cancelled. A message saying "aftercare is in
 * the hall on Tuesday" is true for exactly the children who have a place; a
 * family still waiting on one would reasonably read it as confirmation they
 * have it.
 *
 * Payment deliberately does NOT gate membership: a confirmed child whose parent
 * has not settled up yet is still coming on Tuesday, and Accounts marking an
 * invoice in Desk should not be the thing that decides whether a parent hears
 * about a room change.
 */
const MEMBER_STATUS = 'CONFIRMED' as const

export interface ServiceGroupRefresh {
  added: number
  removed: number
  members: number
}

/**
 * Recompute one service group's membership. Returns what changed, so a caller
 * can say so rather than refreshing invisibly.
 */
export async function refreshServiceGroup(groupId: string): Promise<ServiceGroupRefresh | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, schoolId: true, sourceServiceId: true, sourceYearGroupId: true },
  })
  // Not a service group — an ordinary group's membership is nobody's to
  // recompute, and silently emptying one would be a spectacular way to fail.
  if (!group?.sourceServiceId) return null

  const registrations = await prisma.serviceRegistration.findMany({
    where: {
      serviceId: group.sourceServiceId,
      status: MEMBER_STATUS,
      // The service belongs to this school; the guard is here anyway because a
      // group quietly gathering another school's children is the one mistake
      // this must not make.
      service: { schoolId: group.schoolId },
    },
    select: { studentId: true },
  })

  let studentIds = [...new Set(registrations.map(r => r.studentId))]

  if (group.sourceYearGroupId && studentIds.length > 0) {
    // Narrowed by the pupil's CURRENT class, not the class recorded on the
    // registration: a child who moves up a year is in the new one, and the
    // registration's `className` is a snapshot of when they signed up.
    const inYear = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId: group.schoolId,
        class: { yearGroupId: group.sourceYearGroupId },
      },
      select: { id: true },
    })
    studentIds = inYear.map(s => s.id)
  }

  const existing = await prisma.studentGroupLink.findMany({
    where: { groupId: group.id },
    select: { studentId: true },
  })
  const have = new Set(existing.map(l => l.studentId))
  const want = new Set(studentIds)

  const toAdd = studentIds.filter(id => !have.has(id))
  const toRemove = [...have].filter(id => !want.has(id))

  if (toAdd.length > 0) {
    await prisma.studentGroupLink.createMany({
      data: toAdd.map(studentId => ({ studentId, groupId: group.id })),
      skipDuplicates: true,
    })
  }
  if (toRemove.length > 0) {
    await prisma.studentGroupLink.deleteMany({
      where: { groupId: group.id, studentId: { in: toRemove } },
    })
  }

  return { added: toAdd.length, removed: toRemove.length, members: want.size }
}

/**
 * Refresh every service group in a school.
 *
 * Called before an audience is resolved, so a post or message targeting one is
 * addressed to who is in the service now — not who was in it when somebody last
 * opened the groups page.
 *
 * Deliberately best-effort: a refresh that throws must not stop a school
 * sending a message. A slightly stale audience is a worse message; a failed
 * send is no message at all.
 */
export async function refreshServiceGroupsForSchool(schoolId: string): Promise<void> {
  try {
    const groups = await prisma.group.findMany({
      where: { schoolId, isActive: true, NOT: { sourceServiceId: null } },
      select: { id: true },
    })
    for (const g of groups) await refreshServiceGroup(g.id)
  } catch (error) {
    console.error('[serviceGroups] refresh failed for school', schoolId, error)
  }
}
