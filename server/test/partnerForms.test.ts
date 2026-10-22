import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Per-child forms from a partner: Beyond's trip consent.
 *
 * Connect's forms were answered once per parent, so a parent of twins on a
 * trip could consent for one of them. A partner form is answered once per
 * CHILD, by either linked guardian, attached to a trip post, closed at its
 * deadline, and read back by the publishing app with a cursor. These tests pin
 * that whole path: publish, attach, answer, read.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  school: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  group: { findMany: vi.fn() },
  form: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  formResponse: { findMany: vi.fn(), upsert: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn() },
  messageAttachment: { createMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  class: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn(async () => ['parent-1']) }))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({
  resolveHubStaffMembership: vi.fn(async () => ({ id: 'staff-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn() }))
const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'school-1', role: 'PARENT', preferredLanguage: 'en' }
    next()
  }
  return {
    isAuthenticated: attach, isStaff: attach, isAdmin: attach, loadUserWithRelations,
    canSendToTarget: (_r: unknown, _s: unknown, n: () => void) => n(),
    canMarkUrgent: (_r: unknown, _s: unknown, n: () => void) => n(),
  }
})

const { default: partnerRoutes } = await import('../src/routes/partner')
const { default: formsRoutes } = await import('../src/routes/forms')
const { default: messagesRoutes } = await import('../src/routes/messages')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  app.use('/api/forms', formsRoutes)
  app.use('/api/messages', messagesRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer tok')

const REF = 'beyond:consent:t-1'
const FIELDS = [
  { id: 'consent', type: 'yesno', label: 'Do you give consent for your child to go on this trip?' },
  { id: 'pickup', type: 'choice', label: 'How will your child get home?', options: ['Coach', 'Collected'] },
  { id: 'notes', type: 'textarea', label: 'Anything the trip lead should know', required: false },
  { id: 'signed', type: 'name', label: 'Your full name' },
]
const STORED_FIELDS = [
  { id: 'consent', label: 'Do you give consent for your child to go on this trip?', required: true, removable: false, partnerType: 'yesno', type: 'select', options: ['Yes', 'No'], optionsAr: ['نعم', 'لا'] },
  { id: 'pickup', label: 'How will your child get home?', required: true, removable: false, partnerType: 'choice', type: 'select', options: ['Coach', 'Collected'] },
  { id: 'notes', label: 'Anything the trip lead should know', required: false, removable: false, partnerType: 'textarea', type: 'textarea' },
  { id: 'signed', label: 'Your full name', required: true, removable: false, partnerType: 'name', type: 'text', placeholder: 'Your full name' },
]
const FORM = {
  id: 'f-1', schoolId: 'school-1', externalRef: REF, managedBy: 'beyond', perChild: true,
  title: 'Consent: Year 4 Etihad Museum', description: null, status: 'ACTIVE',
  expiresAt: new Date('2099-10-18T20:00:00.000Z'), fields: STORED_FIELDS,
  type: 'permission-consent', targetClass: 'Selected pupils', classIds: [], yearGroupIds: [],
  createdAt: new Date('2026-10-10T08:00:00Z'), updatedAt: new Date('2026-10-10T08:00:00Z'),
}

// The school's pupils Connect knows, for pupil choices (C14). stu-1 and stu-2
// are the answering parent's own children (see PARENT below).
const PUPILS = [
  { id: 'stu-1', firstName: 'Omar', lastName: 'Haddad', hubPupilId: 'hub-omar' },
  { id: 'stu-2', firstName: 'Lina', lastName: 'Haddad', hubPupilId: 'hub-lina' },
  { id: 'stu-9', firstName: 'Jade', lastName: 'williams', hubPupilId: 'hub-jade' },
  { id: 'stu-8', firstName: 'Aisha', lastName: 'Rahman', hubPupilId: 'hub-aisha' },
]

beforeEach(() => {
  vi.clearAllMocks()
  // The school has turned Wasil Beyond on (services/partnerSwitch).
  prismaMock.school.findUnique.mockResolvedValue({ beyondEnabled: true })
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'beyond', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
  prismaMock.form.create.mockImplementation(async ({ data }: any) => ({ ...FORM, ...data, id: 'f-1' }))
  prismaMock.form.update.mockImplementation(async ({ data }: any) => ({ ...FORM, ...data }))
  prismaMock.message.create.mockResolvedValue({ id: 'm-1' })
  prismaMock.student.findMany.mockImplementation(async ({ where }: any) =>
    PUPILS.filter(p => where.schoolId === 'school-1' && where.hubPupilId.in.includes(p.hubPupilId)))
})

describe('PUT /api/partner/forms/:externalRef', () => {
  const publish = (body: Record<string, unknown> = {}) =>
    auth(request(makeApp()).put(`/api/partner/forms/${REF}`)).send({
      hub_user_id: 'hub-lead', title: 'Consent: Year 4 Etihad Museum', deadline: '2099-10-18T20:00:00.000Z',
      fields: FIELDS, ...body,
    })

  it('creates a per-child form owned by the caller, in Connect\'s own field vocabulary', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    const res = await publish()
    expect(res.status).toBe(201)
    const data = prismaMock.form.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      perChild: true, externalRef: REF, managedBy: 'beyond', status: 'ACTIVE', schoolId: 'school-1',
      // Targets nothing itself, so it never surfaces on the Forms list.
      classIds: [], yearGroupIds: [],
      expiresAt: new Date('2099-10-18T20:00:00.000Z'),
    })
    expect(data.fields).toEqual(STORED_FIELDS)
  })

  it('answers with the form in the partner\'s own vocabulary', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    const res = await publish()
    expect(res.body).toMatchObject({ id: 'f-1', externalRef: REF, perChild: true, deadline: '2099-10-18T20:00:00.000Z' })
    expect(res.body.fields.map((f: any) => f.type)).toEqual(['yesno', 'choice', 'textarea', 'name'])
    expect(res.body.fields[1].options).toEqual(['Coach', 'Collected'])
  })

  it.each([
    ['no fields', { fields: [] }],
    ['an unknown type', { fields: [{ id: 'a', type: 'medical', label: 'Allergies' }] }],
    ['a field id used twice', { fields: [FIELDS[0], FIELDS[0]] }],
    ['a choice with one option', { fields: [{ id: 'a', type: 'choice', label: 'Pick', options: ['Only'] }] }],
    ['a field with no label', { fields: [{ id: 'a', type: 'text', label: ' ' }] }],
    ['an odd field id', { fields: [{ id: 'a b', type: 'text', label: 'Name' }] }],
    ['no title', { title: '' }],
    ['a bad status', { status: 'OPEN' }],
  ])('refuses %s', async (_what, body) => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    const res = await publish(body)
    expect(res.status).toBe(400)
    expect(prismaMock.form.create).not.toHaveBeenCalled()
  })

  it('updates the same form on a re-publish', async () => {
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', managedBy: 'beyond', fields: STORED_FIELDS, _count: { responses: 0 } })
    const res = await publish({ title: 'Consent: Year 4 Etihad Museum (new date)' })
    expect(res.status).toBe(200)
    expect(prismaMock.form.update).toHaveBeenCalled()
    expect(prismaMock.form.create).not.toHaveBeenCalled()
  })

  it('refuses another app', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-2', name: 'desk', revokedAt: null })
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', managedBy: 'beyond', fields: STORED_FIELDS, _count: { responses: 0 } })
    const res = await publish()
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('form_managed_elsewhere')
  })

  it('fixes the questions once anyone has answered, but not the deadline', async () => {
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', managedBy: 'beyond', fields: STORED_FIELDS, _count: { responses: 3 } })
    const changed = await publish({ fields: [FIELDS[0]] })
    expect(changed.status).toBe(409)
    expect(changed.body.error).toBe('form_has_answers')

    const later = await publish({ deadline: '2099-10-19T20:00:00.000Z' })
    expect(later.status).toBe(200)
    expect(prismaMock.form.update.mock.calls[0][0].data.expiresAt).toEqual(new Date('2099-10-19T20:00:00.000Z'))
  })

  it('closes on request', async () => {
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', managedBy: 'beyond', fields: STORED_FIELDS, _count: { responses: 3 } })
    await publish({ status: 'CLOSED' })
    expect(prismaMock.form.update.mock.calls[0][0].data.status).toBe('CLOSED')
  })
})

describe('attaching the form to a post', () => {
  const post = (formRef: string) =>
    auth(request(makeApp()).post('/api/partner/messages')).send({
      hub_user_id: 'hub-lead', title: 'Consent for the museum trip', content: 'Please answer for each child.',
      audience: { groupIds: ['g-1'] }, formRef,
    })

  beforeEach(() => prismaMock.group.findMany.mockResolvedValue([{ id: 'g-1', name: 'Trip', isActive: true }]))

  it('carries the form on the post', async () => {
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', status: 'ACTIVE', managedBy: 'beyond', expiresAt: null })
    const res = await post(REF)
    expect(res.status).toBe(201)
    expect(prismaMock.message.create.mock.calls[0][0].data.formId).toBe('f-1')
  })

  it('refuses an unknown form', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    const res = await post('beyond:consent:nope')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('unknown_form')
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })

  it('refuses another app\'s form', async () => {
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', status: 'ACTIVE', managedBy: 'active', expiresAt: null })
    expect((await post(REF)).status).toBe(409)
  })

  it('refuses a form past its deadline', async () => {
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', status: 'ACTIVE', managedBy: 'beyond', expiresAt: new Date('2020-01-01') })
    const res = await post(REF)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('form_closed')
  })
})

// The parent: two children on the trip (stu-1, stu-2), one not (stu-3).
const PARENT = {
  id: 'parent-1', schoolId: 'school-1', preferredLanguage: 'en', children: [],
  studentLinks: [
    { studentId: 'stu-1', student: { firstName: 'Omar', lastName: 'Haddad', hubPupilId: 'hub-omar', classId: 'c-4a', class: { yearGroupId: 'y4' } } },
    { studentId: 'stu-2', student: { firstName: 'Lina', lastName: 'Haddad', hubPupilId: 'hub-lina', classId: 'c-4b', class: { yearGroupId: 'y4' } } },
    { studentId: 'stu-3', student: { firstName: 'Sami', lastName: 'Haddad', classId: 'c-1a', class: { yearGroupId: 'y1' } } },
  ],
}

function onTheTrip() {
  loadUserWithRelations.mockResolvedValue(PARENT)
  prismaMock.message.findMany.mockImplementation(async (args: any) =>
    args?.where?.formId ? [{ formId: 'f-1', targetClass: 'Trip', classId: null, yearGroupId: null, groupId: 'g-1', studentTargets: [] }] : [])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([
    { studentId: 'stu-1', groupId: 'g-1' }, { studentId: 'stu-2', groupId: 'g-1' },
  ])
}

describe('a parent answering, once per child', () => {
  const answer = (body: Record<string, unknown>) =>
    request(makeApp()).post('/api/forms/f-1/respond').send(body)
  const ANSWERS = { consent: 'Yes', pickup: 'Coach', signed: 'Rania Haddad' }

  beforeEach(() => {
    onTheTrip()
    prismaMock.form.findFirst.mockResolvedValue(FORM)
    prismaMock.formResponse.findMany.mockResolvedValue([])
    prismaMock.formResponse.upsert.mockImplementation(async ({ create }: any) => ({
      id: `r-${create.studentId}`, ...create, createdAt: new Date(),
    }))
  })

  it('stores the answer against the child, keyed so the other guardian replaces it', async () => {
    const res = await answer({ answers: ANSWERS, studentId: 'stu-2' })
    expect(res.status).toBe(200)
    expect(res.body.studentId).toBe('stu-2')
    expect(prismaMock.formResponse.upsert).toHaveBeenCalledWith({
      where: { formId_studentId: { formId: 'f-1', studentId: 'stu-2' } },
      update: { answers: ANSWERS, userId: 'parent-1' },
      create: { formId: 'f-1', userId: 'parent-1', studentId: 'stu-2', answers: ANSWERS },
    })
  })

  it('answers each child separately', async () => {
    await answer({ answers: ANSWERS, studentId: 'stu-1' })
    await answer({ answers: { ...ANSWERS, consent: 'No' }, studentId: 'stu-2' })
    expect(prismaMock.formResponse.upsert).toHaveBeenCalledTimes(2)
  })

  it('needs to know which child', async () => {
    const res = await answer({ answers: ANSWERS })
    expect(res.status).toBe(400)
    expect(prismaMock.formResponse.upsert).not.toHaveBeenCalled()
  })

  it('refuses a child the form is not asking about, even the parent\'s own', async () => {
    expect((await answer({ answers: ANSWERS, studentId: 'stu-3' })).status).toBe(403)
    // And another family's child reads exactly the same.
    expect((await answer({ answers: ANSWERS, studentId: 'stu-other' })).status).toBe(403)
    expect(prismaMock.formResponse.upsert).not.toHaveBeenCalled()
  })

  it('refuses an answer after the deadline', async () => {
    prismaMock.form.findFirst.mockResolvedValue({ ...FORM, expiresAt: new Date('2020-01-01') })
    const res = await answer({ answers: ANSWERS, studentId: 'stu-1' })
    expect(res.status).toBe(409)
    expect(prismaMock.formResponse.upsert).not.toHaveBeenCalled()
  })

  it('still checks required questions', async () => {
    const res = await answer({ answers: { pickup: 'Coach', signed: 'Rania Haddad' }, studentId: 'stu-1' })
    expect(res.status).toBe(400)
  })
})

describe('the post as the parent sees it', () => {
  const feedRow = {
    id: 'm-1', title: 'Consent', content: '<p>Please answer</p>', targetClass: 'Trip', classId: null,
    yearGroupId: null, groupId: 'g-1', schoolId: 'school-1', senderId: 's', sender: { id: 's', name: 'Mrs Ahmed' },
    actionType: null, actionLabel: null, actionDueDate: null, actionAmount: null, isPinned: false, isUrgent: false,
    requiresAcknowledgment: false, expiresAt: null, formId: 'f-1', acknowledgments: [], _count: { acknowledgments: 0 },
    attachments: [], createdAt: new Date('2026-10-10T08:00:00Z'),
    form: { ...FORM, responses: [] },
  }

  beforeEach(() => {
    onTheTrip()
    prismaMock.class.findMany.mockResolvedValue([])
    const feed = prismaMock.message.findMany.getMockImplementation()!
    prismaMock.message.findMany.mockImplementation(async (args: any) =>
      args?.where?.formId ? feed(args) : [feedRow])
  })

  it('lists each child the form asks about, and is not done until all are answered', async () => {
    prismaMock.formResponse.findMany.mockResolvedValue([{
      id: 'r-1', formId: 'f-1', studentId: 'stu-1', answers: { consent: 'Yes' },
      createdAt: new Date('2026-10-11T08:00:00Z'), updatedAt: new Date('2026-10-11T08:00:00Z'),
      user: { name: 'Karim Haddad' },
    }])
    const res = await request(makeApp()).get('/api/messages')
    const form = res.body[0].form
    expect(form.perChild).toBe(true)
    expect(form.children.map((c: any) => [c.name, !!c.response])).toEqual([['Omar Haddad', true], ['Lina Haddad', false]])
    // Answered by the other guardian, and the parent can see that.
    expect(form.children[0].response.answeredBy).toBe('Karim Haddad')
    expect(form.userResponse).toBeNull()
  })

  it('reads as complete once every child has an answer', async () => {
    prismaMock.formResponse.findMany.mockResolvedValue(['stu-1', 'stu-2'].map(studentId => ({
      id: `r-${studentId}`, formId: 'f-1', studentId, answers: { consent: 'Yes' },
      createdAt: new Date(), updatedAt: new Date(), user: { name: 'Rania Haddad' },
    })))
    const res = await request(makeApp()).get('/api/messages')
    expect(res.body[0].form.userResponse).not.toBeNull()
  })
})

describe('GET /api/partner/forms/:externalRef/responses', () => {
  const read = (q = '') => auth(request(makeApp()).get(`/api/partner/forms/${REF}/responses?school_id=hub-school${q}`))
  const ROW = (id: string, at: string, consent: string) => ({
    id, answers: { consent, pickup: 'Coach', signed: 'Rania Haddad' },
    createdAt: new Date('2026-10-11T08:00:00Z'), updatedAt: new Date(at),
    student: { hubPupilId: `hub-${id}` }, user: { name: 'Rania Haddad', hubUserId: 'hub-guardian-1' },
  })

  beforeEach(() => prismaMock.form.findFirst.mockResolvedValue(FORM))

  it('gives one entry per child: pupil, answers, who answered and when', async () => {
    prismaMock.formResponse.findMany.mockResolvedValue([ROW('r-1', '2026-10-11T08:00:00Z', 'Yes')])
    const res = await read()
    expect(res.status).toBe(200)
    expect(res.body.responses).toEqual([{
      pupilHubId: 'hub-r-1',
      // A yes/no question reads back as a boolean.
      answers: { consent: true, pickup: 'Coach', signed: 'Rania Haddad' },
      answeredBy: { name: 'Rania Haddad', hubUserId: 'hub-guardian-1' },
      firstAnsweredAt: '2026-10-11T08:00:00.000Z',
      answeredAt: '2026-10-11T08:00:00.000Z',
    }])
    expect(res.body.form.externalRef).toBe(REF)
    expect(res.body.hasMore).toBe(false)
  })

  it('pages forwards with the cursor it hands out', async () => {
    prismaMock.formResponse.findMany.mockResolvedValue([
      ROW('r-1', '2026-10-11T08:00:00Z', 'Yes'), ROW('r-2', '2026-10-11T09:00:00Z', 'No'),
    ])
    const first = await read('&limit=1')
    expect(first.body.responses).toHaveLength(1)
    expect(first.body.hasMore).toBe(true)

    prismaMock.formResponse.findMany.mockResolvedValue([])
    const second = await read(`&since=${first.body.next}`)
    const where = prismaMock.formResponse.findMany.mock.calls[1][0].where
    expect(where.OR).toEqual([
      { updatedAt: { gt: new Date('2026-10-11T08:00:00Z') } },
      { updatedAt: new Date('2026-10-11T08:00:00Z'), id: { gt: 'r-1' } },
    ])
    // Nothing new: the same cursor back, so it can be stored blindly.
    expect(second.body.next).toBe(first.body.next)
  })

  it('takes a plain time for a first read', async () => {
    prismaMock.formResponse.findMany.mockResolvedValue([])
    await read('&since=2026-10-11T00:00:00.000Z')
    expect(prismaMock.formResponse.findMany.mock.calls[0][0].where.OR).toEqual([
      { updatedAt: { gt: new Date('2026-10-11T00:00:00.000Z') } },
    ])
  })

  it('is for the owning app only', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-2', name: 'desk', revokedAt: null })
    const res = await read()
    expect(res.status).toBe(409)
    expect(prismaMock.formResponse.findMany).not.toHaveBeenCalled()
  })

  it('404s a form it does not hold', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    expect((await read()).status).toBe(404)
  })

  it('refuses a cursor it did not make', async () => {
    expect((await read('&since=not-a-cursor')).status).toBe(400)
  })
})

describe('a Connect admin and a partner form', () => {
  it('cannot edit or delete it, because its answers are a trip\'s consent record', async () => {
    prismaMock.form.findFirst.mockResolvedValue(FORM)
    const put = await request(makeApp()).put('/api/forms/f-1').send({ title: 'Changed' })
    const del = await request(makeApp()).delete('/api/forms/f-1')
    for (const res of [put, del]) {
      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ code: 'form_managed_elsewhere', managedBy: 'beyond' })
    }
    expect(prismaMock.form.update).not.toHaveBeenCalled()
  })
})

// C14: a pupil choice, for room-sharing friendship choices on a residential trip.
describe('a pupil_choice field', () => {
  const ROOM_REF = 'beyond:rooms:t-1'
  const ROOM_IDS = ['hub-jade', 'hub-aisha', 'hub-omar', 'hub-lina', 'hub-gone']
  const ROOM_FIELDS = [
    { id: 'friend_1', type: 'pupil_choice', label: 'First choice', labelAr: 'الاختيار الأول', required: true, pupilHubIds: ROOM_IDS },
    { id: 'friend_2', type: 'pupil_choice', label: 'Second choice', required: false, pupilHubIds: ROOM_IDS },
  ]
  const ROOM_STORED = [
    { id: 'friend_1', label: 'First choice', required: true, removable: false, partnerType: 'pupil_choice', labelAr: 'الاختيار الأول', type: 'pupil_choice', pupilHubIds: ROOM_IDS },
    { id: 'friend_2', label: 'Second choice', required: false, removable: false, partnerType: 'pupil_choice', type: 'pupil_choice', pupilHubIds: ROOM_IDS },
  ]
  const ROOM_FORM = { ...FORM, externalRef: ROOM_REF, fields: ROOM_STORED }

  const publish = (fields: unknown) =>
    auth(request(makeApp()).put(`/api/partner/forms/${ROOM_REF}`)).send({ hub_user_id: 'hub-lead', title: 'Room choices', fields })

  describe('publishing', () => {
    it('stores the Hub ids and answers with them', async () => {
      prismaMock.form.findFirst.mockResolvedValue(null)
      const res = await publish(ROOM_FIELDS)
      expect(res.status).toBe(201)
      expect(prismaMock.form.create.mock.calls[0][0].data.fields).toEqual(ROOM_STORED)
      expect(res.body.fields[0]).toEqual({
        id: 'friend_1', type: 'pupil_choice', label: 'First choice', labelAr: 'الاختيار الأول', required: true, pupilHubIds: ROOM_IDS,
      })
    })

    it.each([
      ['no pupilHubIds', {}],
      ['an empty list', { pupilHubIds: [] }],
      ['more than 400', { pupilHubIds: Array.from({ length: 401 }, (_, i) => `hub-${i}`) }],
      ['an id given twice', { pupilHubIds: ['hub-jade', 'hub-jade'] }],
      ['a non-string id', { pupilHubIds: ['hub-jade', 7] }],
      ['a blank id', { pupilHubIds: ['hub-jade', ' '] }],
      ['options', { pupilHubIds: ['hub-jade'], options: ['a', 'b'] }],
    ])('refuses %s', async (_what, extra) => {
      prismaMock.form.findFirst.mockResolvedValue(null)
      const res = await publish([{ id: 'friend_1', type: 'pupil_choice', label: 'First choice', ...extra }])
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('friend_1')
      expect(prismaMock.form.create).not.toHaveBeenCalled()
    })

    it('takes exactly 400', async () => {
      prismaMock.form.findFirst.mockResolvedValue(null)
      const res = await publish([{ id: 'friend_1', type: 'pupil_choice', label: 'First choice', pupilHubIds: Array.from({ length: 400 }, (_, i) => `hub-${i}`) }])
      expect(res.status).toBe(201)
    })

    it('lets the pupils change after answers, but not the question', async () => {
      prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', managedBy: 'beyond', fields: ROOM_STORED, _count: { responses: 2 } })
      const moved = await publish(ROOM_FIELDS.map(f => ({ ...f, pupilHubIds: ['hub-jade', 'hub-new'] })))
      expect(moved.status).toBe(200)
      expect(prismaMock.form.update.mock.calls[0][0].data.fields[0].pupilHubIds).toEqual(['hub-jade', 'hub-new'])

      const relabelled = await publish(ROOM_FIELDS.map(f => ({ ...f, label: `${f.label}!` })))
      expect(relabelled.status).toBe(409)
      expect(relabelled.body.error).toBe('form_has_answers')
    })
  })

  describe('answering', () => {
    const answer = (answers: Record<string, unknown>, studentId = 'stu-1') =>
      request(makeApp()).post('/api/forms/f-1/respond').send({ answers, studentId })

    beforeEach(() => {
      onTheTrip()
      prismaMock.form.findFirst.mockResolvedValue(ROOM_FORM)
      prismaMock.formResponse.findMany.mockResolvedValue([])
      prismaMock.formResponse.upsert.mockImplementation(async ({ create }: any) => ({
        id: `r-${create.studentId}`, ...create, createdAt: new Date(),
      }))
    })

    it('stores the chosen pupil\'s Hub id, and drops an empty optional choice', async () => {
      const res = await answer({ friend_1: 'hub-jade', friend_2: '' })
      expect(res.status).toBe(200)
      expect(prismaMock.formResponse.upsert.mock.calls[0][0].create.answers).toEqual({ friend_1: 'hub-jade' })
    })

    it('may choose a sibling, just not the child answered for', async () => {
      expect((await answer({ friend_1: 'hub-lina' }, 'stu-1')).status).toBe(200)
      const self = await answer({ friend_1: 'hub-omar' }, 'stu-1')
      expect(self.status).toBe(400)
      expect(self.body).toMatchObject({ error: 'invalid_choice', field: 'friend_1' })
    })

    it.each([
      ['a pupil not on the list', 'hub-stranger'],
      ['a listed id with no pupil in Connect', 'hub-gone'],
      ['a non-string', 42],
    ])('refuses %s', async (_what, value) => {
      const res = await answer({ friend_1: value })
      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ error: 'invalid_choice', field: 'friend_1' })
      expect(prismaMock.formResponse.upsert).not.toHaveBeenCalled()
    })

    it('refuses the same pupil twice for one child', async () => {
      const res = await answer({ friend_1: 'hub-jade', friend_2: 'hub-jade' })
      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ error: 'duplicate_choice', field: 'friend_2' })
      expect(prismaMock.formResponse.upsert).not.toHaveBeenCalled()
    })

    it('still requires a required choice', async () => {
      expect((await answer({ friend_2: 'hub-jade' })).status).toBe(400)
    })

    it('is not answerable while Beyond is off for the school', async () => {
      // The switch is applied in the query (parentVisibleFormWhere): no form comes back.
      prismaMock.form.findFirst.mockResolvedValue(null)
      expect((await answer({ friend_1: 'hub-jade' })).status).toBe(404)
    })
  })

  it('reaches the parent as named options, never as the list of Hub ids', async () => {
    onTheTrip()
    prismaMock.class.findMany.mockResolvedValue([])
    prismaMock.formResponse.findMany.mockResolvedValue([])
    const feed = prismaMock.message.findMany.getMockImplementation()!
    prismaMock.message.findMany.mockImplementation(async (args: any) => args?.where?.formId ? feed(args) : [{
      id: 'm-1', title: 'Rooms', content: 'Choose', targetClass: 'Trip', classId: null, yearGroupId: null, groupId: 'g-1',
      schoolId: 'school-1', senderId: 's', sender: { id: 's', name: 'Mrs Ahmed' }, actionType: null, actionLabel: null,
      actionDueDate: null, actionAmount: null, isPinned: false, isUrgent: false, requiresAcknowledgment: false, expiresAt: null,
      formId: 'f-1', acknowledgments: [], _count: { acknowledgments: 0 }, attachments: [], createdAt: new Date(),
      form: { ...ROOM_FORM, responses: [] },
    }])
    const res = await request(makeApp()).get('/api/messages')
    const form = res.body[0].form
    expect(form.fields[0].pupilHubIds).toBeUndefined()
    // Sorted by label; the id with no Connect pupil is not offered. The app
    // leaves out the child being answered for, by the child's hubPupilId.
    expect(form.fields[0].pupilOptions).toEqual([
      { value: 'hub-aisha', label: 'Aisha R.' },
      { value: 'hub-jade', label: 'Jade W.' },
      { value: 'hub-lina', label: 'Lina H.' },
      { value: 'hub-omar', label: 'Omar H.' },
    ])
    expect(form.children.map((c: any) => c.hubPupilId)).toEqual(['hub-omar', 'hub-lina'])
  })

  it('reads back as the Hub pupil id, or null when left empty', async () => {
    prismaMock.form.findFirst.mockResolvedValue(ROOM_FORM)
    prismaMock.formResponse.findMany.mockResolvedValue([{
      id: 'r-1', answers: { friend_1: 'hub-jade' }, createdAt: new Date('2026-10-11T08:00:00Z'), updatedAt: new Date('2026-10-11T08:00:00Z'),
      student: { hubPupilId: 'hub-omar' }, user: { name: 'Rania Haddad', hubUserId: 'hub-guardian-1' },
    }])
    const res = await auth(request(makeApp()).get(`/api/partner/forms/${ROOM_REF}/responses?school_id=hub-school`))
    expect(res.body.responses[0].answers).toEqual({ friend_1: 'hub-jade' })
    expect(res.body.form.fields[1].pupilHubIds).toEqual(ROOM_IDS)
  })

  it('shows a school admin the chosen child\'s name', async () => {
    ;(prismaMock.form as any).findMany = vi.fn().mockResolvedValue([{
      ...ROOM_FORM, responses: [{ id: 'r-1', answers: { friend_1: 'hub-jade' }, user: { name: 'Rania', email: 'r@x' }, createdAt: new Date() }],
    }])
    const res = await request(makeApp()).get('/api/forms/all')
    expect(res.status).toBe(200)
    expect(res.body[0].pupilNames).toEqual({ 'hub-jade': 'Jade williams' })
  })
})
