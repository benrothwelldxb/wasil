import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// A school ADMIN can drive the provider portal for one of THEIR providers, so a
// school can set a provider up (profile, clubs, menus) before handing over, and
// fix things after. Same routes as the provider's own self-service — the guard
// is the entire security boundary, so it's pinned here.

const prismaMock = {
  providerSchoolLink: { findFirst: vi.fn() },
  provider: { findUnique: vi.fn(), update: vi.fn() },
  providerUser: { findUnique: vi.fn(), update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

let CURRENT_USER: { id: string; role: string; schoolId: string; name: string } | null = null
vi.mock('../src/middleware/authTokens', () => ({ verifyAccessToken: vi.fn(), verifyProviderAccessToken: vi.fn() }))

const { requireProviderOrSchoolAdmin } = await import('../src/middleware/auth')

// A tiny app that reports whichever principal the guard resolved.
function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (CURRENT_USER) (req as express.Request & { user?: unknown }).user = CURRENT_USER
    next()
  })
  app.get('/portal/thing', requireProviderOrSchoolAdmin, (req, res) => {
    res.json({
      providerId: req.providerUser?.providerId ?? null,
      actorId: req.providerUser?.id ?? null,
      actingAdmin: req.providerActingAdmin === true,
    })
  })
  return app
}

const ADMIN = { id: 'admin-1', role: 'ADMIN', schoolId: 'sch-1', name: 'Head' }

beforeEach(() => {
  vi.clearAllMocks()
  CURRENT_USER = { ...ADMIN }
  prismaMock.providerSchoolLink.findFirst.mockResolvedValue({ providerId: 'prov-1' })
})

describe('requireProviderOrSchoolAdmin', () => {
  it('lets a school admin act on a provider linked to their school', async () => {
    const res = await request(makeApp()).get('/portal/thing?provider_id=prov-1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ providerId: 'prov-1', actorId: 'admin-1', actingAdmin: true })
    // Authorisation is the LINK to the admin's own school, never the caller's word.
    expect(prismaMock.providerSchoolLink.findFirst.mock.calls[0][0].where).toEqual({
      providerId: 'prov-1', schoolId: 'sch-1',
    })
  })

  it("404s a provider that isn't linked to the admin's school", async () => {
    prismaMock.providerSchoolLink.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).get('/portal/thing?provider_id=prov-other')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Provider not found')
  })

  it('gives the same answer for unknown and cross-school ids — no probing', async () => {
    prismaMock.providerSchoolLink.findFirst.mockResolvedValue(null)
    const a = await request(makeApp()).get('/portal/thing?provider_id=does-not-exist')
    const b = await request(makeApp()).get('/portal/thing?provider_id=prov-of-another-school')
    expect(a.status).toBe(b.status)
    expect(a.body).toEqual(b.body)
  })

  it('refuses a non-admin staff member', async () => {
    CURRENT_USER = { ...ADMIN, role: 'STAFF' }
    const res = await request(makeApp()).get('/portal/thing?provider_id=prov-1')
    expect(res.status).toBe(403)
    expect(prismaMock.providerSchoolLink.findFirst).not.toHaveBeenCalled()
  })

  it('refuses a parent outright', async () => {
    CURRENT_USER = { ...ADMIN, role: 'PARENT' }
    const res = await request(makeApp()).get('/portal/thing?provider_id=prov-1')
    expect(res.status).toBe(403)
  })

  it('refuses an unauthenticated caller who names a provider', async () => {
    CURRENT_USER = null
    const res = await request(makeApp()).get('/portal/thing?provider_id=prov-1')
    expect(res.status).toBe(401)
    expect(prismaMock.providerSchoolLink.findFirst).not.toHaveBeenCalled()
  })

  it('accepts provider_id from the body too (POST/PATCH routes)', async () => {
    const app = makeApp()
    app.post('/portal/thing', requireProviderOrSchoolAdmin, (req, res) =>
      res.json({ providerId: req.providerUser?.providerId ?? null }),
    )
    const res = await request(app).post('/portal/thing').send({ provider_id: 'prov-1' })
    expect(res.body.providerId).toBe('prov-1')
  })

  it('without provider_id it falls through to the provider session path', async () => {
    // No provider bearer token here, so the provider guard rejects — the point
    // is that an admin session alone grants nothing without naming a provider.
    const res = await request(makeApp()).get('/portal/thing')
    expect(res.status).toBe(401)
    expect(prismaMock.providerSchoolLink.findFirst).not.toHaveBeenCalled()
  })
})
