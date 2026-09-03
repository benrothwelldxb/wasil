import { describe, it, expect, vi, beforeEach } from 'vitest'

// hubIlsaSync — pull Hub's ILSA roster into Connect (role-ILSA users + IlsaLink
// rows), with the lifecycle sweep that deactivates links Hub unlinked/dropped.
// Prisma + the Hub MIS client are mocked.

const prismaMock = {
  school: { findUnique: vi.fn() },
  user: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  student: { findFirst: vi.fn() },
  ilsaLink: { upsert: vi.fn(), updateMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const misMock = { listIlsas: vi.fn() }
// Only the network call is stubbed. normaliseIlsa is a pure function and runs
// for real, so these tests exercise Hub's actual field shape rather than
// asserting against whatever the fixtures happen to say — which is how the
// wrong shape passed a green suite in the first place.
vi.mock('../src/services/hubMis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/hubMis')>()
  return { ...actual, ...misMock }
})

const { syncIlsasForSchool } = await import('../src/services/hubIlsaSync')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: 'hub-1' })
  prismaMock.ilsaLink.updateMany.mockResolvedValue({ count: 0 })
})

describe('syncIlsasForSchool', () => {
  it('no-op for a school with no hubSchoolId (never calls Hub)', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: null })
    const summary = await syncIlsasForSchool('sch-1')
    expect(misMock.listIlsas).not.toHaveBeenCalled()
    expect(summary.linksActive).toBe(0)
  })

  it('creates a brand-new role-ILSA user and an active link for an active Hub ILSA', async () => {
    misMock.listIlsas.mockResolvedValue([
      // Hub's real shape: a record `id` distinct from `hubUserId`, one `name`,
      // and `pupilIds` as an array.
      { id: 'rec-1', hubUserId: 'hu-ilsa', name: 'Ms Support', email: 'ilsa@x.com', pupilIds: ['hp-1'], active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null) // not linked, no email match
    prismaMock.user.create.mockResolvedValue({ id: 'ilsa-1' })
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })

    const summary = await syncIlsasForSchool('sch-1')

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { email: 'ilsa@x.com', name: 'Ms Support', role: 'ILSA', schoolId: 'sch-1', hubUserId: 'hu-ilsa' },
      select: { id: true },
    })
    expect(prismaMock.ilsaLink.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_studentId: { userId: 'ilsa-1', studentId: 'stu-1' } },
      create: expect.objectContaining({ schoolId: 'sch-1', userId: 'ilsa-1', studentId: 'stu-1', hubPupilId: 'hp-1', active: true }),
      update: { active: true, deactivatedAt: null, hubPupilId: 'hp-1' },
    }))
    expect(summary).toMatchObject({ fetched: 1, created: 1, linksActive: 1 })
    // The sweep excludes the link we just reaffirmed.
    expect(prismaMock.ilsaLink.updateMany.mock.calls[0][0].where).toEqual({
      schoolId: 'sch-1', active: true, id: { notIn: ['link-1'] },
    })
  })

  it('skips an ILSA with no email (can’t back a login)', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'hu-ilsa', firstName: 'No', lastName: 'Email', email: null, pupilId: 'hp-1', active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null)
    const summary = await syncIlsasForSchool('sch-1')
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(summary.skippedNoEmail).toBe(1)
    expect(summary.linksActive).toBe(0)
  })

  it('counts an ILSA whose pupil isn’t synced yet, without linking', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'hu-ilsa', firstName: 'Ms', lastName: 'Support', email: 'ilsa@x.com', pupilId: 'hp-x', active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'ilsa-1' }) // already linked by hubUserId
    prismaMock.user.update.mockResolvedValue({})
    prismaMock.student.findFirst.mockResolvedValue(null) // pupil not synced
    const summary = await syncIlsasForSchool('sch-1')
    expect(prismaMock.ilsaLink.upsert).not.toHaveBeenCalled()
    expect(summary.skippedNoPupil).toBe(1)
  })

  it('deactivates a stale link when Hub returns the ILSA as inactive', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'rec-1', hubUserId: 'hu-ilsa', name: 'Ms Support', email: 'ilsa@x.com', pupilIds: ['hp-1'], active: false },
    ])
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'ilsa-1' }) // linked
    prismaMock.user.update.mockResolvedValue({})
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.updateMany.mockResolvedValue({ count: 1 })

    const summary = await syncIlsasForSchool('sch-1')
    // Inactive ILSA is never upserted active; the sweep deactivates every active
    // link (nothing was reaffirmed → no notIn filter).
    expect(prismaMock.ilsaLink.upsert).not.toHaveBeenCalled()
    expect(prismaMock.ilsaLink.updateMany).toHaveBeenCalledWith({
      where: { schoolId: 'sch-1', active: true },
      data: { active: false, deactivatedAt: expect.any(Date) },
    })
    expect(summary.linksDeactivated).toBe(1)
  })
})

// listIlsas 404-tolerates, so a Hub endpoint that isn't deployed for a school
// arrives here identically to a school that genuinely has no ILSAs: zero. The
// fetched count is what lets an admin tell those apart — without it, "Hub sent
// us nothing" and "we dropped everything Hub sent" look the same on screen.
describe('what Hub actually sent', () => {
  it('reports how many ILSAs came back', async () => {
    misMock.listIlsas.mockResolvedValue([])
    const summary = await syncIlsasForSchool('school-1')
    expect(summary.fetched).toBe(0)
  })
})

/**
 * Hub's real field shape.
 *
 * This file previously asserted against fixtures that carried the same wrong
 * assumption as the DTO — `id` as a user id, a singular `pupilId`, split name
 * fields — so a green suite proved only that the code agreed with itself. These
 * cover what Hub actually sends, and the failure modes the mismatch caused.
 */
describe('Hub ILSA field shape', () => {
  const base = {
    id: 'rec-1',
    hubUserId: 'hu-1',
    name: 'Ms Support',
    email: 'ilsa@x.com',
    pupilIds: ['hp-1'],
    active: true,
  }

  beforeEach(() => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'ilsa-1' })
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })
    prismaMock.ilsaLink.updateMany.mockResolvedValue({ count: 0 })
  })

  // The identity bug: `id` is the ILSA record, `hubUserId` is the SSO subject
  // Desk presents. Storing the former meant nothing could ever resolve.
  it('stores hubUserId, never the record id', async () => {
    misMock.listIlsas.mockResolvedValue([base])

    await syncIlsasForSchool('sch-1')

    const created = prismaMock.user.create.mock.calls[0][0].data
    expect(created.hubUserId).toBe('hu-1')
    expect(created.hubUserId).not.toBe('rec-1')
  })

  it('reads the pupil out of the pupilIds array', async () => {
    misMock.listIlsas.mockResolvedValue([base])
    await syncIlsasForSchool('sch-1')
    expect(prismaMock.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hubPupilId: 'hp-1', schoolId: 'sch-1' } }),
    )
  })

  it('takes the single name field', async () => {
    misMock.listIlsas.mockResolvedValue([base])
    await syncIlsasForSchool('sch-1')
    expect(prismaMock.user.create.mock.calls[0][0].data.name).toBe('Ms Support')
  })

  // Tolerated rather than swapped: this is an unvalidated external shape and
  // guessing wrong once already cost two days.
  it('still accepts the older singular/split spelling', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'rec-1', hubUserId: 'hu-1', firstName: 'Ms', lastName: 'Support', email: 'ilsa@x.com', pupilId: 'hp-1', active: true },
    ])

    await syncIlsasForSchool('sch-1')

    expect(prismaMock.user.create.mock.calls[0][0].data.name).toBe('Ms Support')
    expect(prismaMock.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hubPupilId: 'hp-1', schoolId: 'sch-1' } }),
    )
  })

  // The crash: undefined reached a required column and Prisma rejected it,
  // taking the whole sync down so one bad record looked like an empty roster.
  it('skips a record with no pupil id instead of throwing', async () => {
    misMock.listIlsas.mockResolvedValue([{ ...base, pupilIds: [] }])

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.skippedNoPupilId).toBe(1)
    expect(prismaMock.ilsaLink.upsert).not.toHaveBeenCalled()
  })

  // Hub leaves hubUserId null until first sign-in. A null must never reach the
  // lookup: `where: { hubUserId: null }` matches the first user in the school
  // with none, handing this ILSA someone else's account.
  it('never looks a user up by a null hubUserId', async () => {
    misMock.listIlsas.mockResolvedValue([{ ...base, hubUserId: null }])

    const summary = await syncIlsasForSchool('sch-1')

    for (const call of prismaMock.user.findFirst.mock.calls) {
      expect(call[0].where).not.toHaveProperty('hubUserId')
    }
    // Provisioned and linked, but not resolvable until a later sync has an id.
    expect(summary.withoutHubUserId).toBe(1)
    expect(prismaMock.user.create.mock.calls[0][0].data.hubUserId).toBeUndefined()
  })
})
