import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A post to the families of named pupils: audience.pupilHubIds.
 *
 * Beyond offers a freed trip place to the next family on the waiting list, and
 * chases the families who have not answered the consent form. Neither is a
 * class or a group. The properties pinned here: the row has no other target,
 * the notification reaches exactly those pupils' parents, the post appears in
 * exactly those parents' feeds, and a scheduled one is not announced to nobody.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  student: { findMany: vi.fn() },
  class: { findMany: vi.fn() },
  group: { findMany: vi.fn() },
  yearGroup: { findFirst: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  messageAttachment: { createMany: vi.fn() },
  messageStudentTarget: { createMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
const notifyMock = { sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn(async () => ['parent-1']) }
vi.mock('../src/services/notify', () => notifyMock)
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({
  resolveHubStaffMembership: vi.fn(async () => ({ id: 'staff-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn() }))
vi.mock('../src/services/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'school-1', role: 'PARENT' }
    next()
  }
  return {
    isAuthenticated: attach, isStaff: attach, isAdmin: attach, loadUserWithRelations,
    canSendToTarget: (_r: unknown, _s: unknown, n: () => void) => n(),
    canMarkUrgent: (_r: unknown, _s: unknown, n: () => void) => n(),
  }
})

const { default: partnerRoutes } = await import('../src/routes/partner')
const { default: messagesRoutes } = await import('../src/routes/messages')
const { publishDueScheduledMessages } = await import('../src/services/scheduledMessages')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  app.use('/api/messages', messagesRoutes)
  return app
}

const send = (audience: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  request(makeApp())
    .post('/api/partner/messages')
    .set('Authorization', 'Bearer tok')
    .send({ hub_user_id: 'hub-staff-1', title: 'A place is free', content: 'Reply by Friday.', audience, ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'beyond', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.message.create.mockResolvedValue({ id: 'm-1' })
  prismaMock.messageStudentTarget.createMany.mockResolvedValue({ count: 1 })
  const ROLL: Record<string, string> = { 'hub-p1': 'stu-1', 'hub-p2': 'stu-2' }
  prismaMock.student.findMany.mockImplementation(async (args: any) => {
    const asked: string[] = args?.where?.hubPupilId?.in ?? []
    return asked.filter(h => ROLL[h]).map(h => ({ id: ROLL[h], hubPupilId: h }))
  })
})

describe('POST /api/partner/messages with pupilHubIds', () => {
  it('writes one row with no other target, linked to exactly those pupils', async () => {
    const res = await send({ pupilHubIds: ['hub-p1', 'hub-p2'], label: 'Year 4 Etihad Museum, 20 Oct' })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ created: 1, parents: 1 })

    const data = prismaMock.message.create.mock.calls[0][0].data
    expect(data).toMatchObject({ targetClass: 'Year 4 Etihad Museum, 20 Oct', classId: null, groupId: null, yearGroupId: null })
    expect(prismaMock.messageStudentTarget.createMany).toHaveBeenCalledWith({
      data: [{ messageId: 'm-1', studentId: 'stu-1' }, { messageId: 'm-1', studentId: 'stu-2' }],
      skipDuplicates: true,
    })
  })

  it('resolves the audience through the pupils, which is the studentIds path in notify', async () => {
    await send({ pupilHubIds: ['hub-p1'] })
    expect(notifyMock.resolveAudienceParentIds).toHaveBeenCalledWith(
      expect.objectContaining({ studentIds: ['stu-1'], schoolId: 'school-1' }),
    )
    expect(notifyMock.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('defaults the label shown to parents', async () => {
    await send({ pupilHubIds: ['hub-p1'] })
    expect(prismaMock.message.create.mock.calls[0][0].data.targetClass).toBe('Selected pupils')
  })

  it('names unknown pupils and still sends to the rest', async () => {
    const res = await send({ pupilHubIds: ['hub-p1', 'hub-gone'] })
    expect(res.status).toBe(201)
    expect(res.body.unknownPupilIds).toEqual(['hub-gone'])
  })

  it('refuses a post to nobody rather than writing an orphan row', async () => {
    const res = await send({ pupilHubIds: ['hub-gone'] })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'no known pupils in audience', unknownPupilIds: ['hub-gone'] })
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })

  it('refuses the one label that would reach the whole school', async () => {
    const res = await send({ pupilHubIds: ['hub-p1'], label: 'whole school' })
    expect(res.status).toBe(400)
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })

  it('leaves an ordinary group send exactly as it was', async () => {
    prismaMock.group.findMany.mockResolvedValue([{ id: 'g-1', name: 'Trip', isActive: true }])
    await send({ groupIds: ['g-1'] })
    expect(prismaMock.messageStudentTarget.createMany).not.toHaveBeenCalled()
    expect(prismaMock.student.findMany).not.toHaveBeenCalled()
  })
})

describe('the parent feed', () => {
  it('shows a pupil-addressed post only through the parent\'s own children', async () => {
    loadUserWithRelations.mockResolvedValue({
      id: 'parent-1', schoolId: 'school-1', preferredLanguage: 'en', children: [],
      studentLinks: [{ studentId: 'stu-1', student: { classId: 'c-1' } }],
    })
    prismaMock.class.findMany.mockResolvedValue([{ yearGroupId: 'yg-1' }])
    prismaMock.studentGroupLink.findMany.mockResolvedValue([])
    prismaMock.message.findMany.mockResolvedValue([])

    await request(makeApp()).get('/api/messages')
    const where = prismaMock.message.findMany.mock.calls[0][0].where
    expect(where.OR).toContainEqual({ studentTargets: { some: { studentId: { in: ['stu-1'] } } } })
  })
})

describe('a scheduled pupil-addressed post', () => {
  it('is announced to those pupils\' families when it comes due', async () => {
    prismaMock.message.findMany.mockResolvedValue([{
      id: 'm-1', title: 'Reminder', content: 'Reply by Friday', targetClass: 'Selected pupils',
      classId: null, yearGroupId: null, groupId: null, schoolId: 'school-1',
      studentTargets: [{ studentId: 'stu-1' }, { studentId: 'stu-2' }],
    }])
    prismaMock.message.updateMany.mockResolvedValue({ count: 1 })
    await publishDueScheduledMessages()
    expect(notifyMock.sendNotification.mock.calls[0][0].target).toMatchObject({ studentIds: ['stu-1', 'stu-2'] })
  })

  it('does not pass an empty pupil list for an ordinary post, which would send to nobody', async () => {
    prismaMock.message.findMany.mockResolvedValue([{
      id: 'm-2', title: 'Sports Day', content: 'Kit', targetClass: '3A',
      classId: 'c-1', yearGroupId: null, groupId: null, schoolId: 'school-1', studentTargets: [],
    }])
    prismaMock.message.updateMany.mockResolvedValue({ count: 1 })
    await publishDueScheduledMessages()
    expect(notifyMock.sendNotification.mock.calls[0][0].target.studentIds).toBeUndefined()
  })
})
