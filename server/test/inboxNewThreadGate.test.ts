import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Who a parent may start a conversation WITH.
 *
 * The restriction used to live only in the picker: the endpoint accepted any
 * staff member at the school, so the list a parent was shown and the list the
 * API honoured were different things. Nothing had gone wrong — the UI never
 * offers anyone else — but "the client doesn't ask for it" is not a rule.
 *
 * The placement is the decision, and it is what these tests are mostly about.
 * The check sits AFTER the find-or-create, so re-opening a thread that already
 * exists is unaffected. A parent messaging last year's teacher about last
 * year's conversation is not starting anything; that thread is already theirs
 * to read, and refusing the reply would be a new fault introduced in the name
 * of closing an old one.
 */

const prismaMock = {
  user: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  parentStudentLink: { findFirst: vi.fn(), findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  ilsaLink: { findFirst: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  schoolContact: { findMany: vi.fn() },
  class: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn() }))
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'p-1', schoolId: 'sch-1', role: 'PARENT' }
    next()
  }
  return { isAuthenticated: attach, isStaff: attach, isAdmin: attach, loadUserWithRelations: vi.fn() }
})

const { default: inboxRoutes } = await import('../src/routes/inbox')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inbox', inboxRoutes)
  return app
}

const start = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/inbox/conversations').send(body)

/** The parent's own child is in class c-1, taught by staff-teacher. */
function contactableIsTheClassTeacher() {
  prismaMock.parentStudentLink.findMany.mockResolvedValue([
    { studentId: 'stu-1', student: { id: 'stu-1', classId: 'c-1' } },
  ])
  prismaMock.school.findUnique.mockResolvedValue({ id: 'sch-1' })
  prismaMock.student.findMany.mockResolvedValue([{ id: 'stu-1', classId: 'c-1' }])
  prismaMock.staffClassAssignment.findMany.mockResolvedValue([
    { classId: 'c-1', userId: 'staff-teacher', user: { id: 'staff-teacher', name: 'Ms Khan', avatarUrl: null } },
  ])
  prismaMock.schoolContact.findMany.mockResolvedValue([])
  prismaMock.class.findMany.mockResolvedValue([{ id: 'c-1', name: '3A' }])
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.findFirst.mockResolvedValue({ id: 'staff-teacher', role: 'STAFF' })
  prismaMock.conversation.findFirst.mockResolvedValue(null)
  prismaMock.conversation.create.mockResolvedValue({ id: 'c-new' })
  contactableIsTheClassTeacher()
})

describe('POST /api/inbox/conversations', () => {
  it('starts a thread with the child\'s own class teacher', async () => {
    const res = await start({ staffId: 'staff-teacher' })

    expect(res.status).toBe(201)
    expect(prismaMock.conversation.create).toHaveBeenCalled()
  })

  // The hole. A valid staff id the parent has no relationship with was accepted
  // purely because the client never offered it.
  it('refuses a staff member outside the parent\'s contactable set', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'staff-stranger', role: 'STAFF' })

    const res = await start({ staffId: 'staff-stranger' })

    expect(res.status).toBe(400)
    expect(prismaMock.conversation.create).not.toHaveBeenCalled()
  })

  // The reason the check sits after find-or-create rather than at the top.
  it('still re-opens an EXISTING thread with someone no longer contactable', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'staff-last-year', role: 'STAFF' })
    prismaMock.conversation.findFirst.mockResolvedValue({ id: 'c-old', archivedByParent: true })

    const res = await start({ staffId: 'staff-last-year' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'c-old', created: false })
    // Un-archived, so it comes back to the parent's list where they left it.
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-old' }, data: { archivedByParent: false } })
    )
    expect(prismaMock.conversation.create).not.toHaveBeenCalled()
  })

  it('does not consult the contactable set at all when re-opening', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({ id: 'c-old', archivedByParent: false })

    await start({ staffId: 'staff-stranger' })

    // The parent's classes are never looked up — the thread already exists.
    expect(prismaMock.staffClassAssignment.findMany).not.toHaveBeenCalled()
  })

  it('refuses a recipient who is not staff at all', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)

    const res = await start({ staffId: 'p-other-parent' })

    expect(res.status).toBe(400)
    expect(prismaMock.conversation.create).not.toHaveBeenCalled()
  })
})
