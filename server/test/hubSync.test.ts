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
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

// Mock the MIS client entirely — each endpoint is a vi.fn we drive per test.
vi.mock('../src/services/hubMis', () => ({
  listYearGroups: vi.fn(),
  listClasses: vi.fn(),
  listPupils: vi.fn(),
  listStaff: vi.fn(),
}))

const {
  listYearGroups,
  listClasses,
  listPupils,
  listStaff,
} = await import('../src/services/hubMis')
const { syncSchoolFromHub, SchoolNotLinkedError } = await import('../src/services/hubSync')

const mYearGroups = vi.mocked(listYearGroups)
const mClasses = vi.mocked(listClasses)
const mPupils = vi.mocked(listPupils)
const mStaff = vi.mocked(listStaff)

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

describe('syncSchoolFromHub — guardrails', () => {
  it('throws SchoolNotLinkedError when the school has no hubSchoolId', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: null })

    await expect(syncSchoolFromHub('connect-school-1')).rejects.toBeInstanceOf(SchoolNotLinkedError)
    // Nothing synced, nothing marked fresh.
    expect(mYearGroups).not.toHaveBeenCalled()
    expect(prismaMock.school.update).not.toHaveBeenCalled()
  })
})
