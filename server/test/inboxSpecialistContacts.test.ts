import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// The parent inbox's "New message" list must show the specialists who take the
// child's class (PE, music, Arabic …) alongside the class teacher — and the CC
// gate must accept exactly the same set, or a parent would see a contact they
// can't actually add. Prisma + the timetable-derived lookup are mocked.

const prismaMock = {
  user: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  class: { findMany: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  schoolContact: { findMany: vi.fn() },
  ilsaLink: { findMany: vi.fn() },
  parentStudentLink: { findMany: vi.fn(), findFirst: vi.fn() },
  child: { findMany: vi.fn() },
  conversation: { findFirst: vi.fn() },
  conversationParticipant: { findFirst: vi.fn(), create: vi.fn() },
  conversationMessage: { create: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))

const staffLookupMock = {
  teachingStaffForClasses: vi.fn(),
  timetableLookupPossible: vi.fn(() => true),
}
vi.mock('../src/services/classTeachingStaff', () => staffLookupMock)

const PARENT = { id: 'parent-1', role: 'PARENT', schoolId: 'school-1', name: 'A Parent' }
const PARENT_WITH_RELATIONS = {
  ...PARENT,
  studentLinks: [
    {
      studentId: 'stu-1',
      student: { firstName: 'Amina', lastName: 'Khan', classId: 'cls-1', class: { name: '1A' } },
    },
  ],
  children: [],
}
vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = PARENT
    next()
  }
  return {
    isAuthenticated: setUser,
    isStaff: setUser,
    isAdmin: setUser,
    loadUserWithRelations: vi.fn(async () => PARENT_WITH_RELATIONS),
  }
})

const { default: inboxRoutes } = await import('../src/routes/inbox')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inbox', inboxRoutes)
  return app
}

const CLASS_TEACHER = { id: 'u-class', name: 'Ms Noor', avatarUrl: null }
const SPECIALIST = { userId: 'u-pe', name: 'Peter Adams', avatarUrl: null, subjects: ['PE', 'Swimming'] }

beforeEach(() => {
  vi.clearAllMocks()
  staffLookupMock.timetableLookupPossible.mockReturnValue(true)
  prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: 'hub-sch-1', timezone: 'Asia/Dubai' })
  prismaMock.class.findMany.mockResolvedValue([{ id: 'cls-1', name: '1A', hubClassId: 'hub-cls-1' }])
  prismaMock.staffClassAssignment.findMany.mockResolvedValue([
    { userId: 'u-class', user: CLASS_TEACHER, class: { id: 'cls-1', name: '1A' } },
  ])
  prismaMock.schoolContact.findMany.mockResolvedValue([])
  prismaMock.ilsaLink.findMany.mockResolvedValue([])
  prismaMock.parentStudentLink.findMany.mockResolvedValue([{ student: { classId: 'cls-1' } }])
  prismaMock.child.findMany.mockResolvedValue([])
  staffLookupMock.teachingStaffForClasses.mockResolvedValue(new Map([['cls-1', [SPECIALIST]]]))
})

describe('GET /api/inbox/contacts/available', () => {
  it('lists the specialist alongside the class teacher, labelled with what they teach', async () => {
    const res = await request(makeApp()).get('/api/inbox/contacts/available')
    expect(res.status).toBe(200)

    const byId = Object.fromEntries(res.body.teachers.map((t: { id: string }) => [t.id, t]))
    expect(byId['u-class']).toMatchObject({ name: 'Ms Noor', classes: [{ id: 'cls-1', name: '1A' }] })
    // A class teacher carries no roleLabel — the app renders "Class Teacher".
    expect(byId['u-class'].roleLabel).toBeUndefined()
    expect(byId['u-pe']).toMatchObject({
      name: 'Peter Adams',
      roleLabel: 'PE · Swimming',
      classes: [{ id: 'cls-1', name: '1A' }],
    })
  })

  it('asks only for specialists who are not already class teachers', async () => {
    await request(makeApp()).get('/api/inbox/contacts/available')
    const opts = staffLookupMock.teachingStaffForClasses.mock.calls[0][2]
    expect([...opts.excludeUserIds]).toEqual(['u-class'])
    expect(opts.hubSchoolId).toBe('hub-sch-1')
  })

  it('caps a long subject list so the row cannot overflow', async () => {
    staffLookupMock.teachingStaffForClasses.mockResolvedValue(
      new Map([['cls-1', [{ ...SPECIALIST, subjects: ['PE', 'Swimming', 'Games', 'Health', 'Dance'] }]]]),
    )
    const res = await request(makeApp()).get('/api/inbox/contacts/available')
    const pe = res.body.teachers.find((t: { id: string }) => t.id === 'u-pe')
    expect(pe.roleLabel).toBe('PE · Swimming · Games')
  })

  it('falls back to a generic label when the timetable names no subject', async () => {
    staffLookupMock.teachingStaffForClasses.mockResolvedValue(
      new Map([['cls-1', [{ ...SPECIALIST, subjects: [] }]]]),
    )
    const res = await request(makeApp()).get('/api/inbox/contacts/available')
    expect(res.body.teachers.find((t: { id: string }) => t.id === 'u-pe').roleLabel).toBe('Specialist Teacher')
  })

  it('still returns the class teachers when the timetable lookup fails', async () => {
    staffLookupMock.teachingStaffForClasses.mockRejectedValue(new Error('hub down'))
    const res = await request(makeApp()).get('/api/inbox/contacts/available')
    expect(res.status).toBe(200)
    expect(res.body.teachers.map((t: { id: string }) => t.id)).toEqual(['u-class'])
  })

  it('skips the lookup entirely when Hub is not configured', async () => {
    staffLookupMock.timetableLookupPossible.mockReturnValue(false)
    const res = await request(makeApp()).get('/api/inbox/contacts/available')
    expect(res.status).toBe(200)
    expect(staffLookupMock.teachingStaffForClasses).not.toHaveBeenCalled()
    expect(res.body.teachers.map((t: { id: string }) => t.id)).toEqual(['u-class'])
  })
})

// The CC ("add people") gate reads from the same bounded set.
describe('GET /api/inbox/conversations/:id/staff', () => {
  it('offers the specialist as addable, exactly as the contact list showed them', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      parentId: 'parent-1',
      staffId: 'u-class',
      schoolId: 'school-1',
      participants: [],
    })
    const res = await request(makeApp()).get('/api/inbox/conversations/c-1/staff')
    expect(res.status).toBe(200)
    // The primary staff is excluded; the specialist is offered.
    expect(res.body.addable).toEqual([{ userId: 'u-pe', name: 'Peter Adams' }])
  })
})
