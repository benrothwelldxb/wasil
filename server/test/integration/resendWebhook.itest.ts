import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'crypto'

// Resend delivery webhook against real Postgres. Verifies Svix signature
// handling (accept valid, reject invalid) and that a delivery event is recorded
// and queryable by recipient email (what the support console reads).

process.env.RESEND_WEBHOOK_SECRET = 'whsec_' + Buffer.from(crypto.randomBytes(24)).toString('base64')

const prisma = (await import('../../src/services/prisma')).default
const { default: resendWebhookRoutes } = await import('../../src/routes/resendWebhook')

const TAG = 'itest-resend'
function app() { const a = express(); a.use('/api/webhooks', resendWebhookRoutes); return a }

function sign(body: string, id = 'msg_1', ts = String(Math.floor(Date.now() / 1000))) {
  const key = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ''), 'base64')
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` }
}

afterAll(async () => {
  await prisma.emailEvent.deleteMany({ where: { email: { startsWith: TAG } } })
  await prisma.$disconnect()
})

describe('Resend webhook (real PG)', () => {
  it('records a delivery event for a validly-signed payload', async () => {
    const email = `${TAG}-a@example.com`
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'e1', to: [email] } })
    const res = await request(app()).post('/api/webhooks/resend').set(sign(body)).set('content-type', 'application/json').send(body)
    expect(res.status).toBe(200)
    const ev = await prisma.emailEvent.findFirst({ where: { email } })
    expect(ev?.type).toBe('delivered')
    expect(ev?.messageId).toBe('e1')
  })

  it('captures a bounce with its reason', async () => {
    const email = `${TAG}-b@example.com`
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'e2', to: [email], bounce: { message: 'mailbox full' } } })
    const res = await request(app()).post('/api/webhooks/resend').set(sign(body)).set('content-type', 'application/json').send(body)
    expect(res.status).toBe(200)
    const ev = await prisma.emailEvent.findFirst({ where: { email, type: 'bounced' } })
    expect(ev?.reason).toBe('mailbox full')
  })

  it('rejects an invalid signature (401)', async () => {
    const email = `${TAG}-c@example.com`
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'e3', to: [email] } })
    const res = await request(app()).post('/api/webhooks/resend')
      .set({ 'svix-id': 'x', 'svix-timestamp': '1', 'svix-signature': 'v1,not-a-real-sig' })
      .set('content-type', 'application/json').send(body)
    expect(res.status).toBe(401)
    expect(await prisma.emailEvent.count({ where: { email } })).toBe(0)
  })

  it('acknowledges but ignores unknown event types', async () => {
    const body = JSON.stringify({ type: 'email.some_future_event', data: { to: [`${TAG}-d@example.com`] } })
    const res = await request(app()).post('/api/webhooks/resend').set(sign(body)).set('content-type', 'application/json').send(body)
    expect(res.status).toBe(200)
    expect(res.body.ignored).toBe(true)
  })
})
