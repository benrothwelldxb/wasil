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
  school: { findUnique: vi.fn() },
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
