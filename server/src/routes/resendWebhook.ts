import { Router, raw, Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import prisma from '../services/prisma.js'
import logger from '../services/logger.js'

/**
 * Resend delivery webhook. Resend signs webhooks with Svix, so this router is
 * mounted BEFORE `express.json()` and reads the raw bytes (signature is computed
 * over the exact body). Each event is recorded as an `EmailEvent` keyed by the
 * recipient email, so the Operations Console can show support exactly why an
 * invitation did or didn't land (delivered / opened / bounced / complained…).
 *
 * Security: when `RESEND_WEBHOOK_SECRET` is set the Svix signature is verified
 * (fail closed on mismatch). In production the secret is REQUIRED — an unsigned
 * request is rejected. In non-production it is accepted with a warning so local
 * testing works without a secret.
 */

const router = Router()

const KNOWN = new Set(['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'delivery_delayed'])

function verifySvix(secret: string, id: string, timestamp: string, body: string, signatureHeader: string): boolean {
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const signedContent = `${id}.${timestamp}.${body}`
    const expected = createHmac('sha256', key).update(signedContent).digest('base64')
    const expectedBuf = Buffer.from(expected)
    // Header is a space-separated list of `v1,<sig>` — accept if any matches.
    for (const part of signatureHeader.split(' ')) {
      const sig = part.includes(',') ? part.split(',')[1]! : part
      const sigBuf = Buffer.from(sig)
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) return true
    }
    return false
  } catch {
    return false
  }
}

router.post('/resend', raw({ type: '*/*', limit: '1mb' }), async (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  const secret = process.env.RESEND_WEBHOOK_SECRET

  if (secret) {
    const id = req.header('svix-id') || ''
    const ts = req.header('svix-timestamp') || ''
    const sig = req.header('svix-signature') || ''
    if (!id || !ts || !sig || !verifySvix(secret, id, ts, rawBody, sig)) {
      return res.status(401).json({ error: 'invalid_signature' })
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.error('RESEND_WEBHOOK_SECRET not set — rejecting webhook in production')
    return res.status(500).json({ error: 'webhook_not_configured' })
  } else {
    logger.warn('RESEND_WEBHOOK_SECRET not set — accepting webhook unverified (non-production)')
  }

  let payload: { type?: string; data?: Record<string, unknown> }
  try { payload = JSON.parse(rawBody) } catch { return res.status(400).json({ error: 'bad_json' }) }

  const type = (payload.type || '').replace(/^email\./, '')
  const data = payload.data || {}
  const toRaw = data.to
  const email = (Array.isArray(toRaw) ? toRaw[0] : toRaw || data.email) as string | undefined
  const messageId = (data.email_id || data.id) as string | undefined
  const bounce = data.bounce as { message?: string } | undefined
  const reason = (data.reason as string | undefined) || bounce?.message || undefined

  if (!email || !KNOWN.has(type)) {
    // Acknowledge unknown/irrelevant events so Resend doesn't retry forever.
    return res.json({ ok: true, ignored: true })
  }

  try {
    await prisma.emailEvent.create({
      data: { email: email.toLowerCase(), type, messageId: messageId ?? null, reason: reason ?? null },
    })
  } catch (e) {
    logger.error({ err: e }, 'failed to record email event')
    // Still 200 so Resend doesn't hammer retries on a transient DB blip.
  }
  return res.json({ ok: true })
})

export default router
