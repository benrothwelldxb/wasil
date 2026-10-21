import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The author's own Arabic: titleAr and bodyAr on a post, titleAr,
 * descriptionAr, labelAr and optionsAr on a form.
 *
 * A consent form is a document the school stands behind, and a machine
 * translation of it is not. A parent whose language is Arabic reads the
 * author's Arabic where there is some, and the machine translation only where
 * there is not. Everyone else reads the English, unchanged.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  school: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  group: { findMany: vi.fn() },
  form: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn() },
  messageAttachment: { createMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  formResponse: { findMany: vi.fn() },
  class: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn(async () => []) }))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({
  resolveHubStaffMembership: vi.fn(async () => ({ id: 'staff-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
const translateTexts = vi.fn(async (texts: string[]) => texts.map(t => `[mt] ${t}`))
vi.mock('../src/services/translation', () => ({ translateTexts }))
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

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  app.use('/api/messages', messagesRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer tok')

beforeEach(() => {
  vi.clearAllMocks()
  // The school has turned Wasil Beyond on (services/partnerSwitch).
  prismaMock.school.findUnique.mockResolvedValue({ beyondEnabled: true })
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'beyond', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.group.findMany.mockResolvedValue([{ id: 'g-1', name: 'Trip', isActive: true }])
  prismaMock.message.create.mockResolvedValue({ id: 'm-1' })
  prismaMock.form.create.mockImplementation(async ({ data }: any) => ({ id: 'f-1', ...data }))
  prismaMock.form.update.mockImplementation(async ({ data }: any) => ({ id: 'f-1', externalRef: 'r', perChild: true, status: 'ACTIVE', expiresAt: null, ...data }))
})

describe('a post with the author\'s Arabic', () => {
  it('stores the Arabic title as given and the Arabic body as sanitised HTML', async () => {
    const res = await auth(request(makeApp()).post('/api/partner/messages')).send({
      hub_user_id: 'hub-lead', title: 'Back at school', content: 'The coach is **back**.',
      titleAr: 'عدنا إلى المدرسة', bodyAr: 'وصلت الحافلة **إلى المدرسة**.<script>x()</script>',
      audience: { groupIds: ['g-1'] },
    })
    expect(res.status).toBe(201)
    const data = prismaMock.message.create.mock.calls[0][0].data
    expect(data.titleAr).toBe('عدنا إلى المدرسة')
    expect(data.contentAr).toContain('<strong>إلى المدرسة</strong>')
    expect(data.contentAr).not.toContain('<script>')
  })

  it('leaves a post without Arabic exactly as before', async () => {
    await auth(request(makeApp()).post('/api/partner/messages')).send({
      hub_user_id: 'hub-lead', title: 'Back at school', content: 'Back.', audience: { groupIds: ['g-1'] },
    })
    const data = prismaMock.message.create.mock.calls[0][0].data
    expect(data.titleAr).toBeUndefined()
    expect(data.contentAr).toBeUndefined()
  })

  it('refuses Arabic that is not text', async () => {
    const res = await auth(request(makeApp()).post('/api/partner/messages')).send({
      hub_user_id: 'hub-lead', title: 'T', content: 'C', titleAr: 5, audience: { groupIds: ['g-1'] },
    })
    expect(res.status).toBe(400)
  })
})

describe('a form with the author\'s Arabic', () => {
  const FIELDS = [
    { id: 'consent', type: 'yesno', label: 'Do you give consent?', labelAr: 'هل توافق؟' },
    { id: 'home', type: 'choice', label: 'Going home', labelAr: 'العودة إلى المنزل', options: ['Coach', 'Collected'], optionsAr: ['الحافلة', 'الاستلام'] },
  ]
  const publish = (body: Record<string, unknown> = {}) =>
    auth(request(makeApp()).put('/api/partner/forms/beyond:consent:t-1')).send({
      hub_user_id: 'hub-lead', title: 'Consent', titleAr: 'الموافقة', descriptionAr: 'يرجى الإجابة', fields: FIELDS, ...body,
    })

  it('keeps the Arabic alongside the English, with English answers', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    const res = await publish()
    expect(res.status).toBe(201)
    const data = prismaMock.form.create.mock.calls[0][0].data
    expect(data).toMatchObject({ titleAr: 'الموافقة', descriptionAr: 'يرجى الإجابة' })
    expect(data.fields[0]).toMatchObject({ labelAr: 'هل توافق؟', options: ['Yes', 'No'], optionsAr: ['نعم', 'لا'] })
    expect(data.fields[1]).toMatchObject({ options: ['Coach', 'Collected'], optionsAr: ['الحافلة', 'الاستلام'] })
    expect(res.body.fields[1]).toMatchObject({ labelAr: 'العودة إلى المنزل', optionsAr: ['الحافلة', 'الاستلام'] })
  })

  it('refuses Arabic options that do not line up with the English ones', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    const res = await publish({ fields: [{ ...FIELDS[1], optionsAr: ['الحافلة'] }] })
    expect(res.status).toBe(400)
  })

  it('lets a translation be corrected after answers, but not the question', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    await publish()
    const stored = prismaMock.form.create.mock.calls[0][0].data.fields
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', managedBy: 'beyond', fields: stored, _count: { responses: 4 } })

    const fixed = await publish({ fields: [{ ...FIELDS[0], labelAr: 'هل تمنح موافقتك؟' }, FIELDS[1]] })
    expect(fixed.status).toBe(200)

    const reworded = await publish({ fields: [{ ...FIELDS[0], label: 'Do you agree?' }, FIELDS[1]] })
    expect(reworded.status).toBe(409)
  })
})

describe('what the parent reads', () => {
  const ROW = {
    id: 'm-1', title: 'Back at school', content: '<p>Back.</p>', titleAr: 'عدنا إلى المدرسة', contentAr: '<p>وصلنا.</p>',
    targetClass: 'Trip', classId: null, yearGroupId: null, groupId: 'g-1', schoolId: 'school-1',
    senderId: 's', sender: { id: 's', name: 'Mrs Ahmed' }, isPinned: false, isUrgent: false, requiresAcknowledgment: false,
    acknowledgments: [], _count: { acknowledgments: 0 }, attachments: [], createdAt: new Date(), formId: null, form: null,
  }
  const asParent = (preferredLanguage: string) => {
    loadUserWithRelations.mockResolvedValue({
      id: 'parent-1', schoolId: 'school-1', preferredLanguage, children: [],
      studentLinks: [{ studentId: 'stu-1', student: { classId: 'c-1' } }],
    })
    prismaMock.class.findMany.mockResolvedValue([])
    prismaMock.studentGroupLink.findMany.mockResolvedValue([{ groupId: 'g-1' }])
    prismaMock.message.findMany.mockResolvedValue([ROW, { ...ROW, id: 'm-2', title: 'Running late', titleAr: null, contentAr: null }])
  }

  it('in Arabic, the author\'s Arabic where there is some, machine translation where not', async () => {
    asParent('ar')
    const res = await request(makeApp()).get('/api/messages')
    expect(res.body[0]).toMatchObject({ title: 'عدنا إلى المدرسة', content: '<p>وصلنا.</p>' })
    expect(res.body[1].title).toBe('[mt] Running late')
    // The author's text is never sent for translation.
    expect(translateTexts.mock.calls[0][0]).not.toContain('Back at school')
  })

  it('in English, the English', async () => {
    asParent('en')
    const res = await request(makeApp()).get('/api/messages')
    expect(res.body[0]).toMatchObject({ title: 'Back at school', content: '<p>Back.</p>' })
    expect(translateTexts).not.toHaveBeenCalled()
  })

  it('in another language, the machine translation of the English, not the Arabic', async () => {
    asParent('fr')
    const res = await request(makeApp()).get('/api/messages')
    expect(res.body[0].title).toBe('[mt] Back at school')
  })
})
