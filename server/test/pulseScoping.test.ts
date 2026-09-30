import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Choosing what a pulse asks, and who it goes to.
 *
 * The seven core questions used to be mandatory, so every pulse was eight
 * questions whatever it was for — a "how has the start of the year felt"
 * survey still asked about homework feedback and behaviour expectations, and
 * the length is what stops people answering. And every pulse went to every
 * parent in the school, which is right for a termly temperature check and
 * wrong for most of the reasons a school wants to ask something.
 *
 * THE AUDIENCE IS ALSO THE DENOMINATOR, and that is the part that goes wrong
 * quietly. A survey sent to 30 new parents which scored its 12 replies against
 * 400 families reports a 3% response to something nearly half its audience
 * answered — and a school reading 3% concludes the survey failed and stops
 * sending them.
 */

const prismaMock = {
  user: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  parentStudentLink: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { audienceOf, pulseAudienceParentIds } = await import('../src/services/pulseAudience')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([])
  prismaMock.parentStudentLink.findMany.mockResolvedValue([])
})

describe('reading the audience off a survey', () => {
  it('defaults to the whole school, which is what every existing survey is', async () => {
    expect(audienceOf({ audienceType: 'SCHOOL', audienceGroupId: null, audienceYearGroupIds: [] }))
      .toEqual({ type: 'SCHOOL' })
    // An unrecognised value reads as SCHOOL rather than as nobody: a survey
    // that silently reaches no one is worse than one that reaches everyone,
    // because nothing reports it.
    expect(audienceOf({ audienceType: 'NONSENSE', audienceGroupId: null, audienceYearGroupIds: [] }))
      .toEqual({ type: 'SCHOOL' })
  })

  it('reads a group and a year-group list', () => {
    expect(audienceOf({ audienceType: 'GROUP', audienceGroupId: 'g-1', audienceYearGroupIds: [] }))
      .toEqual({ type: 'GROUP', groupId: 'g-1' })
    expect(audienceOf({ audienceType: 'YEAR_GROUPS', audienceGroupId: null, audienceYearGroupIds: ['yg-6'] }))
      .toEqual({ type: 'YEAR_GROUPS', yearGroupIds: ['yg-6'] })
  })
})

describe('resolving who it reaches', () => {
  it('school-wide asks for every parent, excluding test accounts', async () => {
    // A test account would inflate the denominator and never answer.
    prismaMock.user.findMany.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }])

    const ids = await pulseAudienceParentIds('sch-1', { type: 'SCHOOL' })

    expect(ids).toEqual(['p-1', 'p-2'])
    expect(prismaMock.user.findMany.mock.calls[0][0].where)
      .toEqual({ schoolId: 'sch-1', role: 'PARENT', isTest: false })
  })

  it('a group reaches the parents of its children, deduplicated', async () => {
    // Two children of one family in the same group is one parent, not two —
    // and that parent must not be counted twice in the denominator either.
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { student: { parentLinks: [{ userId: 'mum' }, { userId: 'dad' }] } },
      { student: { parentLinks: [{ userId: 'mum' }, { userId: 'dad' }] } },
    ])

    const ids = await pulseAudienceParentIds('sch-1', { type: 'GROUP', groupId: 'g-1' })

    expect(ids.sort()).toEqual(['dad', 'mum'])
  })

  it('a group that no longer exists reaches NOBODY, not everybody', async () => {
    // THE ONE THAT WOULD SEND A SCOPED SURVEY TO FOUR HUNDRED FAMILIES.
    // Widening an audience because a row vanished is the wrong way to fail.
    const ids = await pulseAudienceParentIds('sch-1', { type: 'GROUP', groupId: null })

    expect(ids).toEqual([])
    expect(prismaMock.studentGroupLink.findMany).not.toHaveBeenCalled()
  })

  it('year groups reach the parents of children in them', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { userId: 'p-1' }, { userId: 'p-2' }, { userId: 'p-1' },
    ])

    const ids = await pulseAudienceParentIds('sch-1', { type: 'YEAR_GROUPS', yearGroupIds: ['yg-6'] })

    expect(ids).toEqual(['p-1', 'p-2'])
    const where = prismaMock.parentStudentLink.findMany.mock.calls[0][0].where
    expect(where.student.class).toEqual({ yearGroupId: { in: ['yg-6'] } })
  })

  it('an empty year-group list reaches nobody', async () => {
    const ids = await pulseAudienceParentIds('sch-1', { type: 'YEAR_GROUPS', yearGroupIds: [] })

    expect(ids).toEqual([])
    expect(prismaMock.parentStudentLink.findMany).not.toHaveBeenCalled()
  })

  it('never counts a child who has left', async () => {
    await pulseAudienceParentIds('sch-1', { type: 'YEAR_GROUPS', yearGroupIds: ['yg-6'] })

    const where = prismaMock.parentStudentLink.findMany.mock.calls[0][0].where
    expect(where.student.leftAt).toBeNull()
    expect(where.student.isTest).toBe(false)
  })

  it('resolves at READ time, so the group can change after sending', async () => {
    // A family joining the new-parents group next week should find the survey
    // waiting; one that leaves should stop being counted against it. A list
    // frozen at send time answers "who was in the group when somebody pressed
    // send", which is not the question anybody asks later.
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { student: { parentLinks: [{ userId: 'joined-later' }] } },
    ])

    const ids = await pulseAudienceParentIds('sch-1', { type: 'GROUP', groupId: 'g-1' })

    expect(ids).toEqual(['joined-later'])
  })
})
