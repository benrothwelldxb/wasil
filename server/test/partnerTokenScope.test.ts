import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A partner token carries what it may call.
 *
 * Every valid token used to reach every partner route: `requirePartner`
 * resolved the token, attached `req.partner`, and not one of the 34 handlers
 * ever read it. So a token minted for an app that needed to create contact
 * groups could also read staff↔parent correspondence, list every pupil with
 * their guardians, pull a family's whole correspondence from the evidence
 * route, read the private parent↔ILSA threads, and broadcast to the school.
 *
 * Two allowlists now, and the METHOD one is the sharper: every route worth
 * worrying about here is a GET, so a write-only token cannot reach one even if
 * a prefix is mis-specified later.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { requirePartner } = await import('../src/middleware/partnerAuth')

/** Mounts two routers the way index.ts does, so `req.baseUrl + req.path` is
 *  exercised rather than assumed — a prefix is matched as the CALLER writes it,
 *  and `req.path` alone is relative to whichever router is handling it. */
function makeApp() {
  const app = express()
  const communication = express.Router()
  communication.post('/intents', requirePartner, (_q, res) => res.json({ ok: 'intents' }))

  const partner = express.Router()
  partner.post('/groups', requirePartner, (_q, res) => res.json({ ok: 'create-group' }))
  partner.patch('/groups/:id', requirePartner, (_q, res) => res.json({ ok: 'patch-group' }))
  partner.put('/activities/:ref', requirePartner, (_q, res) => res.json({ ok: 'activity' }))
  partner.get('/groups', requirePartner, (_q, res) => res.json({ ok: 'list-groups' }))
  partner.get('/oversight/parent-threads', requirePartner, (_q, res) => res.json({ ok: 'correspondence' }))
  partner.get('/inbox/recipients', requirePartner, (_q, res) => res.json({ ok: 'recipients' }))
  partner.post('/messages', requirePartner, (_q, res) => res.json({ ok: 'broadcast' }))

  app.use('/api/partner/communication', communication)
  app.use('/api/partner', partner)
  return app
}

const TOKEN = 'cpk_test'
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

/** The scope Wasil Active actually needs: three prefixes, writes only. */
const ACTIVE = {
  id: 'pt-active',
  name: 'active',
  revokedAt: null,
  allowedPrefixes: [
    '/api/partner/communication',
    '/api/partner/activities',
    '/api/partner/groups',
  ],
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.partnerToken.findUnique.mockResolvedValue(ACTIVE)
})

describe('requirePartner — a scoped token', () => {
  it('allows every call the partner actually makes', async () => {
    const app = makeApp()
    expect((await auth(request(app).post('/api/partner/communication/intents'))).status).toBe(200)
    expect((await auth(request(app).post('/api/partner/groups'))).status).toBe(200)
    expect((await auth(request(app).patch('/api/partner/groups/g-1'))).status).toBe(200)
    expect((await auth(request(app).put('/api/partner/activities/ext-1'))).status).toBe(200)
  })

  // The point of the method list. These are the routes that made an unscoped
  // token worth stopping for, and every one of them is a GET.
  it('refuses the reads, including one whose prefix IS allowed', async () => {
    const app = makeApp()
    expect((await auth(request(app).get('/api/partner/oversight/parent-threads'))).status).toBe(403)
    expect((await auth(request(app).get('/api/partner/inbox/recipients'))).status).toBe(403)
    // /api/partner/groups is an allowed prefix, and this is still refused —
    // which is the property a prefix list alone cannot give you.
    expect((await auth(request(app).get('/api/partner/groups'))).status).toBe(403)
  })

  it('refuses a write to a prefix it was not given', async () => {
    // Broadcasting to the whole school is a POST, so only the prefix stops it.
    const res = await auth(request(makeApp()).post('/api/partner/messages'))
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'token_not_permitted' })
  })

  it('matches prefixes on whole segments, not string prefixes', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValue({
      ...ACTIVE, allowedPrefixes: ['/api/partner/group'], // NB: singular
    })
    // "/api/partner/groups" must not match the prefix "/api/partner/group".
    expect((await auth(request(makeApp()).post('/api/partner/groups'))).status).toBe(403)
  })

  it('403s rather than 404s — the token is valid, it just is not for this', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/inbox/recipients'))
    expect(res.status).toBe(403)
    // Distinct from invalid_token, so a partner can tell "my credential is
    // wrong" from "my credential is fine but not for this route".
    expect(res.body).toEqual({ error: 'token_not_permitted' })
  })
})

describe('requirePartner — an unscoped token', () => {
  // Empty lists mean unrestricted, so every token minted before scoping shipped
  // keeps working exactly as it did. This is the one behaviour that must NOT
  // change, because Desk holds such a token.
  const LEGACY = { id: 'pt-desk', name: 'desk', revokedAt: null, allowedPrefixes: [], allowedMethods: [] }

  it('reaches everything, reads included', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValue(LEGACY)
    const app = makeApp()
    expect((await auth(request(app).get('/api/partner/oversight/parent-threads'))).status).toBe(200)
    expect((await auth(request(app).post('/api/partner/messages'))).status).toBe(200)
    expect((await auth(request(app).post('/api/partner/communication/intents'))).status).toBe(200)
  })

  // A row written before the columns existed reads as null, not [].
  it('treats null lists as unrestricted too, not as deny-all', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValue({
      ...LEGACY, allowedPrefixes: null, allowedMethods: null,
    })
    expect((await auth(request(makeApp()).get('/api/partner/inbox/recipients'))).status).toBe(200)
  })
})

describe('requirePartner — credential failures are unchanged', () => {
  it('401s a missing or revoked token, before any scope check', async () => {
    const app = makeApp()
    expect((await request(app).post('/api/partner/groups')).status).toBe(401)

    prismaMock.partnerToken.findUnique.mockResolvedValue({ ...ACTIVE, revokedAt: new Date() })
    const res = await auth(request(app).post('/api/partner/groups'))
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'invalid_token' })
  })
})
