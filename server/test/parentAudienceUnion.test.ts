import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Bug 1 regression: a parent's "which classes are my children in?" audience must
// be the UNION of the legacy Child relation AND Hub-provisioned studentLinks.
// Hub-provisioned parents (and the pilot test accounts) have ZERO legacy
// children and link their child only via studentLinks, so a children-only
// derivation left them seeing ONLY "Whole School" content. These tests drive the
// parent-facing GET routes (messages, events, forms) with prisma + auth +
// side-services mocked, and assert the class-targeted query includes the class a
// studentLink-only parent's child is in — while a legacy-children parent is
// unaffected.

const prismaMock: any = {
  message: { findMany: vi.fn() },
  event: { findMany: vi.fn() },
  form: { findMany: vi.fn() },
  class: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', schoolId: 'sch-1', role: 'PARENT', preferredLanguage: 'en' }
    next()
  },
  isAdmin: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', schoolId: 'sch-1', role: 'ADMIN' }
    next()
  },
  isStaff: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', schoolId: 'sch-1', role: 'STAFF' }
    next()
  },
  canSendToTarget: (_req: any, _res: any, next: any) => next(),
  canMarkUrgent: (_req: any, _res: any, next: any) => next(),
  loadUserWithRelations,
}))
vi.mock('../src/middleware/validate', () => ({ validate: () => (_req: any, _res: any, next: any) => next() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn(async (t: string[]) => t) }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))
vi.mock('../src/services/tenant', () => ({ tenant: vi.fn() }))

const { default: messagesRoutes } = await import('../src/routes/messages')
const { default: eventsRoutes } = await import('../src/routes/events')
const { default: formsRoutes } = await import('../src/routes/forms')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/messages', messagesRoutes)
  app.use('/api/events', eventsRoutes)
  app.use('/api/forms', formsRoutes)
  return app
}

// A parent whose ONLY child link is a Hub studentLink into class cls-A — zero
// legacy children (the Hub-provisioned / pilot-test-account shape).
const STUDENTLINK_ONLY = {
  id: 'user-1',
  schoolId: 'sch-1',
  preferredLanguage: 'en',
  children: [],
  studentLinks: [
    { studentId: 'stu-1', student: { classId: 'cls-A', class: { id: 'cls-A', name: 'Y5 Yellow' } } },
  ],
}

// A legacy parent: child via the old Child relation only, zero studentLinks.
const LEGACY_ONLY = {
  id: 'user-1',
  schoolId: 'sch-1',
  preferredLanguage: 'en',
  children: [{ id: 'child-1', name: 'Sam', classId: 'cls-A', class: { id: 'cls-A', name: 'Y5 Yellow' } }],
  studentLinks: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.class.findMany.mockResolvedValue([{ yearGroupId: 'yg-1' }])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([])
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.event.findMany.mockResolvedValue([])
  prismaMock.form.findMany.mockResolvedValue([])
})

// Pull the class-id list the route fed into `classId: { in: [...] }` within an OR.
function classIdInFromOr(where: any): string[] | undefined {
  const clause = (where.OR as any[]).find(c => c.classId?.in)
  return clause?.classId?.in
}

describe('Bug 1 — messages GET / parent audience', () => {
  it('studentLink-only parent: class-targeted posts for their child\'s class are queried', async () => {
    loadUserWithRelations.mockResolvedValue(STUDENTLINK_ONLY)
    await request(makeApp()).get('/api/messages').expect(200)

    const where = prismaMock.message.findMany.mock.calls[0][0].where
    expect(classIdInFromOr(where)).toEqual(['cls-A'])
    // Year-group targeting is derived from the same unioned class list.
    expect(prismaMock.class.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['cls-A'] } },
      select: { yearGroupId: true },
    })
  })

  it('legacy-children parent still works (no regression)', async () => {
    loadUserWithRelations.mockResolvedValue(LEGACY_ONLY)
    await request(makeApp()).get('/api/messages').expect(200)

    const where = prismaMock.message.findMany.mock.calls[0][0].where
    expect(classIdInFromOr(where)).toEqual(['cls-A'])
  })

  it('a parent with BOTH sources unions + dedupes their class ids', async () => {
    loadUserWithRelations.mockResolvedValue({
      ...STUDENTLINK_ONLY,
      children: [
        { id: 'child-1', name: 'Sam', classId: 'cls-A', class: { id: 'cls-A', name: 'Y5 Yellow' } }, // dup of link
        { id: 'child-2', name: 'Mo', classId: 'cls-B', class: { id: 'cls-B', name: 'Y3 Blue' } },
      ],
    })
    await request(makeApp()).get('/api/messages').expect(200)

    const where = prismaMock.message.findMany.mock.calls[0][0].where
    expect(new Set(classIdInFromOr(where))).toEqual(new Set(['cls-A', 'cls-B']))
    expect(classIdInFromOr(where)!.length).toBe(2) // deduped
  })
})

describe('Bug 1 — events GET / parent audience', () => {
  it('studentLink-only parent: class-targeted events for their child\'s class are queried', async () => {
    loadUserWithRelations.mockResolvedValue(STUDENTLINK_ONLY)
    await request(makeApp()).get('/api/events').expect(200)

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(classIdInFromOr(where)).toContain('cls-A')
  })
})

describe('Bug 1 — forms GET / parent audience', () => {
  it('studentLink-only parent: a class-targeted form is returned (JS filter uses the unioned class ids)', async () => {
    loadUserWithRelations.mockResolvedValue(STUDENTLINK_ONLY)
    prismaMock.form.findMany.mockResolvedValue([
      {
        id: 'f-class', title: 'Trip', description: null, type: 'CONSENT', status: 'ACTIVE',
        fields: [], targetClass: 'Y5 Yellow', classIds: ['cls-A'], yearGroupIds: [],
        schoolId: 'sch-1', expiresAt: null, createdAt: new Date(), updatedAt: new Date(), responses: [],
      },
      {
        id: 'f-other', title: 'Other class', description: null, type: 'CONSENT', status: 'ACTIVE',
        fields: [], targetClass: 'Y3 Blue', classIds: ['cls-Z'], yearGroupIds: [],
        schoolId: 'sch-1', expiresAt: null, createdAt: new Date(), updatedAt: new Date(), responses: [],
      },
    ])

    const res = await request(makeApp()).get('/api/forms').expect(200)
    const ids = res.body.map((f: any) => f.id)
    expect(ids).toContain('f-class') // matched via studentLink class
    expect(ids).not.toContain('f-other')
  })

  it('legacy-children parent still matches its class-targeted form (no regression)', async () => {
    loadUserWithRelations.mockResolvedValue(LEGACY_ONLY)
    prismaMock.form.findMany.mockResolvedValue([
      {
        id: 'f-class', title: 'Trip', description: null, type: 'CONSENT', status: 'ACTIVE',
        fields: [], targetClass: 'Y5 Yellow', classIds: ['cls-A'], yearGroupIds: [],
        schoolId: 'sch-1', expiresAt: null, createdAt: new Date(), updatedAt: new Date(), responses: [],
      },
    ])

    const res = await request(makeApp()).get('/api/forms').expect(200)
    expect(res.body.map((f: any) => f.id)).toContain('f-class')
  })
})
