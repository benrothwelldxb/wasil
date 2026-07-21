// Wasil Hub webhook receiver (Stage 2 — freshness signal only).
//
//   POST /api/hub/webhook
//
// Hub fires this whenever roster data changes (pupil.updated, staff.created,
// class.updated, roles.updated, …; see INTEGRATION.md → Data freshness). This
// slice implements only the *freshness signal*: verify the HMAC signature, then
// stamp `School.hubDataStaleSince` so the admin sees the "stale data" banner and
// can trigger a pull via POST /api/admin/hub-sync. We deliberately do NOT act on
// the event type here — full event-specific handling (single-pupil deep-links,
// bulk-vs-single, roles-only refresh) is a documented follow-on.
//
// This router is mounted BEFORE the global `express.json()` and parses the body
// with `express.raw`, because HMAC verification needs the exact bytes Hub signed
// — re-serialising a parsed object would change them.
import { Router, raw, Request, Response } from 'express'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import prisma from '../services/prisma.js'

const router = Router()

/**
 * Verify a Hub webhook signature. Ported verbatim (behaviour-wise) from
 * `@wasil/pupils-client`'s `verifyWebhookSignature`: the shared secret is
 * sha256-hashed, that hash keys an HMAC-sha256 over the raw body, compared in
 * constant time against the `sha256=…` header.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const expected = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader
  const secretHash = createHash('sha256').update(secret).digest('hex')
  const computed = createHmac('sha256', secretHash).update(rawBody).digest('hex')
  if (expected.length !== computed.length) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(computed, 'hex'))
}

router.post('/webhook', raw({ type: '*/*' }), async (req: Request, res: Response) => {
  const secret = process.env.HUB_WEBHOOK_SECRET || ''
  if (!secret) {
    // Not wired up yet (the secret ships with the service token). Acknowledge
    // without trusting anything so Hub's delivery log doesn't fill with retries.
    return res.status(503).json({ error: 'webhook_secret_not_configured' })
  }

  const signature = req.header('X-Wasil-Signature') || ''
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  if (!signature || !verifyWebhookSignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: 'invalid_signature' })
  }

  // Signature verified. Extract the Hub school id and mark it stale. Any parse
  // failure is a malformed (but signed) body — 400.
  let payload: { schoolId?: unknown }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ error: 'invalid_body' })
  }
  const hubSchoolId = typeof payload.schoolId === 'string' ? payload.schoolId : null
  if (!hubSchoolId) {
    // Signed but no school to attribute the change to — accept, nothing to do.
    return res.json({ ok: true })
  }

  // Set the freshness flag. If the school isn't linked here, the update matches
  // nothing — fine; we simply have nothing to mark stale.
  await prisma.school.updateMany({
    where: { hubSchoolId },
    data: { hubDataStaleSince: new Date() },
  })

  return res.json({ ok: true })
})

export default router
