// Who a pulse survey is for.
//
// A pulse used to go to every parent in the school, always. That is right for a
// termly temperature check and wrong for most of the reasons a school actually
// wants to ask something: how the start of the year has felt for the families
// who just joined, how Year 6 found the transition work, whether the new
// pick-up arrangement is working for the people it affects.
//
// THE AUDIENCE IS ALSO THE DENOMINATOR, and that is the part that is easy to
// get wrong quietly. A survey sent to 30 new parents which scored its 12
// replies against the whole school would report a 3% response to something
// nearly half its audience answered — and a school reading 3% concludes the
// survey failed and stops sending them.
import prisma from './prisma.js'

export type PulseAudience =
  | { type: 'SCHOOL' }
  | { type: 'GROUP'; groupId: string | null }
  | { type: 'YEAR_GROUPS'; yearGroupIds: string[] }

export function audienceOf(pulse: {
  audienceType: string
  audienceGroupId: string | null
  audienceYearGroupIds: string[]
}): PulseAudience {
  if (pulse.audienceType === 'GROUP') return { type: 'GROUP', groupId: pulse.audienceGroupId }
  if (pulse.audienceType === 'YEAR_GROUPS') {
    return { type: 'YEAR_GROUPS', yearGroupIds: pulse.audienceYearGroupIds || [] }
  }
  return { type: 'SCHOOL' }
}

/**
 * The parent ids this survey is for.
 *
 * Resolved at read time rather than stored at send time, deliberately: a family
 * that joins the new-parents group next week should find the survey waiting,
 * and one that leaves should stop being counted against it. A frozen list would
 * quietly answer "who was in the group when somebody pressed send", which is
 * not the question anybody asks later.
 *
 * Test accounts are excluded everywhere — they would inflate the denominator
 * and never answer.
 */
export async function pulseAudienceParentIds(
  schoolId: string,
  audience: PulseAudience,
): Promise<string[]> {
  if (audience.type === 'SCHOOL') {
    const parents = await prisma.user.findMany({
      where: { schoolId, role: 'PARENT', isTest: false },
      select: { id: true },
    })
    return parents.map(p => p.id)
  }

  if (audience.type === 'GROUP') {
    // A group with no id — deleted since the survey was made — is nobody
    // rather than everybody. Widening an audience because a row vanished is
    // the kind of failure that sends a survey to four hundred families.
    if (!audience.groupId) return []
    const links = await prisma.studentGroupLink.findMany({
      where: { groupId: audience.groupId, student: { schoolId, leftAt: null, isTest: false } },
      select: { student: { select: { parentLinks: { select: { userId: true } } } } },
    })
    return [...new Set(links.flatMap(l => l.student.parentLinks.map(p => p.userId)))]
  }

  if (audience.yearGroupIds.length === 0) return []
  const links = await prisma.parentStudentLink.findMany({
    where: {
      student: {
        schoolId,
        leftAt: null,
        isTest: false,
        class: { yearGroupId: { in: audience.yearGroupIds } },
      },
    },
    select: { userId: true },
  })
  return [...new Set(links.map(l => l.userId))]
}

/** Is this parent in the audience? Asked on the parent's own list, so a survey
 *  they are not part of never appears — rather than appearing and refusing. */
export async function isInPulseAudience(
  parentUserId: string,
  schoolId: string,
  audience: PulseAudience,
): Promise<boolean> {
  if (audience.type === 'SCHOOL') return true
  const ids = await pulseAudienceParentIds(schoolId, audience)
  return ids.includes(parentUserId)
}
