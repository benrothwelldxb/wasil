import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'crypto'

// The partner API surface for Desk: a Bearer partner token (hash-verified) and a
// count-only unread inbox summary keyed on a Hub user id. Prisma is mocked.

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  conversation: { count: vi.fn() },
  school: { findFirst: vi.fn() },
  attendanceRequest: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const TOKEN = 'cpk_secret'
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.update.mockResolvedValue({})
  // Default: the token is valid.
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
})

describe('partner auth', () => {
  it('401 without a Bearer token', async () => {
    const res = await request(makeApp()).get('/api/partner/inbox/summary?hub_user_id=hu-1')
    expect(res.status).toBe(401)
  })

  it('401 on an unknown / revoked token', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValueOnce(null)
    const res = await request(makeApp())
      .get('/api/partner/inbox/summary?hub_user_id=hu-1')
      .set('Authorization', 'Bearer nope')
    expect(res.status).toBe(401)

    prismaMock.partnerToken.findUnique.mockResolvedValueOnce({ id: 'pt-1', name: 'desk', revokedAt: new Date() })
    const res2 = await request(makeApp())
      .get('/api/partner/inbox/summary?hub_user_id=hu-1')
      .set('Authorization', `Bearer ${TOKEN}`)
    expect(res2.status).toBe(401)
  })

  it('looks the token up by its SHA-256 hash, never the plaintext', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1' })
    prismaMock.conversation.count.mockResolvedValue(0)
    await request(makeApp())
      .get('/api/partner/inbox/summary?hub_user_id=hu-1')
      .set('Authorization', `Bearer ${TOKEN}`)
    expect(prismaMock.partnerToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: TOKEN_HASH } })
  })
})

describe('GET /api/partner/inbox/summary', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('400 when hub_user_id is missing', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/inbox/summary'))
    expect(res.status).toBe(400)
  })

  it('resolves the staff member by hubUserId and counts unread inbound threads', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'staff-9' })
    prismaMock.conversation.count.mockResolvedValue(3)

    const res = await auth(request(makeApp()).get('/api/partner/inbox/summary?hub_user_id=hub-abc'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ unread: 3 })
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { hubUserId: 'hub-abc' }, select: { id: true } })
    // Count is scoped to the staff member's own non-archived threads with an
    // unread, non-deleted inbound message — never content.
    expect(prismaMock.conversation.count).toHaveBeenCalledWith({
      where: {
        staffId: 'staff-9',
        archivedByStaff: false,
        messages: { some: { senderId: { not: 'staff-9' }, readAt: null, deletedAt: null } },
      },
    })
  })

  it('unknown user → { unread: 0 }, not an error (and no count query)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/inbox/summary?hub_user_id=ghost'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ unread: 0 })
    expect(prismaMock.conversation.count).not.toHaveBeenCalled()
  })
})

describe('GET /api/partner/attendance/today', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  beforeEach(() => {
    prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1', timezone: 'Asia/Dubai' })
    prismaMock.attendanceRequest.findMany.mockResolvedValue([])
  })

  it('401 without a valid partner token', async () => {
    const res = await request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1&date=2026-08-14')
    expect(res.status).toBe(401)
  })

  it('400 when school_id is missing', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/attendance/today'))
    expect(res.status).toBe(400)
  })

  it('400 on a malformed date', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1&date=14-08-2026'))
    expect(res.status).toBe(400)
  })

  it('unknown school → empty absences, not an error', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=ghost&date=2026-08-14'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ date: '2026-08-14', absences: [] })
    expect(prismaMock.attendanceRequest.findMany).not.toHaveBeenCalled()
  })

  it('resolves the school by Hub id and queries the date-covering window', async () => {
    await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1&date=2026-08-14'))
    expect(prismaMock.school.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ hubSchoolId: 'hub-1' }, { id: 'hub-1' }] },
      select: { id: true, timezone: true },
    })
    const where = prismaMock.attendanceRequest.findMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('sch-1')
    expect(where.startDate).toEqual({ lte: '2026-08-14' })
    expect(where.OR).toEqual([
      { endDate: { gte: '2026-08-14' } },
      { AND: [{ endDate: null }, { startDate: { gte: '2026-08-14' } }] },
    ])
  })

  it('defaults date to today in the school timezone when omitted', async () => {
    // 2026-08-13 22:30 UTC is 2026-08-14 02:30 in Dubai (UTC+4).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-13T22:30:00.000Z'))
    try {
      const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1'))
      expect(res.body.date).toBe('2026-08-14')
    } finally {
      vi.useRealTimers()
    }
  })

  it('maps rows to denormalised display data with hubClassId per row', async () => {
    prismaMock.attendanceRequest.findMany.mockResolvedValue([
      {
        type: 'ABSENCE', reason: 'illness', notes: 'high temp', startDate: '2026-08-14', endDate: null,
        time: null, status: 'PENDING',
        student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A', hubClassId: 'hc-1' } },
      },
      {
        type: 'EARLY_PICKUP', reason: 'appointment', notes: null, startDate: '2026-08-12', endDate: '2026-08-15',
        time: '13:30', status: 'APPROVED',
        student: { firstName: 'Bilal', lastName: 'Khan', class: { name: '2B', hubClassId: null } },
      },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1&date=2026-08-14'))
    expect(res.status).toBe(200)
    expect(res.body.absences).toEqual([
      { studentName: 'Amina Khan', hubClassId: 'hc-1', className: '1A', type: 'ABSENCE', reason: 'illness', notes: 'high temp', startDate: '2026-08-14', endDate: null, time: null, status: 'PENDING' },
      { studentName: 'Bilal Khan', hubClassId: null, className: '2B', type: 'EARLY_PICKUP', reason: 'appointment', notes: null, startDate: '2026-08-12', endDate: '2026-08-15', time: '13:30', status: 'APPROVED' },
    ])
    // No other pupil PII leaked — exactly these keys.
    expect(Object.keys(res.body.absences[0]).sort()).toEqual(
      ['className', 'endDate', 'hubClassId', 'notes', 'reason', 'startDate', 'status', 'studentName', 'time', 'type'].sort(),
    )
  })
})
