import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Exercise the teacher-proposal endpoints (Stage 4 / Phase B) with prisma, auth,
// the Hub calendar client, and the side-services mocked — no DB, no live Hub.
// Asserts: Connect class/YG → Hub ids, UTC-ISO time building, Hub call + local
// PENDING row + EventTarget rows, and the reject paths (empty/whole-school
// targets, missing Hub id, PARENT forbidden, withdraw / guard behaviour).

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
  yearGroup: { findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

// Auth: a controllable current user. Default STAFF; individual tests override.
let currentUser: any = { id: 'staff-1', name: 'Ms Teacher', email: 'teacher@vhps.ae', schoolId: 'sch-1', role: 'STAFF' }
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => { req.user = currentUser; next() },
  isAdmin: (req: any, res: any, next: any) => {
    req.user = currentUser
    if (currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN') return next()
    res.status(403).json({ error: 'Forbidden' })
  },
  isStaff: (req: any, res: any, next: any) => {
    req.user = currentUser
    if (['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)) return next()
    res.status(403).json({ error: 'Forbidden - Staff access required' })
  },
  loadUserWithRelations: vi.fn(),
}))
vi.mock('../src/middleware/validate', () => ({ validate: () => (_req: any, _res: any, next: any) => next() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn(async (t: string[]) => t) }))
vi.mock('../src/services/hubCalendar', () => ({ submitProposal: vi.fn() }))

const { submitProposal } = await import('../src/services/hubCalendar')
const { default: eventsRoutes } = await import('../src/routes/events')
const mSubmit = vi.mocked(submitProposal)

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/events', eventsRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  currentUser = { id: 'staff-1', name: 'Ms Teacher', email: 'teacher@vhps.ae', schoolId: 'sch-1', role: 'STAFF' }
  prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: 'hub-sch-1', timezone: 'Asia/Dubai' })
  prismaMock.class.findMany.mockResolvedValue([{ id: 'cls-A', name: '1 Blue', hubClassId: 'hub-cls-A' }])
  prismaMock.yearGroup.findMany.mockResolvedValue([{ id: 'yg-1', name: 'Year 2', hubYearGroupId: 'hub-yg-1' }])
  prismaMock.eventTarget.createMany.mockResolvedValue({ count: 0 })
  mSubmit.mockResolvedValue({ proposal_id: 'prop-99', status: 'PENDING' })
  prismaMock.event.create.mockImplementation(async ({ data }: any) => ({
    id: 'ev-new', createdAt: new Date('2026-07-01T00:00:00Z'), hubCalendarEventId: null, ...data,
  }))
})

describe('POST /proposals — submit', () => {
  it('maps Connect class → Hub id, builds UTC-ISO times, calls Hub, creates a PENDING proposal-Event + EventTarget rows', async () => {
    const res = await request(makeApp())
      .post('/api/events/proposals')
      .send({
        title: 'Class Bake Sale',
        date: '2026-09-10',
        startTime: '09:00',
        endTime: '11:00',
        location: 'Hall',
        targets: [{ classId: 'cls-A' }],
      })
      .expect(201)

    // Hub call: school_id is the HUB id, class_ids are HUB ids, times are UTC ISO.
    expect(mSubmit).toHaveBeenCalledTimes(1)
    const body = mSubmit.mock.calls[0][0]
    expect(body.school_id).toBe('hub-sch-1')
    expect(body.class_ids).toEqual(['hub-cls-A'])
    expect(body.year_group_ids).toBeUndefined()
    // 09:00 / 11:00 Asia/Dubai (UTC+4) → 05:00 / 07:00 UTC.
    expect(body.starts_at).toBe('2026-09-10T05:00:00.000Z')
    expect(body.ends_at).toBe('2026-09-10T07:00:00.000Z')
    expect(body.all_day).toBe(false)
    expect(body.submitter_name).toBe('Ms Teacher')
    expect(body.submitter_email).toBe('teacher@vhps.ae')

    // Local row: PENDING, hubProposalId set, NO hubCalendarEventId, submitter set.
    const created = prismaMock.event.create.mock.calls[0][0].data
    expect(created.proposalStatus).toBe('PENDING')
    expect(created.hubProposalId).toBe('prop-99')
    expect(created.submittedByUserId).toBe('staff-1')
    expect(created.hubCalendarEventId).toBeUndefined()
    expect(created.classId).toBe('cls-A') // single target → scalar populated
    expect(created.schoolId).toBe('sch-1')

    // EventTarget row for the chosen class.
    expect(prismaMock.eventTarget.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 'ev-new', classId: 'cls-A', yearGroupId: null }],
    })

    // Response is serialized with proposalStatus + source 'proposal'.
    expect(res.body.proposalStatus).toBe('PENDING')
    expect(res.body.source).toBe('proposal')
    expect(res.body.state).toBe('PENDING')
  })

  it('all-day proposal spans local 00:00 → next-day 00:00 in UTC', async () => {
    await request(makeApp())
      .post('/api/events/proposals')
      .send({ title: 'Book Week', date: '2026-09-10', allDay: true, targets: [{ yearGroupId: 'yg-1' }] })
      .expect(201)

    const body = mSubmit.mock.calls[0][0]
    expect(body.all_day).toBe(true)
    expect(body.year_group_ids).toEqual(['hub-yg-1'])
    expect(body.starts_at).toBe('2026-09-09T20:00:00.000Z') // 2026-09-10 00:00 +04
    expect(body.ends_at).toBe('2026-09-10T20:00:00.000Z') // 2026-09-11 00:00 +04
    expect(prismaMock.event.create.mock.calls[0][0].data.time).toBeNull()
  })

  it('rejects an empty targets array with 422 and never calls Hub', async () => {
    const res = await request(makeApp())
      .post('/api/events/proposals')
      .send({ title: 'X', date: '2026-09-10', targets: [] })
      .expect(422)
    expect(res.body.error).toMatch(/at least one class or year group/i)
    expect(mSubmit).not.toHaveBeenCalled()
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('rejects targets that resolve to nothing (whole-school-like) with 422', async () => {
    const res = await request(makeApp())
      .post('/api/events/proposals')
      .send({ title: 'X', date: '2026-09-10', targets: [{}] })
      .expect(422)
    expect(res.body.error).toMatch(/at least one class or year group/i)
    expect(mSubmit).not.toHaveBeenCalled()
  })

  it('422 when a target class has no Hub id, and does not call Hub or create a row', async () => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 'cls-A', name: '1 Blue', hubClassId: null }])
    const res = await request(makeApp())
      .post('/api/events/proposals')
      .send({ title: 'X', date: '2026-09-10', targets: [{ classId: 'cls-A' }] })
      .expect(422)
    expect(res.body.error).toMatch(/not linked to Wasil Hub/i)
    expect(mSubmit).not.toHaveBeenCalled()
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('does NOT create a local row when the Hub submission fails', async () => {
    mSubmit.mockRejectedValue(new Error('hub 500'))
    const res = await request(makeApp())
      .post('/api/events/proposals')
      .send({ title: 'X', date: '2026-09-10', startTime: '09:00', targets: [{ classId: 'cls-A' }] })
      .expect(502)
    expect(res.body.error).toMatch(/Wasil Hub/i)
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('forbids a PARENT (403) and never calls Hub', async () => {
    currentUser = { id: 'p-1', name: 'Parent', email: 'p@vhps.ae', schoolId: 'sch-1', role: 'PARENT' }
    await request(makeApp())
      .post('/api/events/proposals')
      .send({ title: 'X', date: '2026-09-10', targets: [{ classId: 'cls-A' }] })
      .expect(403)
    expect(mSubmit).not.toHaveBeenCalled()
  })
})

describe('GET /proposals — list', () => {
  it('lists proposal-Events newest first with proposalStatus, submitter, targets and state', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      {
        id: 'ev-1', title: 'Bake Sale', description: null, date: new Date('2026-09-10T00:00:00Z'),
        time: '09:00', location: 'Hall', targetClass: '1 Blue', classId: 'cls-A', yearGroupId: null,
        schoolId: 'sch-1', hubProposalId: 'prop-99', proposalStatus: 'PENDING', submittedByUserId: 'staff-1',
        hubCalendarEventId: null, createdAt: new Date('2026-07-02T00:00:00Z'),
        targets: [{ classId: 'cls-A', yearGroupId: null }],
      },
      {
        id: 'ev-2', title: 'Trip', description: null, date: new Date('2026-09-01T00:00:00Z'),
        time: null, location: null, targetClass: 'Year 2', classId: null, yearGroupId: 'yg-1',
        schoolId: 'sch-1', hubProposalId: 'prop-1', proposalStatus: null, submittedByUserId: 'staff-1',
        hubCalendarEventId: 'hub-ev-2', createdAt: new Date('2026-07-01T00:00:00Z'),
        targets: [{ classId: null, yearGroupId: 'yg-1' }],
      },
    ])

    const res = await request(makeApp()).get('/api/events/proposals').expect(200)

    // Query scopes to school + proposal rows, newest first.
    const args = prismaMock.event.findMany.mock.calls[0][0]
    expect(args.where.schoolId).toBe('sch-1')
    expect(args.orderBy).toEqual({ createdAt: 'desc' })

    expect(res.body[0].proposalStatus).toBe('PENDING')
    expect(res.body[0].state).toBe('PENDING')
    expect(res.body[0].source).toBe('proposal')
    expect(res.body[0].submittedByUserId).toBe('staff-1')
    expect(res.body[0].targets).toEqual([{ classId: 'cls-A', yearGroupId: null }])
    // Landed proposal → ON_CALENDAR, source hub.
    expect(res.body[1].state).toBe('ON_CALENDAR')
    expect(res.body[1].source).toBe('hub')
  })
})

describe('DELETE /proposals/:id — withdraw', () => {
  it('deletes a PENDING proposal for the submitter', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'ev-1', schoolId: 'sch-1', proposalStatus: 'PENDING', submittedByUserId: 'staff-1', hubCalendarEventId: null, title: 'Bake Sale' })
    prismaMock.event.delete.mockResolvedValue({ id: 'ev-1' })
    await request(makeApp()).delete('/api/events/proposals/ev-1').expect(200)
    expect(prismaMock.event.delete).toHaveBeenCalledWith({ where: { id: 'ev-1' } })
  })

  it('409 once the proposal has landed on the calendar (not PENDING)', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'ev-1', schoolId: 'sch-1', proposalStatus: null, submittedByUserId: 'staff-1', hubCalendarEventId: 'hub-ev-1', title: 'Bake Sale' })
    const res = await request(makeApp()).delete('/api/events/proposals/ev-1').expect(409)
    expect(res.body.error).toMatch(/already been approved/i)
    expect(prismaMock.event.delete).not.toHaveBeenCalled()
  })

  it('403 when a non-submitter non-admin tries to withdraw', async () => {
    currentUser = { id: 'other-staff', name: 'Other', email: 'o@vhps.ae', schoolId: 'sch-1', role: 'STAFF' }
    prismaMock.event.findFirst.mockResolvedValue({ id: 'ev-1', schoolId: 'sch-1', proposalStatus: 'PENDING', submittedByUserId: 'staff-1', hubCalendarEventId: null, title: 'Bake Sale' })
    await request(makeApp()).delete('/api/events/proposals/ev-1').expect(403)
    expect(prismaMock.event.delete).not.toHaveBeenCalled()
  })

  it('lets an ADMIN withdraw another user\'s pending proposal', async () => {
    currentUser = { id: 'admin-1', name: 'Head', email: 'head@vhps.ae', schoolId: 'sch-1', role: 'ADMIN' }
    prismaMock.event.findFirst.mockResolvedValue({ id: 'ev-1', schoolId: 'sch-1', proposalStatus: 'PENDING', submittedByUserId: 'staff-1', hubCalendarEventId: null, title: 'Bake Sale' })
    prismaMock.event.delete.mockResolvedValue({ id: 'ev-1' })
    await request(makeApp()).delete('/api/events/proposals/ev-1').expect(200)
    expect(prismaMock.event.delete).toHaveBeenCalled()
  })
})

describe('normal PUT/DELETE guard — PENDING proposals', () => {
  it('PUT /:id on a PENDING proposal → 409 (use withdraw)', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'ev-1', schoolId: 'sch-1', hubCalendarEventId: null, proposalStatus: 'PENDING' })
    currentUser = { id: 'admin-1', name: 'Head', email: 'head@vhps.ae', schoolId: 'sch-1', role: 'ADMIN' }
    const res = await request(makeApp())
      .put('/api/events/ev-1')
      .send({ title: 'x', date: '2026-09-01', targetClass: 'Whole School' })
      .expect(409)
    expect(res.body.error).toMatch(/pending proposal/i)
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('DELETE /:id on a PENDING proposal → 409 (use withdraw)', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'ev-1', schoolId: 'sch-1', hubCalendarEventId: null, proposalStatus: 'PENDING', recurrenceType: null })
    currentUser = { id: 'admin-1', name: 'Head', email: 'head@vhps.ae', schoolId: 'sch-1', role: 'ADMIN' }
    const res = await request(makeApp()).delete('/api/events/ev-1').expect(409)
    expect(res.body.error).toMatch(/pending proposal/i)
    expect(prismaMock.event.delete).not.toHaveBeenCalled()
  })
})
