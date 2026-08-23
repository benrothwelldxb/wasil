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
vi.mock('../src/services/hubMis', () => misMock)

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
      { id: 'hu-ilsa', firstName: 'Ms', lastName: 'Support', email: 'ilsa@x.com', pupilId: 'hp-1', active: true },
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
    expect(summary).toMatchObject({ created: 1, linksActive: 1 })
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
      { id: 'hu-ilsa', firstName: 'Ms', lastName: 'Support', email: 'ilsa@x.com', pupilId: 'hp-1', active: false },
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
