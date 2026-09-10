import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A messaging group whose membership belongs to a school service.
 *
 * "Broadcast to everyone in aftercare" needed a group maintained by hand
 * against a list that changes weekly. This one maintains itself — and is
 * recomputed when USED rather than when registrations change, because
 * registrations are written in nine places across three files including the
 * partner API, and a group that is quietly stale is worse than none: you would
 * broadcast to last month's list believing it was current.
 */
const prismaMock = {
  group: { findUnique: vi.fn(), findMany: vi.fn() },
  serviceRegistration: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { refreshServiceGroup, refreshServiceGroupsForSchool } = await import('../src/services/serviceGroups')

const serviceGroup = (over: Record<string, unknown> = {}) => ({
  id: 'g-1', schoolId: 'sch-1', sourceServiceId: 'svc-1', sourceYearGroupId: null, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.group.findUnique.mockResolvedValue(serviceGroup())
  prismaMock.serviceRegistration.findMany.mockResolvedValue([{ studentId: 's-1' }, { studentId: 's-2' }])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([])
  prismaMock.studentGroupLink.createMany.mockResolvedValue({ count: 0 })
  prismaMock.studentGroupLink.deleteMany.mockResolvedValue({ count: 0 })
})

describe('refreshing a service group', () => {
  it('adds the children with a confirmed place', async () => {
    const r = await refreshServiceGroup('g-1')

    expect(r).toEqual({ added: 2, removed: 0, members: 2 })
    expect(prismaMock.studentGroupLink.createMany).toHaveBeenCalledWith({
      data: [{ studentId: 's-1', groupId: 'g-1' }, { studentId: 's-2', groupId: 'g-1' }],
      skipDuplicates: true,
    })
  })

  // A message saying "aftercare is in the hall on Tuesday" is true for exactly
  // the children who have a place. A family still waiting on one would read it
  // as confirmation they have it.
  it('asks only for CONFIRMED registrations, scoped to this school', async () => {
    await refreshServiceGroup('g-1')
    expect(prismaMock.serviceRegistration.findMany).toHaveBeenCalledWith({
      where: { serviceId: 'svc-1', status: 'CONFIRMED', service: { schoolId: 'sch-1' } },
      select: { studentId: true },
    })
  })

  it('removes a child whose place has gone', async () => {
    prismaMock.studentGroupLink.findMany.mockResolvedValue([{ studentId: 's-1' }, { studentId: 's-gone' }])

    const r = await refreshServiceGroup('g-1')

    expect(r).toMatchObject({ added: 1, removed: 1, members: 2 })
    expect(prismaMock.studentGroupLink.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'g-1', studentId: { in: ['s-gone'] } },
    })
  })

  it('does nothing at all when membership already matches', async () => {
    prismaMock.studentGroupLink.findMany.mockResolvedValue([{ studentId: 's-1' }, { studentId: 's-2' }])

    const r = await refreshServiceGroup('g-1')

    expect(r).toMatchObject({ added: 0, removed: 0 })
    expect(prismaMock.studentGroupLink.createMany).not.toHaveBeenCalled()
    expect(prismaMock.studentGroupLink.deleteMany).not.toHaveBeenCalled()
  })

  // An ordinary group's membership is nobody's to recompute, and silently
  // emptying one would be a spectacular way to fail.
  it('leaves an ordinary group completely alone', async () => {
    prismaMock.group.findUnique.mockResolvedValue(serviceGroup({ sourceServiceId: null }))

    const r = await refreshServiceGroup('g-1')

    expect(r).toBeNull()
    expect(prismaMock.studentGroupLink.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.studentGroupLink.createMany).not.toHaveBeenCalled()
  })

  it('leaves a group that does not exist alone', async () => {
    prismaMock.group.findUnique.mockResolvedValue(null)
    expect(await refreshServiceGroup('nope')).toBeNull()
    expect(prismaMock.studentGroupLink.deleteMany).not.toHaveBeenCalled()
  })

  describe('narrowed to a year group', () => {
    beforeEach(() => {
      prismaMock.group.findUnique.mockResolvedValue(serviceGroup({ sourceYearGroupId: 'yg-fs' }))
      prismaMock.student.findMany.mockResolvedValue([{ id: 's-1' }])
    })

    it('keeps only the children in that year group', async () => {
      const r = await refreshServiceGroup('g-1')
      expect(r).toMatchObject({ added: 1, members: 1 })
      expect(prismaMock.studentGroupLink.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ studentId: 's-1', groupId: 'g-1' }] }),
      )
    })

    // The registration's className is a snapshot of when they signed up; a
    // child who moves up a year is in the new one.
    it('filters on the pupil’s CURRENT class, not the one on the registration', async () => {
      await refreshServiceGroup('g-1')
      expect(prismaMock.student.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['s-1', 's-2'] }, schoolId: 'sch-1', class: { yearGroupId: 'yg-fs' } },
        select: { id: true },
      })
    })
  })

  it('deduplicates a student registered twice', async () => {
    prismaMock.serviceRegistration.findMany.mockResolvedValue([
      { studentId: 's-1' }, { studentId: 's-1' },
    ])
    const r = await refreshServiceGroup('g-1')
    expect(r).toMatchObject({ added: 1, members: 1 })
  })
})

describe('refreshing every service group in a school', () => {
  it('touches only service groups, and only active ones', async () => {
    prismaMock.group.findMany.mockResolvedValue([])
    await refreshServiceGroupsForSchool('sch-1')
    expect(prismaMock.group.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'sch-1', isActive: true, NOT: { sourceServiceId: null } },
      select: { id: true },
    })
  })

  // A slightly stale audience is a worse message. A failed send is no message
  // at all, and this runs on the way to sending one.
  it('never throws, so a refresh failure cannot stop a school sending', async () => {
    prismaMock.group.findMany.mockRejectedValue(new Error('database on fire'))
    await expect(refreshServiceGroupsForSchool('sch-1')).resolves.toBeUndefined()
  })
})
