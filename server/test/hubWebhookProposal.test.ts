import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash, createHmac } from 'crypto'

// The calendar.proposal_reviewed webhook consumer: a signed body from Hub tells
// us a teacher proposal was APPROVED (→ resync so the sync adopts the row) or
// REJECTED (→ mark the local row REJECTED + store the reason). Prisma and the
// calendar-resync are module-mocked; we sign bodies exactly as Hub does.

const prismaMock = {
  school: { findMany: vi.fn(), updateMany: vi.fn() },
  event: { updateMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/timetableCache', () => ({ invalidateSchool: vi.fn() }))
const resyncCalendarForSchool = vi.fn(async () => {})
vi.mock('../src/services/hubCalendarSync', () => ({ resyncCalendarForSchool }))

const { default: hubWebhookRoutes } = await import('../src/routes/hubWebhook')

const SECRET = 'whsec_test'
function sign(rawBody: string): string {
  const secretHash = createHash('sha256').update(SECRET).digest('hex')
  return 'sha256=' + createHmac('sha256', secretHash).update(rawBody).digest('hex')
}
function makeApp() {
  const app = express()
  app.use('/api/hub', hubWebhookRoutes)
  return app
}
function post(body: object) {
  const raw = JSON.stringify(body)
  return request(makeApp())
    .post('/api/hub/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Wasil-Signature', sign(raw))
    .send(raw)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HUB_WEBHOOK_SECRET = SECRET
  prismaMock.school.findMany.mockResolvedValue([{ id: 'connect-school-1' }])
  prismaMock.event.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.school.updateMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/hub/webhook — calendar.proposal_reviewed', () => {
  it('REJECTED marks the local proposal REJECTED with the reason, does not resync', async () => {
    const res = await post({
      event: 'calendar.proposal_reviewed',
      schoolId: 'hub-school-1',
      timestamp: '2026-07-25T10:00:00.000Z',
      data: { proposal_id: 'prop-9', status: 'REJECTED', reason: 'Clashes with sports day', reviewed_at: '2026-07-25T10:00:00.000Z' },
    })
    expect(res.status).toBe(200)
    expect(prismaMock.event.updateMany).toHaveBeenCalledWith({
      where: { hubProposalId: 'prop-9', schoolId: { in: ['connect-school-1'] } },
      data: { proposalStatus: 'REJECTED', proposalReviewNote: 'Clashes with sports day' },
    })
    expect(resyncCalendarForSchool).not.toHaveBeenCalled()
  })

  it('APPROVED triggers a calendar resync (audience-safe reconcile) and no direct row flip', async () => {
    const res = await post({
      event: 'calendar.proposal_reviewed',
      schoolId: 'hub-school-1',
      timestamp: '2026-07-25T10:00:00.000Z',
      data: { proposal_id: 'prop-9', status: 'APPROVED', event_id: 'hev-42', reviewed_at: '2026-07-25T10:00:00.000Z' },
    })
    expect(res.status).toBe(200)
    expect(resyncCalendarForSchool).toHaveBeenCalledWith('connect-school-1')
    expect(prismaMock.event.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a bad signature', async () => {
    const raw = JSON.stringify({ event: 'calendar.proposal_reviewed', schoolId: 'hub-school-1', data: {} })
    const res = await request(makeApp())
      .post('/api/hub/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Wasil-Signature', 'sha256=deadbeef')
      .send(raw)
    expect(res.status).toBe(401)
    expect(prismaMock.event.updateMany).not.toHaveBeenCalled()
  })
})
