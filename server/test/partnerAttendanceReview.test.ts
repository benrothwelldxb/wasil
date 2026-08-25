import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'crypto'

// Desk's front office approves parent-reported absences without leaving Desk:
// /attendance/today now carries the row id, and this route reviews one. It must
// leave EXACTLY the state the native staff route leaves — including the EXCUSED
// register rows an approval writes — or the register and the digest would
// disagree with a decision reception already made.

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  school: { findFirst: vi.fn(), findMany: vi.fn() },
  attendanceRequest: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  attendanceRecord: { upsert: vi.fn() },
  auditLog: { create: vi.fn() },
  ilsaLink: { findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const TOKEN = 'cpk_secret'
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)
const RECEPTION = { id: 'u-reception', role: 'STAFF', schoolId: 'sch-1', name: 'Amal Qanda' }
const REQ = {
  id: 'ar-1',
  studentId: 'stu-1',
  type: 'ABSENCE',
  startDate: '2026-08-25',
  endDate: null,
  reason: 'illness',
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(RECEPTION)
  prismaMock.attendanceRequest.findFirst.mockResolvedValue(REQ)
  prismaMock.attendanceRequest.update.mockResolvedValue({
    id: 'ar-1', status: 'APPROVED', reviewedAt: new Date('2026-08-25T09:00:00.000Z'),
  })
  prismaMock.attendanceRecord.upsert.mockResolvedValue({})
  prismaMock.auditLog.create.mockResolvedValue({})
})

describe('GET /api/partner/attendance/today', () => {
  it('carries a stable id per row, so an absence can be targeted', async () => {
    prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1', timezone: 'Asia/Dubai' })
    prismaMock.attendanceRequest.findMany.mockResolvedValue([
      {
        id: 'ar-1', type: 'ABSENCE', reason: 'illness', notes: null,
        startDate: '2026-08-25', endDate: null, time: null, status: 'PENDING',
        student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A', hubClassId: 'hc-1' } },
      },
    ])

    const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=sch-1&date=2026-08-25'))

    expect(res.status).toBe(200)
    expect(res.body.absences[0].id).toBe('ar-1')
    expect(prismaMock.attendanceRequest.findMany.mock.calls[0][0].select.id).toBe(true)
  })
})

describe('POST /api/partner/attendance/:id/review', () => {
  const review = (body: Record<string, unknown>) =>
    auth(request(makeApp()).post('/api/partner/attendance/ar-1/review')).send(body)

  it('approves: stamps the reviewer, writes the EXCUSED register row, audits it', async () => {
    const res = await review({ hub_user_id: 'hu-reception', status: 'APPROVED' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: 'ar-1', status: 'APPROVED', reviewedBy: 'Amal Qanda',
      reviewedAt: '2026-08-25T09:00:00.000Z',
    })
    expect(prismaMock.attendanceRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'APPROVED', reviewedById: 'u-reception', reviewNotes: null,
    })
    // One EXCUSED record for the single day it covers.
    expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledTimes(1)
    const upsert = prismaMock.attendanceRecord.upsert.mock.calls[0][0]
    expect(upsert.where).toEqual({ studentId_date: { studentId: 'stu-1', date: '2026-08-25' } })
    expect(upsert.create).toMatchObject({ status: 'EXCUSED', schoolId: 'sch-1', markedById: 'u-reception' })
    expect(upsert.update).toMatchObject({ status: 'EXCUSED' })
    // Audited against the resolved actor (a partner request has no req.user).
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u-reception', action: 'UPDATE', resourceType: 'ATTENDANCE_REQUEST',
      resourceId: 'ar-1', schoolId: 'sch-1',
    })
  })

  it('covers every day of a multi-day absence', async () => {
    prismaMock.attendanceRequest.findFirst.mockResolvedValue({
      ...REQ, startDate: '2026-08-25', endDate: '2026-08-27',
    })
    await review({ hub_user_id: 'hu-reception', status: 'APPROVED' })

    expect(prismaMock.attendanceRecord.upsert.mock.calls.map(c => c[0].where.studentId_date.date)).toEqual([
      '2026-08-25', '2026-08-26', '2026-08-27',
    ])
  })

  it('declines without touching the register', async () => {
    prismaMock.attendanceRequest.update.mockResolvedValue({ id: 'ar-1', status: 'DECLINED', reviewedAt: null })
    const res = await review({ hub_user_id: 'hu-reception', status: 'DECLINED', review_notes: '  no evidence  ' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DECLINED')
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled()
    expect(prismaMock.attendanceRequest.update.mock.calls[0][0].data.reviewNotes).toBe('no evidence')
  })

  it('never writes register rows for a non-absence (early pickup, late arrival)', async () => {
    prismaMock.attendanceRequest.findFirst.mockResolvedValue({ ...REQ, type: 'EARLY_PICKUP' })
    await review({ hub_user_id: 'hu-reception', status: 'APPROVED' })
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled()
  })

  it('400s on a status that is neither APPROVED nor DECLINED', async () => {
    for (const status of ['PENDING', 'approved', '', undefined]) {
      const res = await review({ hub_user_id: 'hu-reception', status })
      expect(res.status).toBe(400)
    }
    expect(prismaMock.attendanceRequest.update).not.toHaveBeenCalled()
  })

  it('403s an unresolvable actor, and changes nothing', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.ilsaLink.findFirst.mockResolvedValue(null)
    const res = await review({ hub_user_id: 'ghost', status: 'APPROVED' })
    expect(res.status).toBe(403)
    expect(prismaMock.attendanceRequest.update).not.toHaveBeenCalled()
  })

  it('401s without a partner token', async () => {
    const res = await request(makeApp()).post('/api/partner/attendance/ar-1/review').send({ status: 'APPROVED' })
    expect(res.status).toBe(401)
  })

  it("404s a request outside the actor's school — never confirms it exists", async () => {
    prismaMock.attendanceRequest.findFirst.mockResolvedValue(null)
    const res = await review({ hub_user_id: 'hu-reception', status: 'APPROVED' })
    expect(res.status).toBe(404)
    // The lookup is school-scoped to the actor, not to anything the caller sent.
    expect(prismaMock.attendanceRequest.findFirst.mock.calls[0][0].where).toEqual({
      id: 'ar-1', schoolId: 'sch-1',
    })
  })
})
