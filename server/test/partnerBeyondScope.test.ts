import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The scope Wasil Beyond is minted with.
 *
 * Beyond runs each trip's parents' group, posts to it, attaches a consent form
 * and reads the answers back. So, unlike Active, it needs reads — and that is
 * exactly why the prefix list has to be right: a token that may GET is one
 * mis-typed prefix away from parent correspondence. These tests pin the agreed
 * list against the real middleware rather than restating it.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { requirePartner } = await import('../src/middleware/partnerAuth')
const { PARTNER_SCOPE_PRESETS } = await import('../src/services/partnerScopes')

function makeApp() {
  const app = express()
  const ok = (_q: express.Request, res: express.Response) => res.json({ ok: true })
  const partner = express.Router()
  partner.get('/groups', requirePartner, ok)
  partner.post('/groups', requirePartner, ok)
  partner.get('/groups/:id', requirePartner, ok)
  partner.patch('/groups/:id', requirePartner, ok)
  partner.delete('/groups/:id', requirePartner, ok)
  partner.put('/groups/:ref/roster', requirePartner, ok)
  partner.get('/messages', requirePartner, ok)
  partner.post('/messages', requirePartner, ok)
  partner.put('/forms/:ref', requirePartner, ok)
  partner.get('/forms/:ref/responses', requirePartner, ok)
  partner.post('/inbox/upload', requirePartner, ok)
  partner.get('/inbox/threads', requirePartner, ok)
  partner.get('/inbox/recipients', requirePartner, ok)
  partner.get('/oversight/parent-threads', requirePartner, ok)
  partner.get('/services', requirePartner, ok)
  partner.put('/activities/:ref', requirePartner, ok)
  const communication = express.Router()
  communication.post('/intents', requirePartner, ok)
  app.use('/api/partner/communication', communication)
  app.use('/api/partner', partner)
  return app
}

const auth = (r: request.Test) => r.set('Authorization', 'Bearer cpk_beyond')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.partnerToken.findUnique.mockResolvedValue({
    id: 'pt-beyond', name: 'beyond', revokedAt: null, ...PARTNER_SCOPE_PRESETS.beyond,
  })
})

describe('the beyond preset', () => {
  it('reaches every call Beyond makes', async () => {
    const app = makeApp()
    const calls: request.Test[] = [
      request(app).get('/api/partner/groups?school_id=s'),
      request(app).post('/api/partner/groups'),
      request(app).get('/api/partner/groups/beyond:trip:1'),
      request(app).patch('/api/partner/groups/beyond:trip:1'),
      request(app).delete('/api/partner/groups/beyond:trip:1'),
      request(app).put('/api/partner/groups/beyond:trip:1/roster'),
      request(app).get('/api/partner/messages?school_id=s'),
      request(app).post('/api/partner/messages'),
      request(app).put('/api/partner/forms/beyond:consent:1'),
      request(app).get('/api/partner/forms/beyond:consent:1/responses'),
      request(app).post('/api/partner/inbox/upload'),
    ]
    for (const call of calls) expect((await auth(call)).status).toBe(200)
  })

  it('does not reach parent correspondence, services or other partners\' routes', async () => {
    const app = makeApp()
    const calls: request.Test[] = [
      // The upload prefix is a whole segment: it must not open the threads.
      request(app).get('/api/partner/inbox/threads'),
      request(app).get('/api/partner/inbox/recipients'),
      request(app).get('/api/partner/oversight/parent-threads'),
      request(app).get('/api/partner/services'),
      request(app).put('/api/partner/activities/x'),
      request(app).post('/api/partner/communication/intents'),
    ]
    for (const call of calls) {
      const res = await auth(call)
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'token_not_permitted' })
    }
  })

  it('is written as full paths, which is the only form the middleware matches', () => {
    for (const p of PARTNER_SCOPE_PRESETS.beyond.allowedPrefixes) {
      expect(p.startsWith('/api/partner/')).toBe(true)
    }
  })
})
