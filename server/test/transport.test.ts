import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Transport — the Desk push, and the one guardian-scoped read.
 *
 * Because the school collects door-to-door, a stop name is a child's home
 * address. These tests exist as much to hold the guardrails in docs/adr/0001 as
 * to check the happy path.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  student: { findMany: vi.fn() },
  transportAssignment: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  transportRun: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  school: { findFirst: vi.fn(), findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
const sendNotification = vi.fn()
vi.mock('../src/services/notify', () => ({ sendNotification, resolveAudienceParentIds: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'school-1' }
    next()
  },
  isAdmin: (_r: express.Request, _s: express.Response, n: express.NextFunction) => n(),
  isStaff: (_r: express.Request, _s: express.Response, n: express.NextFunction) => n(),
  loadUserWithRelations,
  requireProviderOrSchoolAdmin: (_r: express.Request, _s: express.Response, n: express.NextFunction) => n(),
}))

const { default: partnerRoutes } = await import('../src/routes/partner')
const { default: transportRoutes } = await import('../src/routes/transport')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  app.use('/api/transport', transportRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer tok')

const PAYLOAD = {
  school_id: 'hub-1',
  leg: 'AM',
  routes: [
    {
      id: 'r1', name: 'Bus 3', code: 'B3',
      stops: [
        { id: 's1', name: 'Villa 27, Alvorada 2', time_local: '06:52', pupils: [{ hub_pupil_id: 'hp-1' }] },
        { id: 's2', name: 'Villa 4, Alvorada 1', time_local: '06:58', pupils: [{ hub_pupil_id: 'hp-2' }] },
      ],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'Desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
  prismaMock.student.findMany.mockResolvedValue([
    { id: 'stu-1', hubPupilId: 'hp-1' },
    { id: 'stu-2', hubPupilId: 'hp-2' },
  ])
  prismaMock.transportAssignment.upsert.mockResolvedValue({})
  prismaMock.transportAssignment.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.transportRun.upsert.mockResolvedValue({ id: 'run-1' })
  prismaMock.transportRun.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.transportRun.findMany.mockResolvedValue([])
  prismaMock.school.findUnique.mockResolvedValue({ transportEnabled: true, timezone: 'Asia/Dubai' })
  prismaMock.transportAssignment.findMany.mockResolvedValue([])
})

describe('PUT /api/partner/transport/assignments', () => {
  const put = (body: Record<string, unknown>) =>
    auth(request(makeApp()).put('/api/partner/transport/assignments').send(body))

  it('flattens routes and stops into one row per child', async () => {
    const res = await put(PAYLOAD)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ updated: 2, skippedUnknownPupil: 0 })
    expect(prismaMock.transportAssignment.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.transportAssignment.upsert.mock.calls[0][0]).toMatchObject({
      where: { studentId_leg: { studentId: 'stu-1', leg: 'AM' } },
      create: expect.objectContaining({ routeName: 'Bus 3', stopName: 'Villa 27, Alvorada 2', timeLocal: '06:52' }),
    })
  })

  // Full replacement: anything the push does not mention is off the roster, and
  // a retained row is a child's home address nobody meant to keep.
  it('deletes assignments the push no longer mentions, for that leg only', async () => {
    await put(PAYLOAD)

    expect(prismaMock.transportAssignment.deleteMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-1', leg: 'AM', studentId: { notIn: ['stu-1', 'stu-2'] } },
    })
  })

  it('an empty payload clears the leg rather than doing nothing', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    prismaMock.transportAssignment.deleteMany.mockResolvedValue({ count: 7 })

    const res = await put({ school_id: 'hub-1', leg: 'PM', routes: [] })

    expect(res.body).toMatchObject({ updated: 0, removed: 7 })
    expect(prismaMock.transportAssignment.deleteMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-1', leg: 'PM', studentId: { notIn: [] } },
    })
  })

  it('re-sending the same payload is a no-op beyond timestamps', async () => {
    await put(PAYLOAD)
    const first = prismaMock.transportAssignment.upsert.mock.calls.map(c => c[0])
    vi.clearAllMocks()
    prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'Desk', revokedAt: null })
    prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
    prismaMock.student.findMany.mockResolvedValue([
      { id: 'stu-1', hubPupilId: 'hp-1' },
      { id: 'stu-2', hubPupilId: 'hp-2' },
    ])
    prismaMock.transportAssignment.deleteMany.mockResolvedValue({ count: 0 })

    await put(PAYLOAD)
    expect(prismaMock.transportAssignment.upsert.mock.calls.map(c => c[0])).toEqual(first)
  })

  it('counts a pupil Connect has not synced rather than guessing', async () => {
    prismaMock.student.findMany.mockResolvedValue([{ id: 'stu-1', hubPupilId: 'hp-1' }])
    const res = await put(PAYLOAD)
    expect(res.body).toMatchObject({ updated: 1, skippedUnknownPupil: 1 })
  })

  // Desk withholds the address rather than sending it beside a "don't show
  // this" flag, so a suppressed stop arrives with name: ''. Requiring a name
  // dropped every pupil at that stop — the children of separated families, who
  // are exactly the ones the flag protects.
  it('keeps a suppressed stop that arrives with no address at all', async () => {
    const res = await put({
      ...PAYLOAD,
      routes: [{ id: 'r1', name: 'Bus 3', stops: [
        { id: 's1', name: '', time_local: '06:52', hide_stop_name: true, pupils: [{ hub_pupil_id: 'hp-1' }] },
      ] }],
    })

    expect(res.body.updated).toBe(1)
    const created = prismaMock.transportAssignment.upsert.mock.calls[0][0].create
    expect(created.hideStopName).toBe(true)
    expect(created.routeName).toBe('Bus 3')
    expect(created.timeLocal).toBe('06:52')
  })

  // The other half of the same rule: a nameless stop that is NOT suppressed is
  // still junk and still skipped.
  it('still skips a stop with no name and no suppression flag', async () => {
    const res = await put({
      ...PAYLOAD,
      routes: [{ id: 'r1', name: 'Bus 3', stops: [
        { id: 's1', name: '', time_local: '06:52', pupils: [{ hub_pupil_id: 'hp-1' }] },
      ] }],
    })
    expect(res.body.updated).toBe(0)
  })

  it('still requires a time, suppressed or not', async () => {
    const res = await put({
      ...PAYLOAD,
      routes: [{ id: 'r1', name: 'Bus 3', stops: [
        { id: 's1', name: '', time_local: '', hide_stop_name: true, pupils: [{ hub_pupil_id: 'hp-1' }] },
      ] }],
    })
    expect(res.body.updated).toBe(0)
  })

  it('carries the suppression flag through', async () => {
    await put({
      ...PAYLOAD,
      routes: [{ id: 'r1', name: 'Bus 3', stops: [
        { id: 's1', name: 'Villa 27', time_local: '06:52', hide_stop_name: true, pupils: [{ hub_pupil_id: 'hp-1' }] },
      ] }],
    })
    expect(prismaMock.transportAssignment.upsert.mock.calls[0][0].create.hideStopName).toBe(true)
  })

  // ADR 0001's strongest claim is that a withheld address never enters this
  // database at all — not that it is hidden on read. That has to be true even
  // when the sender gets it wrong, or the claim is about Desk's conduct rather
  // than about Connect's storage.
  it('never stores a suppressed stop name, even when one is sent', async () => {
    await put({
      ...PAYLOAD,
      routes: [{ id: 'r1', name: 'Bus 3', stops: [
        { id: 's1', name: 'Villa 27', time_local: '06:52', hide_stop_name: true, pupils: [{ hub_pupil_id: 'hp-1' }] },
      ] }],
    })
    const call = prismaMock.transportAssignment.upsert.mock.calls[0][0]
    expect(call.create.stopName).toBe('')
    expect(call.update.stopName).toBe('')
    expect(JSON.stringify(call)).not.toContain('Villa 27')
  })

  // A re-push is how a school clears addresses it should never have sent. If
  // update() kept the old value, the clear-out would silently not happen.
  it('overwrites a stored address when the stop is later suppressed', async () => {
    await put({
      ...PAYLOAD,
      routes: [{ id: 'r1', name: 'Bus 3', stops: [
        { id: 's1', name: '', time_local: '06:52', hide_stop_name: true, pupils: [{ hub_pupil_id: 'hp-1' }] },
      ] }],
    })
    expect(prismaMock.transportAssignment.upsert.mock.calls[0][0].update.stopName).toBe('')
  })

  // The consolidated Friday afternoon service — a distinct run, not a re-timed
  // PM, so it is its own leg and its own replacement.
  it('accepts FRI_PM, replacing only that leg', async () => {
    const res = await put({ school_id: 'hub-1', leg: 'FRI_PM', routes: [] })

    expect(res.status).toBe(200)
    // Scoped to FRI_PM: pushing the Friday bus never disturbs a school's
    // ordinary AM/PM rows.
    expect(prismaMock.transportAssignment.deleteMany.mock.calls[0][0].where).toMatchObject({
      schoolId: 'school-1', leg: 'FRI_PM',
    })
  })

  it('rejects a leg that is not AM, PM or FRI_PM', async () => {
    const res = await put({ school_id: 'hub-1', leg: 'EVENING', routes: [] })
    expect(res.status).toBe(400)
    expect(prismaMock.transportAssignment.deleteMany).not.toHaveBeenCalled()
  })

  it('401 without a partner token', async () => {
    const res = await request(makeApp()).put('/api/partner/transport/assignments').send(PAYLOAD)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/transport/mine', () => {
  beforeEach(() => {
    loadUserWithRelations.mockResolvedValue({
      id: 'parent-1',
      schoolId: 'school-1',
      studentLinks: [{ studentId: 'stu-1', student: { firstName: 'Amina', lastName: 'Said', class: { name: '3A' } } }],
    })
  })

  it('returns only this guardian\'s own children', async () => {
    prismaMock.transportAssignment.findMany.mockResolvedValue([
      { studentId: 'stu-1', leg: 'AM', routeName: 'Bus 3', routeCode: 'B3', stopName: 'Villa 27', timeLocal: '06:52', hideStopName: false },
      { studentId: 'stu-1', leg: 'PM', routeName: 'Bus 3', routeCode: 'B3', stopName: 'Villa 27', timeLocal: '15:40', hideStopName: false },
    ])

    const res = await request(makeApp()).get('/api/transport/mine')

    expect(res.status).toBe(200)
    expect(res.body.children).toHaveLength(1)
    expect(res.body.children[0]).toMatchObject({ studentName: 'Amina Said' })
    expect(res.body.children[0].legs).toHaveLength(2)
    // The scope is the guardian's own children AND their school — both, so a
    // stale link cannot reach another tenancy's row.
    expect(prismaMock.transportAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: { in: ['stu-1'] }, schoolId: 'school-1' } }),
    )
  })

  // The separated-family case: route and time still answer "which bus, when",
  // without disclosing one parent's address to the other.
  it('withholds a suppressed stop name but keeps route and time', async () => {
    prismaMock.transportAssignment.findMany.mockResolvedValue([
      { studentId: 'stu-1', leg: 'AM', routeName: 'Bus 3', routeCode: 'B3', stopName: 'Villa 27', timeLocal: '06:52', hideStopName: true },
    ])

    const res = await request(makeApp()).get('/api/transport/mine')

    const legs = res.body.children[0].legs
    expect(legs[0]).toMatchObject({ stopName: null, stopNameHidden: true, routeName: 'Bus 3', timeLocal: '06:52' })
    expect(JSON.stringify(res.body)).not.toContain('Villa 27')
  })

  it('a guardian with no children asks the database for nothing', async () => {
    loadUserWithRelations.mockResolvedValue({ id: 'parent-1', schoolId: 'school-1', studentLinks: [] })
    const res = await request(makeApp()).get('/api/transport/mine')
    expect(res.body).toEqual({ children: [] })
    expect(prismaMock.transportAssignment.findMany).not.toHaveBeenCalled()
  })

  // Absent is not empty: a screen that quietly shows no bus is worse than one
  // that admits it is broken.
  it('a failure is a 500, never an empty list', async () => {
    prismaMock.transportAssignment.findMany.mockRejectedValue(new Error('db down'))
    const res = await request(makeApp()).get('/api/transport/mine')
    expect(res.status).toBe(500)
    expect(res.body.children).toBeUndefined()
  })
})

/**
 * A bus marked away.
 *
 * The trap this feature exists around is the wording: a morning bus ARRIVES at
 * school, an afternoon one DEPARTS from it. Desk's own board said "arrived" for
 * all three legs until the office noticed it was reading back the opposite
 * journey. A parent told their child's bus arrived when it has just driven away
 * from school is worse than telling them nothing — so the leg travels with the
 * mark, and these tests hold that.
 */
describe('POST /api/partner/transport/runs', () => {
  const post = (body: Record<string, unknown>) =>
    auth(request(makeApp()).post('/api/partner/transport/runs').send(body))

  const RUN = {
    school_id: 'hub-1',
    route_id: 'r1',
    leg: 'PM',
    date_local: '2026-09-17',
    marked_at: '2026-09-17T11:42:00Z',
    due_at: '15:40',
  }

  it('records the mark against the bus, not against a child', async () => {
    const res = await post(RUN)

    expect(res.status).toBe(200)
    const call = prismaMock.transportRun.upsert.mock.calls[0][0]
    expect(call.where).toEqual({
      schoolId_routeId_leg_dateLocal: {
        schoolId: 'school-1', routeId: 'r1', leg: 'PM', dateLocal: '2026-09-17',
      },
    })
    expect(call.create.dueAt).toBe('15:40')
    // No child is named on the row — who was on the bus is the assignment
    // table's business, joined at read time.
    expect(JSON.stringify(call)).not.toContain('stu-')
  })

  it('is idempotent per bus, leg and day — a re-mark corrects rather than duplicates', async () => {
    await post(RUN)
    await post({ ...RUN, marked_at: '2026-09-17T11:45:00Z' })

    expect(prismaMock.transportRun.upsert).toHaveBeenCalledTimes(2)
    const second = prismaMock.transportRun.upsert.mock.calls[1][0]
    expect(second.where.schoolId_routeId_leg_dateLocal.dateLocal).toBe('2026-09-17')
    expect(second.update.markedAt.toISOString()).toBe('2026-09-17T11:45:00.000Z')
  })

  it('keeps a null expected time null — it must never default to on time', async () => {
    await post({ ...RUN, due_at: null })
    expect(prismaMock.transportRun.upsert.mock.calls[0][0].create.dueAt).toBeNull()
  })

  // WAS: a null mark withdrew the run. It was Desk's own request and it was a
  // trap — the undo spelled as the ABSENCE of a field, so a wrong field name
  // did not fail, it inverted the operation and reported success.
  //
  // Desk sent `arrived_at` instead of `marked_at` from the day its push was
  // written. Every mark the office made deleted a run that had never existed,
  // this route answered 200, and Desk printed "Parents on this route have been
  // told" over the top of it. Nothing rejected, nothing logged, nobody told,
  // for the whole life of the feature.
  //
  // DELETE does the same job with the verb that means it.
  it.each([
    ['an explicit null', { marked_at: null }],
    ['the field left out entirely', {}],
    ['a neighbouring field name, as Desk actually sent', { arrived_at: '2026-09-17T11:42:00Z' }],
  ])('refuses a mark with no instant — %s', async (_label, patch) => {
    const body = { ...RUN, ...patch } as Record<string, unknown>
    if (!('marked_at' in patch)) delete body.marked_at

    const res = await post(body)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/marked_at is required/)
    // Neither written nor deleted. The old behaviour did the second.
    expect(prismaMock.transportRun.upsert).not.toHaveBeenCalled()
    expect(prismaMock.transportRun.deleteMany).not.toHaveBeenCalled()
  })

  describe('what the answer tells Desk', () => {
    // A 200 used to mean "I have this", and Desk has a screen at 07:30 with a
    // bus in front of it that needs to say whether a phone buzzed. It could
    // only hedge — "sent to Connect, which tells the families on this route" —
    // or invent. Both reasons a mark reaches nobody are knowable up front, and
    // the queries that answer them were already running.
    it('says how many families it went to', async () => {
      prismaMock.transportAssignment.findMany.mockResolvedValue([
        { studentId: 'stu-1', routeName: 'Bus 3' },
        { studentId: 'stu-2', routeName: 'Bus 3' },
        { studentId: 'stu-3', routeName: 'Bus 3' },
      ])

      const res = await post(RUN)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ marked: true, notified: true, recipients: 3 })
      expect(res.body.notify_suppressed).toBeUndefined()
    })

    it('says NO RIDERS rather than a bare success — the likeliest silent miss', async () => {
      // A route pushed from Desk whose assignments have not landed here yet.
      // The mark is correct, the office is told it worked, and nobody hears.
      prismaMock.transportAssignment.findMany.mockResolvedValue([])

      const res = await post(RUN)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        marked: true, notified: false, recipients: 0, notify_suppressed: 'no_riders',
      })
    })

    it('says MODULE OFF when the school has transport switched off', async () => {
      prismaMock.school.findUnique.mockResolvedValue({ transportEnabled: false, timezone: 'Asia/Dubai' })
      prismaMock.transportAssignment.findMany.mockResolvedValue([
        { studentId: 'stu-1', routeName: 'Bus 3' },
      ])

      const res = await post(RUN)

      expect(res.body).toMatchObject({ notified: false, notify_suppressed: 'module_off' })
    })

    it('prefers MODULE OFF over NO RIDERS when both are true', async () => {
      // A school still testing has neither switch on nor riders loaded. Saying
      // "no riders" would send them hunting for missing assignments when the
      // answer is a toggle they have deliberately not flipped.
      prismaMock.school.findUnique.mockResolvedValue({ transportEnabled: false, timezone: 'Asia/Dubai' })
      prismaMock.transportAssignment.findMany.mockResolvedValue([])

      const res = await post(RUN)

      expect(res.body.notify_suppressed).toBe('module_off')
    })

    it('records the mark either way — suppression is about the telling', async () => {
      prismaMock.transportAssignment.findMany.mockResolvedValue([])

      await post(RUN)

      // The run is the record. Whether anyone was told is a separate fact and
      // must not decide whether the bus was marked.
      expect(prismaMock.transportRun.upsert).toHaveBeenCalled()
    })
  })

  it('rejects a mark it cannot read rather than silently calling it now', async () => {
    const res = await post({ ...RUN, marked_at: 'quarter past' })
    expect(res.status).toBe(400)
    expect(prismaMock.transportRun.upsert).not.toHaveBeenCalled()
  })

  it.each([
    [{ route_id: undefined }, 'route_id'],
    [{ leg: 'EVENING' }, 'leg'],
    [{ date_local: '17-09-2026' }, 'date_local'],
  ])('refuses a malformed %o', async (patch) => {
    const res = await post({ ...RUN, ...patch })
    expect(res.status).toBe(400)
    expect(prismaMock.transportRun.upsert).not.toHaveBeenCalled()
  })

  describe('the notification', () => {
    beforeEach(() => {
      prismaMock.transportAssignment.findMany.mockResolvedValue([
        { studentId: 'stu-1', routeName: 'Bus 3' },
        { studentId: 'stu-2', routeName: 'Bus 3' },
      ])
    })

    it('says LEFT school on an afternoon leg', async () => {
      await post(RUN)
      await new Promise(r => setImmediate(r))

      const arg = sendNotification.mock.calls[0][0]
      expect(arg.title).toBe('Bus 3 left school')
      expect(arg.target.studentIds).toEqual(['stu-1', 'stu-2'])
    })

    it('says ARRIVED at school on the morning leg — the opposite journey', async () => {
      await post({ ...RUN, leg: 'AM' })
      await new Promise(r => setImmediate(r))

      expect(sendNotification.mock.calls[0][0].title).toBe('Bus 3 arrived at school')
    })

    it('states lateness against the expected time, in the school-s own zone', async () => {
      // 11:42Z is 15:42 in Dubai, against a 15:40 expectation.
      await post(RUN)
      await new Promise(r => setImmediate(r))

      expect(sendNotification.mock.calls[0][0].body).toBe('15:42 — 2 minutes late')
    })

    it('says nothing about lateness when no expected time was recorded', async () => {
      await post({ ...RUN, due_at: null })
      await new Promise(r => setImmediate(r))

      const body = sendNotification.mock.calls[0][0].body
      expect(body).toBe('15:42')
      expect(body).not.toContain('on time')
    })

    it('tells nobody while the school still has transport switched off', async () => {
      prismaMock.school.findUnique.mockResolvedValue({ transportEnabled: false, timezone: 'Asia/Dubai' })
      await post(RUN)
      await new Promise(r => setImmediate(r))

      expect(sendNotification).not.toHaveBeenCalled()
    })

    it('tells nobody when no child rides that bus on that leg', async () => {
      prismaMock.transportAssignment.findMany.mockResolvedValue([])
      await post(RUN)
      await new Promise(r => setImmediate(r))

      expect(sendNotification).not.toHaveBeenCalled()
    })
  })
})

describe('DELETE /api/partner/transport/runs', () => {
  it('withdraws the mark, because a bus marked away by mistake is a parent misinformed', async () => {
    prismaMock.transportRun.deleteMany.mockResolvedValue({ count: 1 })
    const res = await auth(
      request(makeApp()).delete('/api/partner/transport/runs').send({
        school_id: 'hub-1', route_id: 'r1', leg: 'PM', date_local: '2026-09-17',
      }),
    )

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ withdrawn: 1 })
    // No second push saying "ignore that" — the app simply stops showing it.
    expect(sendNotification).not.toHaveBeenCalled()
  })
})

describe('GET /api/transport/mine — the school switch and today\'s run', () => {
  beforeEach(() => {
    loadUserWithRelations.mockResolvedValue({
      id: 'parent-1',
      schoolId: 'school-1',
      studentLinks: [{ studentId: 'stu-1', student: { firstName: 'Amina', lastName: 'Said', class: { name: '3A' } } }],
    })
    prismaMock.transportAssignment.findMany.mockResolvedValue([
      { studentId: 'stu-1', leg: 'PM', routeId: 'r1', routeName: 'Bus 3', routeCode: 'B3', stopName: 'Villa 27', timeLocal: '15:40', hideStopName: false },
    ])
  })

  // The gate is on the READ, not the push: a school can be mid-setup in Desk,
  // pushing rosters freely, and its parents still see nothing until somebody
  // turns buses on deliberately.
  it('shows nothing at all while the school has transport switched off', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ transportEnabled: false, timezone: 'Asia/Dubai' })

    const res = await request(makeApp()).get('/api/transport/mine')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ children: [] })
    // Not even queried — the address never leaves the database.
    expect(prismaMock.transportAssignment.findMany).not.toHaveBeenCalled()
  })

  it('carries the two times and no sentence, so the app can word and translate it', async () => {
    prismaMock.transportRun.findMany.mockResolvedValue([
      { routeId: 'r1', leg: 'PM', markedAt: new Date('2026-09-17T11:42:00Z'), dueAt: '15:40' },
    ])

    const res = await request(makeApp()).get('/api/transport/mine')

    const leg = res.body.children[0].legs[0]
    expect(leg.run).toEqual({ markedAt: '2026-09-17T11:42:00.000Z', dueAt: '15:40' })
    // No pre-built wording anywhere on the wire.
    expect(JSON.stringify(leg)).not.toMatch(/left|departed|arrived|late/i)
  })

  it('is null when the bus has not been marked today', async () => {
    prismaMock.transportRun.findMany.mockResolvedValue([])

    const res = await request(makeApp()).get('/api/transport/mine')

    expect(res.body.children[0].legs[0].run).toBeNull()
  })

  it('does not attach another leg\'s run to this one', async () => {
    prismaMock.transportRun.findMany.mockResolvedValue([
      { routeId: 'r1', leg: 'AM', markedAt: new Date('2026-09-17T02:52:00Z'), dueAt: '06:52' },
    ])

    const res = await request(makeApp()).get('/api/transport/mine')

    expect(res.body.children[0].legs[0].run).toBeNull()
  })
})
