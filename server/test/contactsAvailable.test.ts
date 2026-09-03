import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/inbox/contacts/available — the parent's contact list.
 *
 * The list is long: a class teacher, several specialists off the timetable, and
 * every school contact. What the parent app does with that is a layout question, but
 * two things have to come from here: whether a teacher is a class teacher (the
 * absence of roleLabel) and whether a school contact belongs above the fold.
 */
const prismaMock = {
  user: { findUnique: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  schoolContact: { findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  class: { findMany: vi.fn() },
  ilsaLink: { findMany: vi.fn() },
  conversation: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/unreadCount', () => ({ getInboxUnreadCount: vi.fn(), getPushBadgeCount: vi.fn() }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn(), ATTACHMENT_MIME_TYPES: [] }))
vi.mock('../src/services/dateTime', () => ({ todayInTimezone: () => '2026-09-02' }))
// The specialist lookup is best-effort and network-backed; off for these tests.
vi.mock('../src/services/classTeachingStaff', () => ({
  teachingStaffForClasses: vi.fn(async () => new Map()),
  timetableLookupPossible: () => false,
}))

const loadUserWithRelations = vi.fn()
let role = 'PARENT'
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'school-1', role }
    next()
  }
  return {
    isAuthenticated: attach,
    isAdmin: attach,
    isStaff: attach,
    loadUserWithRelations,
  }
})

const { default: inboxRoutes } = await import('../src/routes/inbox')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inbox', inboxRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  role = 'PARENT'
  loadUserWithRelations.mockResolvedValue({
    id: 'parent-1',
    schoolId: 'school-1',
    role: 'PARENT',
    children: [],
    studentLinks: [{
      studentId: 'stu-1',
      student: { id: 'stu-1', firstName: 'Alya', lastName: 'Zaidi', classId: 'c-1', class: { id: 'c-1', name: 'FS1 Yellow' } },
    }],
  })
  prismaMock.staffClassAssignment.findMany.mockResolvedValue([])
  prismaMock.schoolContact.findMany.mockResolvedValue([])
  prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: null, timezone: 'Asia/Dubai' })
  prismaMock.ilsaLink.findMany.mockResolvedValue([])
})

describe('GET /api/inbox/contacts/available', () => {
  it('a class teacher carries no roleLabel — that is what marks them as the class teacher', async () => {
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([
      {
        userId: 'u-1',
        user: { id: 'u-1', name: 'Ms Fatima', avatarUrl: null },
        class: { id: 'c-1', name: 'FS1 Yellow' },
      },
    ])

    const res = await request(makeApp()).get('/api/inbox/contacts/available')

    expect(res.status).toBe(200)
    expect(res.body.teachers).toHaveLength(1)
    expect(res.body.teachers[0].name).toBe('Ms Fatima')
    expect(res.body.teachers[0].roleLabel).toBeUndefined()
  })

  // Which contacts sit above the fold is the school's decision, not a guess
  // from the name: "Reception" here is "Front Office" at the next school.
  it('reports which contacts the school pinned', async () => {
    prismaMock.schoolContact.findMany.mockResolvedValue([
      { id: 'sc-1', name: 'Reception', description: 'General enquiries', icon: null, assignedUserId: 'u-2', assignedUser: { id: 'u-2', name: 'Front Desk' }, warnBeforeMessaging: false, warningMessage: null, alwaysVisible: true },
      { id: 'sc-2', name: 'Bus Office', description: null, icon: null, assignedUserId: 'u-3', assignedUser: { id: 'u-3', name: 'Transport' }, warnBeforeMessaging: false, warningMessage: null, alwaysVisible: false },
    ])

    const res = await request(makeApp()).get('/api/inbox/contacts/available')

    const byName = Object.fromEntries(res.body.schoolContacts.map((c: { name: string; alwaysVisible: boolean }) => [c.name, c.alwaysVisible]))
    expect(byName).toEqual({ Reception: true, 'Bus Office': false })
  })

  // This list is a parent's own children's teachers and their school's
  // contacts; the route guards on role itself, not only on the middleware.
  it('is refused to anyone who is not a parent', async () => {
    role = 'STAFF'
    const res = await request(makeApp()).get('/api/inbox/contacts/available')
    expect(res.status).toBe(403)
  })
})

/**
 * An ILSA is 1:1 with one pupil and engaged by that pupil's parent (ADR 0006),
 * so a guardian must see their own child's and nobody else's. The server was
 * already returning these correctly; the parent app simply never rendered them,
 * which is why an ILSA could message a parent but not be messaged back.
 */
describe('Learning Support Assistants on the parent contact list', () => {
  it('returns the ILSA linked to this parent\'s child, with the pupil named', async () => {
    prismaMock.ilsaLink.findMany.mockResolvedValue([
      { studentId: 'stu-1', user: { id: 'ilsa-1', name: 'Sabrina Cabato Dy', avatarUrl: null } },
    ])

    const res = await request(makeApp()).get('/api/inbox/contacts/available')

    expect(res.body.ilsas).toHaveLength(1)
    expect(res.body.ilsas[0]).toMatchObject({
      id: 'ilsa-1',
      name: 'Sabrina Cabato Dy',
      roleLabel: 'Learning Support Assistant',
      // The thread endpoint requires this, and a parent with two children needs
      // to know which one the ILSA is for.
      studentId: 'stu-1',
      studentName: 'Alya Zaidi',
    })
  })

  // A revoked link is how the school cuts off access; it must disappear from the
  // parent's contact list too, not just from the ILSA's side.
  it('asks only for active links', async () => {
    prismaMock.ilsaLink.findMany.mockResolvedValue([])
    await request(makeApp()).get('/api/inbox/contacts/available')
    expect(prismaMock.ilsaLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ active: true }) }),
    )
  })

  it('scopes the lookup to this parent\'s own children', async () => {
    prismaMock.ilsaLink.findMany.mockResolvedValue([])
    await request(makeApp()).get('/api/inbox/contacts/available')
    expect(prismaMock.ilsaLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: { in: ['stu-1'] } }) }),
    )
  })

  it('is an empty list for a parent with no ILSA', async () => {
    prismaMock.ilsaLink.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get('/api/inbox/contacts/available')
    expect(res.body.ilsas).toEqual([])
  })
})
