import { describe, it, expect, vi, beforeEach } from 'vitest'

// Exercise the Hub MIS sync with the data layer and the MIS read-client mocked,
// so no database and no live Hub are needed. We assert the *contract*: upserts
// keyed on Hub ids (idempotent), foreign keys resolved in dependency order
// (year-group → class → pupil), and staff email-fallback linking that never
// rewrites an existing user's Connect role.
const prismaMock = {
  school: { findUnique: vi.fn(), update: vi.fn() },
  yearGroup: { upsert: vi.fn(), create: vi.fn() },
  class: { upsert: vi.fn(), create: vi.fn() },
  student: { upsert: vi.fn(), create: vi.fn() },
  user: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  parentStudentLink: { upsert: vi.fn(), create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

// Mock the MIS client entirely — each endpoint is a vi.fn we drive per test.
vi.mock('../src/services/hubMis', () => ({
  listYearGroups: vi.fn(),
  listClasses: vi.fn(),
  listPupils: vi.fn(),
  listStaff: vi.fn(),
  listGuardians: vi.fn(),
}))

const {
  listYearGroups,
  listClasses,
  listPupils,
  listStaff,
  listGuardians,
} = await import('../src/services/hubMis')
const { syncSchoolFromHub, SchoolNotLinkedError } = await import('../src/services/hubSync')

const mYearGroups = vi.mocked(listYearGroups)
const mClasses = vi.mocked(listClasses)
const mPupils = vi.mocked(listPupils)
const mStaff = vi.mocked(listStaff)
const mGuardians = vi.mocked(listGuardians)

// A Hub-linked Connect school.
const SCHOOL = { id: 'connect-school-1', hubSchoolId: 'hub-school-1' }

beforeEach(() => {
  vi.clearAllMocks()

  prismaMock.school.findUnique.mockResolvedValue(SCHOOL)
  prismaMock.school.update.mockResolvedValue(SCHOOL)

  // Upserts echo back a Connect id derived from the Hub id so FK resolution is
  // observable (a class's create.yearGroupId must equal the yg upsert's id).
  prismaMock.yearGroup.upsert.mockImplementation(async ({ where }: any) => ({
    id: 'cyg-' + where.hubYearGroupId,
  }))
  prismaMock.class.upsert.mockImplementation(async ({ where }: any) => ({
    id: 'cc-' + where.hubClassId,
  }))
  prismaMock.student.upsert.mockImplementation(async ({ where }: any) => ({
    id: 'cs-' + where.hubPupilId,
  }))

  // Default roster: one year group, one class in it, one pupil in that class,
  // no staff. Individual tests override.
  mYearGroups.mockResolvedValue([{ id: 'hyg1', name: 'Year 1', ordinal: 1 }])
  mClasses.mockResolvedValue([
    { id: 'hc1', name: '1A', yearGroupId: 'hyg1', yearGroupName: 'Year 1' },
  ])
  mPupils.mockImplementation(async (_schoolId: string, opts: any = {}) =>
    opts.classId === 'hc1'
      ? [{ id: 'hp1', firstName: 'Amina', lastName: 'Khan', className: '1A', yearGroupName: 'Year 1' }]
      : [],
  )
  mStaff.mockResolvedValue([])
  // Dormant by default: Hub holds 0 guardians (the current live state).
  mGuardians.mockResolvedValue([])
  prismaMock.parentStudentLink.upsert.mockResolvedValue({ id: 'psl-1' })
})

describe('syncSchoolFromHub — dependency ordering + mapping', () => {
  it('upserts year-group → class → pupil, resolving each foreign key from the prior tier', async () => {
    const summary = await syncSchoolFromHub('connect-school-1')

    // Year group keyed on hubYearGroupId; ordinal → order.
    expect(prismaMock.yearGroup.upsert).toHaveBeenCalledWith({
      where: { hubYearGroupId: 'hyg1' },
      create: { hubYearGroupId: 'hyg1', name: 'Year 1', order: 1, schoolId: 'connect-school-1' },
      update: { name: 'Year 1', order: 1 },
    })

    // Class keyed on hubClassId; its yearGroupId resolves to the Connect
    // year-group id produced by the year-group upsert (not the Hub id).
    expect(prismaMock.class.upsert).toHaveBeenCalledWith({
      where: { hubClassId: 'hc1' },
      create: { hubClassId: 'hc1', name: '1A', schoolId: 'connect-school-1', yearGroupId: 'cyg-hyg1' },
      update: { name: '1A', yearGroupId: 'cyg-hyg1' },
    })

    // Pupils are fetched per Hub class, and the pupil's classId resolves to the
    // Connect class id produced by the class upsert.
    expect(mPupils).toHaveBeenCalledWith('hub-school-1', { classId: 'hc1' })
    expect(prismaMock.student.upsert).toHaveBeenCalledWith({
      where: { hubPupilId: 'hp1' },
      create: {
        hubPupilId: 'hp1',
        firstName: 'Amina',
        lastName: 'Khan',
        schoolId: 'connect-school-1',
        classId: 'cc-hc1',
      },
      update: { firstName: 'Amina', lastName: 'Khan', classId: 'cc-hc1' },
    })

    expect(summary).toEqual({
      yearGroups: 1,
      classes: 1,
      pupils: 1,
      staff: { created: 0, updated: 0 },
      guardians: { created: 0, linked: 0, skippedNoEmail: 0 },
      parentLinks: { created: 0, skippedNoPupil: 0 },
    })

    // On success the school is marked fresh.
    expect(prismaMock.school.update).toHaveBeenCalledWith({
      where: { id: 'connect-school-1' },
      data: { hubLastSyncedAt: expect.any(Date), hubDataStaleSince: null },
    })
  })
})

describe('syncSchoolFromHub — idempotency', () => {
  it('re-upserts by Hub id on a second run and never raw-creates a duplicate', async () => {
    await syncSchoolFromHub('connect-school-1')
    await syncSchoolFromHub('connect-school-1')

    // Same keyed upserts, once per run — never inserts a second row.
    expect(prismaMock.yearGroup.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.class.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.student.upsert).toHaveBeenCalledTimes(2)
    for (const call of prismaMock.student.upsert.mock.calls) {
      expect((call[0] as any).where).toEqual({ hubPupilId: 'hp1' })
    }

    // Idempotency comes from upsert keying — bare creates are never used for
    // Hub-keyed rows, so a second run can't duplicate anything.
    expect(prismaMock.yearGroup.create).not.toHaveBeenCalled()
    expect(prismaMock.class.create).not.toHaveBeenCalled()
    expect(prismaMock.student.create).not.toHaveBeenCalled()
  })
})

describe('syncSchoolFromHub — staff linking', () => {
  it('email-fallback links a pre-existing staff user without clobbering its role', async () => {
    // Pending-invite staff (no Hub user id yet); Hub says SCHOOL_ADMIN.
    mStaff.mockResolvedValue([
      {
        id: 'hs1',
        firstName: 'Sara',
        lastName: 'Bell',
        email: 'Sara.Bell@school.ae',
        jobTitle: 'Teacher',
        hubUserId: null,
        globalRoles: ['SCHOOL_ADMIN'],
        isInviteAccepted: false,
      },
    ])
    // A pre-existing Connect staff account matched by (lowercased) email; its
    // Connect role is STAFF and must stay STAFF.
    prismaMock.user.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.email === 'sara.bell@school.ae') {
        return { id: 'cu-sara', role: 'STAFF', schoolId: 'connect-school-1', email: 'sara.bell@school.ae', hubUserId: null }
      }
      return null
    })

    const summary = await syncSchoolFromHub('connect-school-1')

    const updateArg = prismaMock.user.update.mock.calls[0][0] as any
    expect(updateArg.where).toEqual({ id: 'cu-sara' })
    // Profile refreshed, but role is NOT in the update payload (no clobber).
    expect(updateArg.data.name).toBe('Sara Bell')
    expect(updateArg.data.position).toBe('Teacher')
    expect(updateArg.data).not.toHaveProperty('role')
    // No hubUserId to link (Hub had none), and never auto-created.
    expect(updateArg.data).not.toHaveProperty('hubUserId')
    expect(prismaMock.user.create).not.toHaveBeenCalled()

    expect(summary.staff).toEqual({ created: 0, updated: 1 })
  })

  it('creates a brand-new staff user with a role mapped from Hub global roles', async () => {
    mStaff.mockResolvedValue([
      {
        id: 'hs2',
        firstName: 'Omar',
        lastName: 'Said',
        email: 'omar.said@school.ae',
        jobTitle: 'Head of School',
        hubUserId: 'hub-user-omar',
        globalRoles: ['SCHOOL_ADMIN'],
        isInviteAccepted: true,
      },
    ])
    // No existing user by hubUserId or by email → brand-new.
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'cu-omar' })

    const summary = await syncSchoolFromHub('connect-school-1')

    const createArg = prismaMock.user.create.mock.calls[0][0] as any
    expect(createArg.data.email).toBe('omar.said@school.ae')
    expect(createArg.data.name).toBe('Omar Said')
    expect(createArg.data.hubUserId).toBe('hub-user-omar')
    // SCHOOL_ADMIN → ADMIN, only because this is a new user.
    expect(createArg.data.role).toBe('ADMIN')
    expect(prismaMock.user.update).not.toHaveBeenCalled()

    expect(summary.staff).toEqual({ created: 1, updated: 0 })
  })
})

describe('syncSchoolFromHub — guardian provisioning', () => {
  const GUARDIAN = {
    id: 'hg1',
    firstName: 'Layla',
    lastName: 'Khan',
    email: 'Layla.Khan@example.com',
    phone: '+971500000000',
    pupils: [{ pupilId: 'hp1', relationship: 'mother', isPrimary: true }],
  }

  it('creates a PARENT user and a parent↔student link for a new guardian', async () => {
    mGuardians.mockResolvedValue([GUARDIAN])
    prismaMock.user.findFirst.mockResolvedValue(null) // not linked, no email match
    prismaMock.user.create.mockResolvedValue({ id: 'cu-parent' })

    const summary = await syncSchoolFromHub('connect-school-1')

    const createArg = prismaMock.user.create.mock.calls[0][0] as any
    expect(createArg.data.email).toBe('layla.khan@example.com') // lowercased
    expect(createArg.data.name).toBe('Layla Khan')
    expect(createArg.data.role).toBe('PARENT')
    expect(createArg.data.hubGuardianId).toBe('hg1')
    expect(createArg.data.schoolId).toBe('connect-school-1')

    // The link resolves the Hub pupil id (hp1) to its Connect Student (cs-hp1),
    // upserted idempotently on the [userId, studentId] unique.
    expect(prismaMock.parentStudentLink.upsert).toHaveBeenCalledWith({
      where: { userId_studentId: { userId: 'cu-parent', studentId: 'cs-hp1' } },
      create: { userId: 'cu-parent', studentId: 'cs-hp1' },
      update: {},
    })

    expect(summary.guardians).toEqual({ created: 1, linked: 0, skippedNoEmail: 0 })
    expect(summary.parentLinks).toEqual({ created: 1, skippedNoPupil: 0 })
  })

  it('re-run is idempotent — no duplicate user or link', async () => {
    mGuardians.mockResolvedValue([GUARDIAN])
    let provisioned: any = null
    prismaMock.user.findFirst.mockImplementation(async ({ where }: any) =>
      where.hubGuardianId ? provisioned : null,
    )
    prismaMock.user.create.mockImplementation(async () => {
      provisioned = { id: 'cu-parent', role: 'PARENT', schoolId: 'connect-school-1', hubGuardianId: 'hg1' }
      return provisioned
    })
    prismaMock.user.update.mockResolvedValue({ id: 'cu-parent' })

    await syncSchoolFromHub('connect-school-1')
    await syncSchoolFromHub('connect-school-1')

    // Created once (first run); second run resolves by hubGuardianId → update.
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
    // Links only ever go through the keyed upsert — never a bare create.
    expect(prismaMock.parentStudentLink.create).not.toHaveBeenCalled()
    expect(prismaMock.parentStudentLink.upsert).toHaveBeenCalledTimes(2)
    for (const call of prismaMock.parentStudentLink.upsert.mock.calls) {
      expect((call[0] as any).where).toEqual({
        userId_studentId: { userId: 'cu-parent', studentId: 'cs-hp1' },
      })
    }
  })

  it('links a pre-existing same-email user WITHOUT changing its role', async () => {
    mGuardians.mockResolvedValue([GUARDIAN])
    // No hubGuardianId match, but an email match exists — and it's an ADMIN
    // (this person is both staff and a parent). Role must stay ADMIN.
    prismaMock.user.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.hubGuardianId) return null
      if (where.email === 'layla.khan@example.com') {
        return { id: 'cu-admin', role: 'ADMIN', schoolId: 'connect-school-1', email: 'layla.khan@example.com', hubGuardianId: null }
      }
      return null
    })

    const summary = await syncSchoolFromHub('connect-school-1')

    const updateArg = prismaMock.user.update.mock.calls[0][0] as any
    expect(updateArg.where).toEqual({ id: 'cu-admin' })
    expect(updateArg.data).not.toHaveProperty('role') // never clobbered
    expect(updateArg.data.hubGuardianId).toBe('hg1') // identity linked
    expect(prismaMock.user.create).not.toHaveBeenCalled()

    // The link is still made against the existing user.
    expect(prismaMock.parentStudentLink.upsert).toHaveBeenCalledWith({
      where: { userId_studentId: { userId: 'cu-admin', studentId: 'cs-hp1' } },
      create: { userId: 'cu-admin', studentId: 'cs-hp1' },
      update: {},
    })

    expect(summary.guardians).toEqual({ created: 0, linked: 1, skippedNoEmail: 0 })
  })

  it('skips a guardian with a null email (counted, no user or link written)', async () => {
    mGuardians.mockResolvedValue([{ ...GUARDIAN, email: null }])
    prismaMock.user.findFirst.mockResolvedValue(null)

    const summary = await syncSchoolFromHub('connect-school-1')

    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.parentStudentLink.upsert).not.toHaveBeenCalled()
    expect(summary.guardians).toEqual({ created: 0, linked: 0, skippedNoEmail: 1 })
    expect(summary.parentLinks).toEqual({ created: 0, skippedNoPupil: 0 })
  })

  it('skips a pupil link whose Hub pupil is not synced into Connect (counted)', async () => {
    mGuardians.mockResolvedValue([
      { ...GUARDIAN, pupils: [{ pupilId: 'hp-unknown', relationship: 'father', isPrimary: true }] },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'cu-parent' })

    const summary = await syncSchoolFromHub('connect-school-1')

    // User is still created, but the unresolved pupil link is skipped.
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.parentStudentLink.upsert).not.toHaveBeenCalled()
    expect(summary.guardians).toEqual({ created: 1, linked: 0, skippedNoEmail: 0 })
    expect(summary.parentLinks).toEqual({ created: 0, skippedNoPupil: 1 })
  })

  it('0 guardians → all-zero guardian/link summary, no user or link writes', async () => {
    mGuardians.mockResolvedValue([])

    const summary = await syncSchoolFromHub('connect-school-1')

    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.parentStudentLink.upsert).not.toHaveBeenCalled()
    expect(summary.guardians).toEqual({ created: 0, linked: 0, skippedNoEmail: 0 })
    expect(summary.parentLinks).toEqual({ created: 0, skippedNoPupil: 0 })
  })
})

describe('syncSchoolFromHub — guardrails', () => {
  it('throws SchoolNotLinkedError when the school has no hubSchoolId', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: null })

    await expect(syncSchoolFromHub('connect-school-1')).rejects.toBeInstanceOf(SchoolNotLinkedError)
    // Nothing synced, nothing marked fresh.
    expect(mYearGroups).not.toHaveBeenCalled()
    expect(prismaMock.school.update).not.toHaveBeenCalled()
  })
})
