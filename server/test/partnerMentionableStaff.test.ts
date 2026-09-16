import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/partner/staff/mentionable — the list Desk's broadcast composer picks
 * from when tagging a staff member.
 *
 * Desk holds Hub user ids and nothing else, so it cannot build a mention
 * without asking for the Connect ids that mentions resolve against. The role
 * rule is part of the mention contract (ADR 0003) and is applied HERE on
 * purpose: a second copy of it in Desk would drift from the day it was written,
 * and the failure would be a tag pointing at someone who should never have been
 * taggable.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  school: { findFirst: vi.fn(), findMany: vi.fn() },
  ilsaLink: { findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), sendStaffNotification: vi.fn() }))
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

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1' })
  prismaMock.user.findMany.mockResolvedValue([
    { id: 'u-rob', name: 'Rob Davies', role: 'STAFF', position: 'PE Coordinator' },
    { id: 'u-amal', name: 'Amal Qanda', role: 'ADMIN', position: null },
  ])
})

describe('GET /api/partner/staff/mentionable', () => {
  it('returns the Connect user ids a mention resolves against', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/staff/mentionable?school_id=hub-1'))
    expect(res.status).toBe(200)
    expect(res.body.staff).toEqual([
      { userId: 'u-rob', name: 'Rob Davies', role: 'STAFF', position: 'PE Coordinator' },
      { userId: 'u-amal', name: 'Amal Qanda', role: 'ADMIN', position: null },
    ])
  })

  it('applies the contract role filter itself, and excludes test accounts', async () => {
    await auth(request(makeApp()).get('/api/partner/staff/mentionable?school_id=hub-1'))
    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.role).toEqual({ in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] })
    expect(where.isTest).toBe(false)
    expect(where.schoolId).toBe('sch-1')
  })

  it('never exposes an ILSA — they are scoped to one pupil, not a broadcast', async () => {
    await auth(request(makeApp()).get('/api/partner/staff/mentionable?school_id=hub-1'))
    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.role.in).not.toContain('ILSA')
    expect(where.role.in).not.toContain('PARENT')
  })

  it('returns display data only — no email or account state', async () => {
    await auth(request(makeApp()).get('/api/partner/staff/mentionable?school_id=hub-1'))
    const select = prismaMock.user.findMany.mock.calls[0][0].select
    expect(select).toEqual({ id: true, name: true, role: true, position: true })
  })

  it('accepts a Hub school id or a Connect school id', async () => {
    await auth(request(makeApp()).get('/api/partner/staff/mentionable?school_id=hub-1'))
    expect(prismaMock.school.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ hubSchoolId: 'hub-1' }, { id: 'hub-1' }] },
      })
    )
  })

  it('treats an unknown school as empty, not an error — Desk may probe ids we do not host', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/staff/mentionable?school_id=nope'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ staff: [] })
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it('requires school_id rather than listing every school it hosts', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/staff/mentionable'))
    expect(res.status).toBe(400)
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller', async () => {
    const res = await request(makeApp()).get('/api/partner/staff/mentionable?school_id=hub-1')
    expect(res.status).toBeGreaterThanOrEqual(401)
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })
})
