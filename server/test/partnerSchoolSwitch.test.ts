import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { Prisma } from '@prisma/client'

/**
 * The per-school switch for Wasil Beyond.
 *
 * "Connect shouldn't show anything to parents without it explicitly been
 * turned on there." So Beyond is off for every school until a school admin
 * turns it on in Settings, and while it is off:
 *
 *   - every Beyond write that could reach parents is refused, 403
 *     partner_not_enabled, before anything is written;
 *   - reads of its own data still work, and so does the status read;
 *   - whatever Beyond already wrote is hidden from parents (feed, archive,
 *     notices, search, notifications, groups, answering its forms), and comes
 *     back when the switch is turned on again.
 */

const prismaMock = {
  school: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  partnerMessageSend: { findUnique: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  group: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  groupCategory: { findFirst: vi.fn(), findMany: vi.fn() },
  student: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  form: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  formResponse: { findMany: vi.fn() },
  message: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  notification: { findMany: vi.fn(), count: vi.fn(), createMany: vi.fn() },
  class: { findMany: vi.fn() },
  event: { findMany: vi.fn() },
  weeklyMessage: { findMany: vi.fn() },
  knowledgeArticle: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), enqueueEmail: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(async () => 'https://files/letter.pdf'), generateKey: vi.fn(() => 'k') }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({
  resolveHubStaffMembership: vi.fn(async () => ({ id: 'staff-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })),
}))
const logAudit = vi.fn()
vi.mock('../src/services/audit', async () => {
  const actual = await vi.importActual<typeof import('../src/services/audit')>('../src/services/audit')
  return { ...actual, logAudit }
})
const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => {
  const as = (role: string) => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: role === 'ADMIN' ? 'admin-1' : 'parent-1', schoolId: 'school-1', role }
    next()
  }
  return {
    isAuthenticated: as('PARENT'), isStaff: as('ADMIN'), isAdmin: as('ADMIN'), loadUserWithRelations,
    canSendToTarget: (_r: unknown, _s: unknown, n: () => void) => n(),
    canMarkUrgent: (_r: unknown, _s: unknown, n: () => void) => n(),
  }
})

const { default: partnerRoutes } = await import('../src/routes/partner')
const { default: settingsRoutes } = await import('../src/routes/schoolSettings')
const { default: messagesRoutes } = await import('../src/routes/messages')
const { default: searchRoutes } = await import('../src/routes/search')
const { default: groupsRoutes } = await import('../src/routes/groups')
const { default: formsRoutes } = await import('../src/routes/forms')
const { default: notificationsRoutes } = await import('../src/routes/notifications')
const { sendNotification } = await import('../src/services/notify')
const { uploadFile } = await import('../src/services/storage')
const {
  partnerEnabledForSchool, parentVisibleMessageWhere, parentHiddenMessageWhere,
  parentVisibleGroupWhere, parentVisibleFormWhere,
} = await import('../src/services/partnerSwitch')
const { PARTNER_SCOPE_PRESETS } = await import('../src/services/partnerScopes')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  app.use('/api/school-settings', settingsRoutes)
  app.use('/api/messages', messagesRoutes)
  app.use('/api/search', searchRoutes)
  app.use('/api/groups', groupsRoutes)
  app.use('/api/forms', formsRoutes)
  app.use('/api/notifications', notificationsRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer tok')

const NOT_ENABLED = {
  error: 'partner_not_enabled',
  message: 'Wasil Beyond is not turned on for this school in Connect.',
}

let beyondOn = false
const asToken = (name: string) =>
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: `pt-${name}`, name, revokedAt: null })

beforeEach(() => {
  vi.clearAllMocks()
  beyondOn = false
  asToken('beyond')
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
  // The partner switch and the settings snapshot both read the school.
  prismaMock.school.findUnique.mockImplementation(async () => ({ id: 'school-1', name: 'VHPS', beyondEnabled: beyondOn }))
  prismaMock.school.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'school-1', name: 'VHPS', beyondEnabled: beyondOn, ...data,
  }))
})

// ── 1. Off by default ───────────────────────────────────────────────────────

describe('off by default', () => {
  it('is a School column that defaults to false', () => {
    const school = Prisma.dmmf.datamodel.models.find(m => m.name === 'School')!
    const field = school.fields.find(f => f.name === 'beyondEnabled')!
    expect(field.type).toBe('Boolean')
    expect(field.isRequired).toBe(true)
    expect(field.default).toBe(false)
  })

  it('reads as off for a school that has not turned it on, or cannot be found', async () => {
    prismaMock.school.findUnique.mockResolvedValueOnce({ beyondEnabled: false })
    expect(await partnerEnabledForSchool('beyond', 'school-1')).toBe(false)
    prismaMock.school.findUnique.mockResolvedValueOnce(null)
    expect(await partnerEnabledForSchool('beyond', 'school-1')).toBe(false)
    prismaMock.school.findUnique.mockResolvedValueOnce({ beyondEnabled: true })
    expect(await partnerEnabledForSchool('beyond', 'school-1')).toBe(true)
  })

  it('does not gate a partner with no switch (Desk, Active)', async () => {
    expect(await partnerEnabledForSchool('desk', 'school-1')).toBe(true)
    expect(await partnerEnabledForSchool('active', 'school-1')).toBe(true)
    expect(prismaMock.school.findUnique).not.toHaveBeenCalled()
  })
})

// ── 2. Writes refused while off ─────────────────────────────────────────────

describe('Beyond writes while the school has it off', () => {
  const REF = 'beyond%3Atrip%3A1'
  const writes: [string, () => request.Test][] = [
    ['POST /groups', () => request(makeApp()).post('/api/partner/groups').send({ hub_user_id: 'hub-1', name: 'Trip', externalRef: 'beyond:trip:1' })],
    ['PATCH /groups/:ref', () => request(makeApp()).patch(`/api/partner/groups/${REF}`).send({ hub_user_id: 'hub-1', name: 'Trip 2' })],
    ['DELETE /groups/:ref', () => request(makeApp()).delete(`/api/partner/groups/${REF}`).send({ hub_user_id: 'hub-1' })],
    ['PUT /groups/:ref/roster', () => request(makeApp()).put(`/api/partner/groups/${REF}/roster`).send({ hub_user_id: 'hub-1', version: '2026-10-21T08:00:00Z', pupilHubIds: [] })],
    ['POST /messages', () => request(makeApp()).post('/api/partner/messages').send({ hub_user_id: 'hub-1', title: 'Hi', content: 'Hi', audience: { groupIds: ['g-1'] } })],
    ['PUT /forms/:ref', () => request(makeApp()).put('/api/partner/forms/beyond%3Aconsent%3A1').send({ hub_user_id: 'hub-1', title: 'Consent', fields: [{ id: 'ok', type: 'yesno', label: 'OK?' }] })],
  ]

  for (const [name, call] of writes) {
    it(`refuses ${name} with partner_not_enabled and writes nothing`, async () => {
      const res = await auth(call())
      expect(res.status).toBe(403)
      expect(res.body).toEqual(NOT_ENABLED)
      expect(prismaMock.group.create).not.toHaveBeenCalled()
      expect(prismaMock.group.update).not.toHaveBeenCalled()
      expect(prismaMock.message.create).not.toHaveBeenCalled()
      expect(prismaMock.form.create).not.toHaveBeenCalled()
      expect(prismaMock.form.update).not.toHaveBeenCalled()
    })
  }

  it('refuses a retried send too, before looking at the idempotency key', async () => {
    const res = await auth(request(makeApp()).post('/api/partner/messages').send({
      hub_user_id: 'hub-1', title: 'Hi', content: 'Hi', audience: { groupIds: ['g-1'] }, idempotency_key: 'k-1',
    }))
    expect(res.status).toBe(403)
    expect(res.body).toEqual(NOT_ENABLED)
    expect(prismaMock.partnerMessageSend.findUnique).not.toHaveBeenCalled()
  })

  it('refuses an upload, and asks which school it is for', async () => {
    const upload = (school?: string) => {
      const r = auth(request(makeApp()).post('/api/partner/inbox/upload'))
      if (school) r.field('school_id', school)
      return r.attach('file', Buffer.from('%PDF-1.4\n%%EOF'), { filename: 'letter.pdf', contentType: 'application/pdf' })
    }
    const off = await upload('hub-school')
    expect(off.status).toBe(403)
    expect(off.body).toEqual(NOT_ENABLED)

    const unnamed = await upload()
    expect(unnamed.status).toBe(400)
    expect(unnamed.body).toEqual({ error: 'school_id required' })
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('still lets Beyond read the answers to its own form', async () => {
    prismaMock.form.findFirst.mockResolvedValue({
      id: 'f-1', externalRef: 'beyond:consent:1', managedBy: 'beyond', status: 'ACTIVE', perChild: true,
      expiresAt: null, fields: [], title: 'Consent', description: null, titleAr: null, descriptionAr: null,
    })
    prismaMock.formResponse.findMany.mockResolvedValue([])
    const res = await auth(request(makeApp()).get('/api/partner/forms/beyond%3Aconsent%3A1/responses?school_id=hub-school'))
    expect(res.status).toBe(200)
    expect(res.body.responses).toEqual([])
  })

  it('does not gate a partner with no switch', async () => {
    asToken('desk')
    const res = await auth(request(makeApp()).delete('/api/partner/groups/g-1').send({ hub_user_id: 'hub-1' }))
    expect(res.body.error).not.toBe('partner_not_enabled')
  })

  it('lets the write through once the school turns Beyond on', async () => {
    beyondOn = true
    prismaMock.group.findFirst.mockResolvedValue({ id: 'g-1', managedBy: 'beyond', isActive: true })
    const res = await auth(request(makeApp()).delete(`/api/partner/groups/${REF}`).send({ hub_user_id: 'hub-1' }))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, id: 'g-1' })
  })
})

// ── 3. Status ───────────────────────────────────────────────────────────────

describe('GET /api/partner/status', () => {
  const status = (q = '?school_id=hub-school') => auth(request(makeApp()).get(`/api/partner/status${q}`))

  it('is in the beyond preset', () => {
    expect(PARTNER_SCOPE_PRESETS.beyond.allowedPrefixes).toContain('/api/partner/status')
  })

  it('answers false while off, and is not itself refused', async () => {
    const res = await status()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enabled: false })
  })

  it('answers true once turned on', async () => {
    beyondOn = true
    expect((await status()).body).toEqual({ enabled: true })
  })

  it('looks the school up by Hub or Connect id', async () => {
    await status()
    expect(prismaMock.school.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ hubSchoolId: 'hub-school' }, { id: 'hub-school' }] },
    }))
  })

  it('needs a school, and a known one', async () => {
    expect((await status('')).status).toBe(400)
    prismaMock.school.findFirst.mockResolvedValue(null)
    const res = await status()
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'unknown_school' })
  })

  it('answers true for a partner with no switch', async () => {
    asToken('desk')
    expect((await status()).body).toEqual({ enabled: true })
  })
})

// ── 4. The admin toggle ─────────────────────────────────────────────────────

describe('turning Beyond on in school settings', () => {
  it('saves the switch and audits who changed it', async () => {
    const res = await request(makeApp()).patch('/api/school-settings').send({ beyondEnabled: true })
    expect(res.status).toBe(200)
    expect(prismaMock.school.update.mock.calls[0][0].data).toEqual({ beyondEnabled: true })
    expect(res.body.beyondEnabled).toBe(true)
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      resourceType: 'SCHOOL',
      resourceId: 'school-1',
      changes: expect.objectContaining({ beyondEnabled: { from: false, to: true } }),
    }))
  })

  it('turns it off the same way', async () => {
    beyondOn = true
    const res = await request(makeApp()).patch('/api/school-settings').send({ beyondEnabled: false })
    expect(res.status).toBe(200)
    expect(prismaMock.school.update.mock.calls[0][0].data).toEqual({ beyondEnabled: false })
  })

  it('is read back with the other settings', async () => {
    const res = await request(makeApp()).get('/api/school-settings')
    expect(res.status).toBe(200)
    expect(prismaMock.school.findUnique.mock.calls[0][0].select.beyondEnabled).toBe(true)
    expect(res.body.beyondEnabled).toBe(false)
  })
})

// ── 5. What parents see ─────────────────────────────────────────────────────
//
// The clauses are evaluated here against rows, with the same meaning SQL gives
// them (a comparison with NULL is never true), so "hidden when off, shown when
// on" is checked on the clauses themselves and not only on their shape.

type Row = Record<string, unknown>
function matches(row: Row | null | undefined, where: Record<string, any>): boolean {
  if (!row) return false
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Record<string, any>[]).every(c => matches(row, c))
    if (key === 'OR') return (cond as Record<string, any>[]).some(c => matches(row, c))
    const v = row[key]
    if (cond === null) return v === null || v === undefined
    if (typeof cond === 'object') {
      if ('not' in cond) return v !== null && v !== undefined && v !== cond.not
      return matches(v as Row | null, cond)
    }
    return v === cond
  })
}

const post = (over: Row = {}): Row => ({ partnerSource: null, groupId: null, group: null, formId: null, form: null, ...over })
const beyondGroup = { managedBy: 'beyond' }
const POSTS: Record<string, Row> = {
  'sent by Beyond to named pupils': post({ partnerSource: 'beyond' }),
  'sent by staff to a Beyond trip group': post({ groupId: 'g-1', group: beyondGroup }),
  'carrying a Beyond consent form': post({ formId: 'f-1', form: { managedBy: 'beyond' } }),
}
const OTHERS: Record<string, Row> = {
  'an ordinary school post': post(),
  'sent by Desk': post({ partnerSource: 'desk' }),
  'to a group Wasil Active keeps': post({ groupId: 'g-2', group: { managedBy: 'active' } }),
  'to a hand-made group': post({ groupId: 'g-3', group: { managedBy: null } }),
}
const withSchool = (row: Row, on: boolean) => ({ ...row, school: { beyondEnabled: on } })
const visible = (row: Row) => parentVisibleMessageWhere().every(c => matches(row, c))

describe('parent visibility clauses', () => {
  for (const [name, row] of Object.entries(POSTS)) {
    it(`hides a post ${name} while off, and shows it again when on`, () => {
      expect(visible(withSchool(row, false))).toBe(false)
      expect(matches(withSchool(row, false), parentHiddenMessageWhere())).toBe(true)
      expect(visible(withSchool(row, true))).toBe(true)
      expect(matches(withSchool(row, true), parentHiddenMessageWhere())).toBe(false)
    })
  }

  for (const [name, row] of Object.entries(OTHERS)) {
    it(`leaves ${name} alone either way`, () => {
      expect(visible(withSchool(row, false))).toBe(true)
      expect(matches(withSchool(row, false), parentHiddenMessageWhere())).toBe(false)
    })
  }

  it('drops a Beyond group from parent group lists while off, and restores it', () => {
    const ok = (g: Row) => parentVisibleGroupWhere().every(c => matches(g, c))
    expect(ok({ managedBy: 'beyond', school: { beyondEnabled: false } })).toBe(false)
    expect(ok({ managedBy: 'beyond', school: { beyondEnabled: true } })).toBe(true)
    expect(ok({ managedBy: null, school: { beyondEnabled: false } })).toBe(true)
    expect(ok({ managedBy: 'active', school: { beyondEnabled: false } })).toBe(true)
  })

  it('makes a Beyond form unanswerable while off, and answerable again when on', () => {
    const ok = (f: Row) => parentVisibleFormWhere().every(c => matches(f, c))
    expect(ok({ managedBy: 'beyond', school: { beyondEnabled: false } })).toBe(false)
    expect(ok({ managedBy: 'beyond', school: { beyondEnabled: true } })).toBe(true)
    expect(ok({ managedBy: null, school: { beyondEnabled: false } })).toBe(true)
  })
})

describe('parent surfaces apply the clauses', () => {
  const PARENT = { id: 'parent-1', schoolId: 'school-1', role: 'PARENT', preferredLanguage: 'en', children: [], studentLinks: [{ studentId: 'stu-1', student: { classId: 'c-1' } }] }
  const hasMessageClause = (where: unknown) => {
    const s = JSON.stringify(where)
    return parentVisibleMessageWhere().every(c => s.includes(JSON.stringify(c)))
  }

  beforeEach(() => {
    loadUserWithRelations.mockResolvedValue(PARENT)
    prismaMock.class.findMany.mockResolvedValue([{ yearGroupId: 'y-1' }])
    prismaMock.studentGroupLink.findMany.mockResolvedValue([])
    prismaMock.message.findMany.mockResolvedValue([])
    prismaMock.message.count.mockResolvedValue(0)
    prismaMock.user.findUnique.mockResolvedValue({ schoolId: 'school-1', noticesLastSeenAt: null })
    for (const m of [prismaMock.event, prismaMock.weeklyMessage, prismaMock.form, prismaMock.knowledgeArticle]) m.findMany.mockResolvedValue([])
  })

  it('the feed', async () => {
    expect((await request(makeApp()).get('/api/messages')).status).toBe(200)
    expect(hasMessageClause(prismaMock.message.findMany.mock.calls[0][0].where)).toBe(true)
  })

  it('the archive', async () => {
    expect((await request(makeApp()).get('/api/messages/archive')).status).toBe(200)
    expect(hasMessageClause(prismaMock.message.findMany.mock.calls[0][0].where)).toBe(true)
  })

  it('admin notices, and their unseen count', async () => {
    expect((await request(makeApp()).get('/api/messages/notices')).status).toBe(200)
    expect(hasMessageClause(prismaMock.message.findMany.mock.calls[0][0].where)).toBe(true)
    expect((await request(makeApp()).get('/api/messages/notices/unseen-count')).status).toBe(200)
    expect(hasMessageClause(prismaMock.message.count.mock.calls[0][0].where)).toBe(true)
  })

  it('search, for posts and forms', async () => {
    expect((await request(makeApp()).get('/api/search?q=trip')).status).toBe(200)
    expect(hasMessageClause(prismaMock.message.findMany.mock.calls[0][0].where)).toBe(true)
    const formWhere = JSON.stringify(prismaMock.form.findMany.mock.calls[0][0].where)
    expect(formWhere).toContain(JSON.stringify(parentVisibleFormWhere()[0]))
  })

  it('the parent group list', async () => {
    // Called through its own handlers: on the router it sits after GET /:id
    // (admin only), which answers /for-parent first.
    const layer = (groupsRoutes as any).stack.find((l: any) => l.route?.path === '/for-parent')
    const app = express()
    app.get('/for-parent', ...layer.route.stack.map((s: any) => s.handle))
    expect((await request(app).get('/for-parent')).status).toBe(200)
    expect(prismaMock.studentGroupLink.findMany.mock.calls[0][0].where.group).toEqual({ AND: parentVisibleGroupWhere() })
  })

  it('answering a form', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).post('/api/forms/f-1/respond').send({ answers: { ok: true }, studentId: 'stu-1' })
    expect(res.status).toBe(404)
    expect(prismaMock.form.findFirst.mock.calls[0][0].where.AND).toEqual(parentVisibleFormWhere())
  })

  it('the notification list and its unread count leave out hidden posts', async () => {
    prismaMock.message.findMany.mockResolvedValue([{ id: 'm-beyond' }])
    prismaMock.notification.findMany.mockResolvedValue([])
    prismaMock.notification.count.mockResolvedValue(0)

    expect((await request(makeApp()).get('/api/notifications')).status).toBe(200)
    expect(prismaMock.message.findMany.mock.calls[0][0].where).toEqual({ schoolId: 'school-1', ...parentHiddenMessageWhere() })
    const excluded = { OR: [{ resourceId: null }, { resourceId: { notIn: ['m-beyond'] } }] }
    expect(prismaMock.notification.findMany.mock.calls[0][0].where).toEqual({ userId: 'parent-1', ...excluded })
    expect(prismaMock.notification.count.mock.calls[0][0].where).toEqual({ userId: 'parent-1', ...excluded })

    expect((await request(makeApp()).get('/api/notifications/unread-count')).status).toBe(200)
    expect(prismaMock.notification.count.mock.calls[1][0].where).toEqual({ userId: 'parent-1', read: false, ...excluded })
  })

  it('the notification list is unchanged when nothing is hidden', async () => {
    prismaMock.notification.findMany.mockResolvedValue([])
    prismaMock.notification.count.mockResolvedValue(0)
    await request(makeApp()).get('/api/notifications')
    expect(prismaMock.notification.findMany.mock.calls[0][0].where).toEqual({ userId: 'parent-1' })
  })

  it('no notification goes out for a post parents cannot see', async () => {
    prismaMock.message.count.mockResolvedValue(1)
    await sendNotification({
      type: 'MESSAGE', title: 'Trip', body: 'Trip', resourceType: 'MESSAGE', resourceId: 'm-beyond',
      target: { targetClass: 'Trip', groupId: 'g-1', schoolId: 'school-1' },
    })
    expect(prismaMock.message.count).toHaveBeenCalledWith({ where: { id: 'm-beyond', ...parentHiddenMessageWhere() } })
    expect(prismaMock.studentGroupLink.findMany).not.toHaveBeenCalled()
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
  })
})
