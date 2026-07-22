import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Exercise the events route (multi-target query + read-only guard + create
// writes EventTarget rows) with prisma, auth and the notify/translation/audit
// side-services mocked, so no DB and no network are needed.
const prismaMock: any = {
  event: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  eventTarget: { createMany: vi.fn(), deleteMany: vi.fn() },
  class: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  // Run the callback against the same mock so target writes are observable.
  $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

// Auth: admin user; loadUserWithRelations returns a parent fixture we control.
const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', schoolId: 'sch-1', role: 'ADMIN' }
    next()
  },
  isAdmin: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', schoolId: 'sch-1', role: 'ADMIN' }
    next()
  },
  loadUserWithRelations,
}))
vi.mock('../src/middleware/validate', () => ({ validate: () => (_req: any, _res: any, next: any) => next() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn(async (t: string[]) => t) }))

const { default: eventsRoutes } = await import('../src/routes/events')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/events', eventsRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  // Parent of a child in class cls-A (year-group yg-1, group grp-1).
  loadUserWithRelations.mockResolvedValue({
    id: 'user-1',
    schoolId: 'sch-1',
    preferredLanguage: 'en',
    children: [{ classId: 'cls-A' }],
    studentLinks: [{ studentId: 'stu-1', student: { classId: 'cls-A' } }],
  })
  prismaMock.class.findMany.mockResolvedValue([{ yearGroupId: 'yg-1' }])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([{ groupId: 'grp-1' }])
  prismaMock.event.findMany.mockResolvedValue([])
})

describe('GET / — multi-target visibility query', () => {
  it('builds an OR spanning whole-school, EventTarget class/year-group joins, legacy scalars, and groups', async () => {
    await request(makeApp()).get('/api/events').expect(200)

    const where = prismaMock.event.findMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('sch-1')
    expect(where.OR).toEqual([
      { targetClass: 'Whole School' },
      { targetClass: 'all' },
      { targets: { some: { classId: { in: ['cls-A'] } } } },
      { classId: { in: ['cls-A'] } },
      { targets: { some: { yearGroupId: { in: ['yg-1'] } } } },
      { yearGroupId: { in: ['yg-1'] } },
      { groupId: { in: ['grp-1'] } },
    ])
  })

  it('serializes targets + source on each event', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      {
        id: 'e1', title: 'Trip', description: null, date: new Date('2026-09-01T00:00:00Z'),
        time: null, location: null, targetClass: '1 Blue', classId: 'cls-A', yearGroupId: null,
        groupId: null, hubCalendarEventId: 'hub-9', schoolId: 'sch-1', requiresRsvp: false,
        parentEventId: null, recurrenceType: null, rsvps: [],
        targets: [{ classId: 'cls-A', yearGroupId: null }], createdAt: new Date(),
      },
    ])

    const res = await request(makeApp()).get('/api/events').expect(200)
    expect(res.body[0].targets).toEqual([{ classId: 'cls-A', yearGroupId: null }])
    expect(res.body[0].source).toBe('hub')
    expect(res.body[0].hubCalendarEventId).toBe('hub-9')
  })
})

describe('POST / — writes EventTarget rows + legacy scalars', () => {
  it('single target: creates one EventTarget row and populates the scalar classId', async () => {
    prismaMock.event.create.mockResolvedValue({
      id: 'e-new', title: 'Assembly', description: null, date: new Date('2026-09-01T00:00:00Z'),
      time: null, location: null, targetClass: '1 Blue', classId: 'cls-A', yearGroupId: null,
      groupId: null, hubCalendarEventId: null, schoolId: 'sch-1', requiresRsvp: false,
      createdAt: new Date(),
    })

    const res = await request(makeApp())
      .post('/api/events')
      .send({ title: 'Assembly', date: '2026-09-01', targetClass: '1 Blue', targets: [{ classId: 'cls-A' }] })
      .expect(201)

    // Scalar classId populated for the single target.
    expect(prismaMock.event.create.mock.calls[0][0].data.classId).toBe('cls-A')
    expect(prismaMock.event.create.mock.calls[0][0].data.yearGroupId).toBeNull()
    // One EventTarget row written for the created event.
    expect(prismaMock.eventTarget.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 'e-new', classId: 'cls-A', yearGroupId: null }],
    })
    expect(res.body.targets).toEqual([{ classId: 'cls-A', yearGroupId: null }])
  })

  it('multi target: writes each row and leaves the legacy scalars null', async () => {
    prismaMock.event.create.mockResolvedValue({
      id: 'e-multi', title: 'Fair', description: null, date: new Date('2026-09-01T00:00:00Z'),
      time: null, location: null, targetClass: 'Multiple', classId: null, yearGroupId: null,
      groupId: null, hubCalendarEventId: null, schoolId: 'sch-1', requiresRsvp: false,
      createdAt: new Date(),
    })

    await request(makeApp())
      .post('/api/events')
      .send({ title: 'Fair', date: '2026-09-01', targetClass: 'Multiple', targets: [{ classId: 'cls-A' }, { yearGroupId: 'yg-1' }] })
      .expect(201)

    expect(prismaMock.event.create.mock.calls[0][0].data.classId).toBeNull()
    expect(prismaMock.event.create.mock.calls[0][0].data.yearGroupId).toBeNull()
    expect(prismaMock.eventTarget.createMany).toHaveBeenCalledWith({
      data: [
        { eventId: 'e-multi', classId: 'cls-A', yearGroupId: null },
        { eventId: 'e-multi', classId: null, yearGroupId: 'yg-1' },
      ],
    })
  })
})

describe('read-only guard — Hub-owned events', () => {
  it('PUT on a Hub-sourced event → 409', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'e1', schoolId: 'sch-1', hubCalendarEventId: 'hub-1' })
    const res = await request(makeApp())
      .put('/api/events/e1')
      .send({ title: 'x', date: '2026-09-01', targetClass: 'Whole School' })
      .expect(409)
    expect(res.body.error).toMatch(/Hub/)
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('DELETE on a Hub-sourced event → 409', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'e1', schoolId: 'sch-1', hubCalendarEventId: 'hub-1' })
    const res = await request(makeApp()).delete('/api/events/e1').expect(409)
    expect(res.body.error).toMatch(/Hub/)
    expect(prismaMock.event.delete).not.toHaveBeenCalled()
  })

  it('PUT on a Connect-local event → allowed (updates + replaces targets)', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'e1', schoolId: 'sch-1', hubCalendarEventId: null, groupId: null })
    prismaMock.event.update.mockResolvedValue({
      id: 'e1', title: 'Updated', description: null, date: new Date('2026-09-01T00:00:00Z'),
      time: null, location: null, targetClass: '1 Blue', classId: 'cls-A', yearGroupId: null,
      groupId: null, hubCalendarEventId: null, schoolId: 'sch-1', requiresRsvp: false,
      createdAt: new Date(), updatedAt: new Date(),
    })

    const res = await request(makeApp())
      .put('/api/events/e1')
      .send({ title: 'Updated', date: '2026-09-01', targetClass: '1 Blue', targets: [{ classId: 'cls-A' }] })
      .expect(200)

    expect(prismaMock.event.update).toHaveBeenCalled()
    expect(prismaMock.eventTarget.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'e1' } })
    expect(prismaMock.eventTarget.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 'e1', classId: 'cls-A', yearGroupId: null }],
    })
    expect(res.body.source).toBe('connect')
  })

  it('DELETE on a Connect-local event → allowed', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'e1', schoolId: 'sch-1', hubCalendarEventId: null, recurrenceType: null })
    prismaMock.event.delete.mockResolvedValue({ id: 'e1' })
    await request(makeApp()).delete('/api/events/e1').expect(200)
    expect(prismaMock.event.delete).toHaveBeenCalledWith({ where: { id: 'e1' } })
  })
})
