import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'crypto'

// Connect's half of the Wasil Active communication contract:
//
//   POST /api/partner/communication/intents
//
// Active has an executable conformance test for this
// (src/lib/connect/live-adapter.integration.test.ts on the Active side) which
// stands up a stub of this endpoint and drives its real adapter at it. These
// tests are the mirror: the same wire shape and the same status classification,
// asserted from inside Connect. The status codes ARE the contract — Active's
// outbox retries or gives up based on them — so most of what is checked here is
// which number comes back, not what is in the body.
//
// Prisma is mocked (the established pattern in this repo).

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  partnerIntent: { findUnique: vi.fn(), create: vi.fn() },
  school: { findUnique: vi.fn(), findFirst: vi.fn() },
  student: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
  $transaction: vi.fn(),
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const outboxMock = { enqueuePush: vi.fn() }
vi.mock('../src/services/outbox', () => outboxMock)

const { default: partnerCommunicationRoutes } = await import('../src/routes/partnerCommunication')

const TOKEN = 'test-partner-token'
const SCHOOL = 'hub-school-1'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner/communication', partnerCommunicationRoutes)
  return app
}

function post(body: unknown) {
  return request(makeApp())
    .post('/api/partner/communication/intents')
    .set('Authorization', `Bearer ${TOKEN}`)
    .send(body as object)
}

/** The exact body Active sends, per its adapter's conformance test. */
function intent(overrides: Record<string, unknown> = {}) {
  return {
    event_type: 'activity.assignment_confirmed',
    school_id: SCHOOL,
    hub_pupil_id: 'pup-001',
    payload: { activityId: 'act-1', activityName: 'Football', preferenceRank: 1 },
    idempotency_key: 'run-1:pup-001:act-1',
    occurred_at: '2026-09-01T09:00:00.000Z',
    ...overrides,
  }
}

/** The tx client the service writes through inside $transaction. */
const txMock = {
  partnerIntent: { create: vi.fn() },
  notification: { createMany: vi.fn() },
}

beforeEach(() => {
  // The school takes intents unless a test says otherwise — the existing
  // cases here are about the status contract, not the switch.
  prismaMock.school.findFirst.mockResolvedValue({ activeIntentsEnabled: true })
  vi.clearAllMocks()

  prismaMock.partnerToken.findUnique.mockResolvedValue({
    id: 'pt-1',
    name: 'active',
    tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
    revokedAt: null,
  })
  prismaMock.partnerToken.update.mockResolvedValue({})

  // No prior intent with this key.
  prismaMock.partnerIntent.findUnique.mockResolvedValue(null)
  prismaMock.partnerIntent.create.mockResolvedValue({ id: 'intent-undeliverable' })

  prismaMock.school.findUnique.mockResolvedValue({ id: 'school-1' })
  prismaMock.student.findUnique.mockResolvedValue({
    id: 'stu-1',
    firstName: 'Amina',
    schoolId: 'school-1',
    parentLinks: [{ userId: 'parent-1' }, { userId: 'parent-2' }],
  })
  prismaMock.user.findMany.mockResolvedValue([{ id: 'parent-1' }, { id: 'parent-2' }])
  prismaMock.notificationPreference.findMany.mockResolvedValue([])
  prismaMock.deviceToken.findMany.mockResolvedValue([{ token: 'tok-1' }])

  txMock.partnerIntent.create.mockResolvedValue({ id: 'intent-1' })
  txMock.notification.createMany.mockResolvedValue({ count: 2 })
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock))
  outboxMock.enqueuePush.mockResolvedValue(undefined)
})

describe('the body Active actually sends', () => {
  it('accepts the documented shape and returns an id', async () => {
    const res = await post(intent())
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('intent-1')
    expect(res.body.status).toBe('DELIVERED')
  })

  it('notifies EVERY linked parent, not just the primary guardian', async () => {
    await post(intent())
    const rows = txMock.notification.createMany.mock.calls[0][0].data
    expect(rows.map((r: { userId: string }) => r.userId)).toEqual(['parent-1', 'parent-2'])
    expect(rows[0]).toMatchObject({
      type: 'ECA_ASSIGNMENT_CONFIRMED',
      title: 'Activity place confirmed',
      resourceType: 'ECA_ACTIVITY',
      resourceId: 'act-1',
      schoolId: 'school-1',
    })
  })

  it('says "first choice" when preferenceRank is 1', async () => {
    await post(intent())
    expect(txMock.notification.createMany.mock.calls[0][0].data[0].body).toBe(
      'Amina has a place in Football. Their first choice.'
    )
  })

  it('leaves any other preferenceRank unsaid', async () => {
    // "Their third choice" is not a thing to tell a parent.
    await post(intent({ payload: { activityId: 'act-1', activityName: 'Football', preferenceRank: 3 } }))
    expect(txMock.notification.createMany.mock.calls[0][0].data[0].body).toBe(
      'Amina has a place in Football.'
    )
  })

  it('carries the waitlist position into the words a parent reads', async () => {
    await post(
      intent({
        event_type: 'activity.assignment_waitlisted',
        payload: { activityId: 'act-1', activityName: 'Football', waitlistPosition: 3 },
      })
    )
    const row = txMock.notification.createMany.mock.calls[0][0].data[0]
    expect(row.type).toBe('ECA_ASSIGNMENT_WAITLISTED')
    expect(row.body).toBe('Amina is number 3 on the waiting list for Football.')
  })

  it('still delivers when the payload omits the activity name', async () => {
    // Active's own conformance test posts an assignment with no activityName;
    // treating payload as opaque means degrading the copy, never 422-ing.
    const res = await post(intent({ payload: { activityId: 'act-1' } }))
    expect(res.status).toBe(200)
    expect(txMock.notification.createMany.mock.calls[0][0].data[0].body).toBe(
      'Amina has a place in an activity.'
    )
  })

  it('enqueues one push for the parents that have devices', async () => {
    await post(intent())
    expect(outboxMock.enqueuePush).toHaveBeenCalledTimes(1)
    expect(outboxMock.enqueuePush.mock.calls[0][0]).toBe('school-1')
    expect(outboxMock.enqueuePush.mock.calls[0][1]).toMatchObject({
      tokens: ['tok-1'],
      title: 'Activity place confirmed',
    })
  })

  it('drops a parent who has switched ECA updates off', async () => {
    prismaMock.notificationPreference.findMany.mockResolvedValue([{ userId: 'parent-2' }])
    await post(intent())
    const rows = txMock.notification.createMany.mock.calls[0][0].data
    expect(rows.map((r: { userId: string }) => r.userId)).toEqual(['parent-1'])
  })
})

describe('fixtures', () => {
  const fixture = {
    fixtureId: 'fx-1',
    fixtureName: 'U11 A Netball v DESS',
    date: '2026-11-11',
    meetAt: '14:00',
    returnsAt: '17:30',
    kit: 'Whites',
  }
  const sent = () => txMock.notification.createMany.mock.calls[0][0].data[0]
  const send = (event_type: string, payload: Record<string, unknown>) =>
    post(intent({ event_type, payload: { ...fixture, ...payload } }))

  beforeEach(() => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'school-1', activeScheduleEnabled: true })
  })

  it('tells a family their child is playing, with the times they plan around', async () => {
    const res = await send('fixture.team_selected', { role: 'playing', previousRole: null })
    expect(res.status).toBe(200)
    expect(sent()).toMatchObject({
      type: 'ECA_FIXTURE_TEAM',
      title: 'Amina is in the team',
      body: 'Amina is playing in U11 A Netball v DESS on Wednesday 11 November. Out of lessons from 14:00, back by 17:30. Kit: Whites.',
      resourceType: 'ACTIVE_FIXTURE',
      resourceId: 'fx-1',
    })
  })

  it('says substitute when they are one', async () => {
    await send('fixture.team_selected', { role: 'substitute', previousRole: null })
    expect(sent().title).toBe('Amina is a substitute')
  })

  it('words a change of role as a change', async () => {
    await send('fixture.team_selected', { role: 'substitute', previousRole: 'playing' })
    expect(sent().title).toBe('Team change')
    expect(sent().body).toContain('is now a substitute for')
  })

  it('tells a family their child has come out of the team', async () => {
    await send('fixture.team_removed', {})
    expect(sent().title).toBe('Team change')
    expect(sent().body).toBe('Amina is no longer in the team for U11 A Netball v DESS on Wednesday 11 November.')
  })

  it('tells a family the fixture is off, in the words the teacher wrote', async () => {
    await send('fixture.cancelled', { reason: 'Pitch waterlogged.' })
    expect(sent().type).toBe('ECA_FIXTURE_STATUS')
    expect(sent().title).toBe("Amina's fixture is cancelled")
    expect(sent().body).toBe('U11 A Netball v DESS on Wednesday 11 November is cancelled. Pitch waterlogged.')
  })

  it('tells a family it is back on, with the times they need again', async () => {
    await send('fixture.back_on', {})
    expect(sent().title).toBe("Amina's fixture is back on")
    expect(sent().body).toBe(
      'U11 A Netball v DESS on Wednesday 11 November is going ahead after all. Out of lessons from 14:00, back by 17:30. Kit: Whites.'
    )
  })

  it('passes on the transport and the note for families, in the words the teacher wrote', async () => {
    await send('fixture.team_selected', {
      role: 'playing',
      previousRole: null,
      transport: 'Coach from the main gate',
      familyNote: 'Collection is from the Al Barsha gate, not the school.',
    })
    expect(sent().body).toBe(
      'Amina is playing in U11 A Netball v DESS on Wednesday 11 November. Out of lessons from 14:00, back by 17:30. Kit: Whites. Transport: Coach from the main gate. Collection is from the Al Barsha gate, not the school.'
    )
  })

  it('includes the note when asking whether they can play, because it may change the answer', async () => {
    await send('fixture.availability_requested', { familyNote: 'Collection is from the Al Barsha gate.' })
    expect(sent().body).toBe(
      'U11 A Netball v DESS on Wednesday 11 November. Collection is from the Al Barsha gate. Open This Week in Connect to reply.'
    )
  })

  it('opens This Week when the notification is tapped', async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([{ token: 'device-1' }])
    await send('fixture.availability_requested', {})
    expect(sent().data).toMatchObject({ route: '/this-week' })
    expect(outboxMock.enqueuePush.mock.calls[0][1].data).toMatchObject({ route: '/this-week', fixtureId: 'fx-1' })
  })

  it('leaves the note out when a child comes out of the team', async () => {
    await send('fixture.team_removed', { familyNote: 'Collection is from the Al Barsha gate.' })
    expect(sent().body).toBe('Amina is no longer in the team for U11 A Netball v DESS on Wednesday 11 November.')
  })

  it('leaves the note out when the fixture is off', async () => {
    await send('fixture.cancelled', { reason: 'Pitch waterlogged.', familyNote: 'Collection is from the Al Barsha gate.' })
    expect(sent().body).toBe('U11 A Netball v DESS on Wednesday 11 November is cancelled. Pitch waterlogged.')
  })

  it('still sends a cancellation when This Week is off, because there is nothing to reply to', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'school-1', activeScheduleEnabled: false })
    await send('fixture.cancelled', { reason: 'Pitch waterlogged.' })
    expect(sent().title).toBe("Amina's fixture is cancelled")
  })

  it('sends an update on the day in the words the teacher wrote, without repeating the note', async () => {
    await send('fixture.update', {
      message: 'The coach is running 20 minutes late.',
      familyNote: 'Collection is from the Al Barsha gate.',
    })
    expect(sent()).toMatchObject({
      type: 'ECA_FIXTURE_STATUS',
      title: "Update on Amina's fixture",
      body: 'U11 A Netball v DESS on Wednesday 11 November: The coach is running 20 minutes late.',
    })
  })

  it('still sends an update when This Week is off, because there is nothing to reply to', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'school-1', activeScheduleEnabled: false })
    await send('fixture.update', { message: 'Back by 17:45.' })
    expect(sent().title).toBe("Update on Amina's fixture")
  })

  it('still reads properly with only the name', async () => {
    await post(intent({ event_type: 'fixture.team_selected', payload: { fixtureName: 'Netball v DESS', role: 'playing' } }))
    expect(sent().body).toBe('Amina is playing in Netball v DESS.')
  })

  it('asks whether they can play, and says where to answer', async () => {
    await send('fixture.availability_requested', {})
    expect(sent()).toMatchObject({ type: 'ECA_FIXTURE_AVAILABILITY', title: 'Can Amina play?' })
    expect(sent().body).toContain('Open This Week')
  })

  it('does not ask when the school has no screen to answer it on', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'school-1', activeScheduleEnabled: false })
    const res = await send('fixture.availability_requested', {})
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'UNDELIVERABLE', reason: 'this_week_off', recipients: 0 })
    expect(txMock.notification.createMany).not.toHaveBeenCalled()
  })

  it('still sends team news when that screen is off, since it asks nothing', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'school-1', activeScheduleEnabled: false })
    const res = await send('fixture.team_selected', { role: 'playing' })
    expect(res.body.status).toBe('DELIVERED')
  })
})

describe('idempotency — Active WILL present the same key twice', () => {
  it('returns the original result and sends nothing the second time', async () => {
    prismaMock.partnerIntent.findUnique.mockResolvedValue({
      id: 'intent-original',
      status: 'DELIVERED',
      reason: null,
      recipients: 2,
    })

    const res = await post(intent())
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('intent-original')
    // The parent is not told twice.
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(txMock.notification.createMany).not.toHaveBeenCalled()
    expect(outboxMock.enqueuePush).not.toHaveBeenCalled()
  })

  it('reports the winner when two identical deliveries race', async () => {
    // Both got past the read; the loser's insert trips the unique constraint.
    prismaMock.$transaction.mockRejectedValue({ code: 'P2002' })
    prismaMock.partnerIntent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'intent-winner', status: 'DELIVERED', reason: null, recipients: 2 })

    const res = await post(intent())
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('intent-winner')
  })
})

describe('the status codes Active classifies on', () => {
  it('401 without a token', async () => {
    const res = await request(makeApp())
      .post('/api/partner/communication/intents')
      .send(intent())
    expect(res.status).toBe(401)
  })

  it('401 when the token is not recognised', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValue(null)
    expect((await post(intent())).status).toBe(401)
  })

  it('422 for an event type Connect does not speak — never 404', async () => {
    const res = await post(intent({ event_type: 'activity.something_new' }))
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('unsupported_event_type')
  })

  it.each([
    ['school_id missing', { school_id: undefined }],
    ['payload not an object', { payload: 'nope' }],
    ['idempotency_key missing', { idempotency_key: '' }],
    ['occurred_at unparseable', { occurred_at: 'not-a-date' }],
    ['hub_pupil_id wrong type', { hub_pupil_id: 42 }],
  ])('400 when %s', async (_label, override) => {
    const body = intent(override as Record<string, unknown>)
    if ((override as Record<string, unknown>).school_id === undefined) delete (body as Record<string, unknown>).school_id
    expect((await post(body)).status).toBe(400)
  })

  it('500 — RETRYABLE — when the database fails', async () => {
    prismaMock.school.findUnique.mockRejectedValue(new Error('connection lost'))
    const res = await post(intent())
    expect(res.status).toBe(500)
  })
})

describe('nobody to tell is accepted, never 404', () => {
  it('records an unknown pupil as undeliverable and answers 2xx', async () => {
    prismaMock.student.findUnique.mockResolvedValue(null)
    const res = await post(intent())
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('UNDELIVERABLE')
    expect(res.body.reason).toBe('unknown_pupil')
    expect(prismaMock.partnerIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'UNDELIVERABLE', reason: 'unknown_pupil' }),
      })
    )
  })

  it('accepts a null hub_pupil_id', async () => {
    const res = await post(intent({ hub_pupil_id: null }))
    expect(res.status).toBe(200)
    expect(res.body.reason).toBe('no_pupil')
  })

  it('accepts an unknown school', async () => {
    prismaMock.school.findUnique.mockResolvedValue(null)
    const res = await post(intent())
    expect(res.status).toBe(200)
    expect(res.body.reason).toBe('unknown_school')
  })

  it('accepts a pupil with no linked parent', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 'stu-1',
      firstName: 'Amina',
      schoolId: 'school-1',
      parentLinks: [],
    })
    prismaMock.user.findMany.mockResolvedValue([])
    const res = await post(intent())
    expect(res.status).toBe(200)
    expect(res.body.reason).toBe('no_linked_parent')
  })

  it('refuses a pupil belonging to another school', async () => {
    prismaMock.student.findUnique.mockResolvedValue({
      id: 'stu-1',
      firstName: 'Amina',
      schoolId: 'other-school',
      parentLinks: [{ userId: 'parent-1' }],
    })
    const res = await post(intent())
    expect(res.status).toBe(200)
    expect(res.body.reason).toBe('unknown_pupil')
  })
})

/**
 * A switch on an INBOUND integration has to pause the queue, not consume it.
 *
 * This path is how another app reaches a parent's phone: an intent becomes a
 * Notification for a child's guardians. Nothing on this side gated it, so the
 * first successful authentication after a token was issued flushed Active's
 * durable outbox and notified families about activity outcomes before anyone
 * had switched anything on in Connect.
 */
describe('POST /intents — the module switch', () => {
  const body = {
    event_type: 'assignment_confirmed',
    school_id: 'hub-sch-1',
    hub_pupil_id: 'hp-1',
    idempotency_key: 'k-1',
    payload: { activity_name: 'Netball' },
  }
  const post = () =>
    request(makeApp()).post('/api/partner/communication/intents')
      .set('Authorization', `Bearer ${TOKEN}`).send(body)

  it('503s when the school has the module off — retryable, so Active holds it', async () => {
    prismaMock.school.findFirst.mockResolvedValue({ activeIntentsEnabled: false })

    const res = await post()

    // NOT 2xx. A 2xx means delivered and Active drops it from the outbox, so a
    // switch that answered 2xx would silently destroy every intent while it
    // was off and a family would never learn their child got a place.
    expect(res.status).toBe(503)
    // Nothing recorded either: a deferred intent is not an undeliverable one.
    expect(prismaMock.partnerIntent.create).not.toHaveBeenCalled()
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
  })

  it('lets the intent through when the module is on', async () => {
    prismaMock.school.findFirst.mockResolvedValue({ activeIntentsEnabled: true })

    const res = await post()

    expect(res.status).toBeLessThan(500)
  })

  // An unknown school must NOT become a 503, or Active retries it for ever.
  // No retry fixes a school Connect has never heard of.
  it('lets an unknown school fall through to the permanent answer', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)

    const res = await post()

    expect(res.status).not.toBe(503)
  })
})
