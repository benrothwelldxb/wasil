import { Router } from 'express'
import type { Request, Response } from 'express'
import { requirePartner } from '../middleware/partnerAuth.js'
import { isKnownEventType, recordIntent } from '../services/activityIntents.js'

/**
 * Wasil Active → Connect: communication intents.
 *
 *   POST /api/partner/communication/intents
 *
 * Active owns extra-curricular activities end to end and publishes the outcomes
 * it wants a family told about. This endpoint is the whole of Connect's part:
 * take the intent, find the child's parents, notify them.
 *
 * THE STATUS CODES ARE THE CONTRACT. Active classifies our reply and its outbox
 * behaves accordingly, so each one has to mean exactly what Active reads it as:
 *
 *   2xx           delivered. Active stops; everything after this is ours.
 *   400, 422      permanent. A body no retry could fix.
 *   401, 403      permanent. Token rejected (requirePartner).
 *   404           permanent, and read specifically as "this endpoint does not
 *                 exist yet". NEVER returned from inside this handler — an
 *                 unknown pupil is not a missing endpoint.
 *   anything else retryable. Active re-sends from its durable outbox.
 *
 * The consequence worth holding on to: an unknown pupil or an unresolvable
 * parent answers 2xx and is recorded UNDELIVERABLE on our side, because a retry
 * cannot fix a roster gap and a 404 would tell Active the endpoint is missing.
 */
const router = Router()

/** A body Active can never fix. Permanent by contract — say what was wrong. */
function badRequest(res: Response, error: string) {
  return res.status(400).json({ error })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

router.post('/intents', requirePartner, async (req: Request, res: Response) => {
  try {
    if (!isPlainObject(req.body)) return badRequest(res, 'body must be an object')

    const {
      event_type: eventType,
      school_id: schoolId,
      hub_pupil_id: hubPupilId,
      payload,
      idempotency_key: idempotencyKey,
      occurred_at: occurredAt,
    } = req.body as Record<string, unknown>

    if (typeof eventType !== 'string' || !eventType.trim()) {
      return badRequest(res, 'event_type is required')
    }
    // Unknown-but-well-formed is 422, not 400: Active has event types we do not
    // handle and may add more, and this distinguishes "malformed" from "not
    // something Connect speaks". Both are permanent, so neither is retried.
    if (!isKnownEventType(eventType)) {
      return res.status(422).json({ error: 'unsupported_event_type', event_type: eventType })
    }

    if (typeof schoolId !== 'string' || !schoolId.trim()) {
      return badRequest(res, 'school_id is required')
    }

    // Contractually always present and may be null. A missing key is treated as
    // null rather than rejected — permanently failing a real allocation outcome
    // over a dropped key would cost a parent their message.
    if (hubPupilId !== undefined && hubPupilId !== null && typeof hubPupilId !== 'string') {
      return badRequest(res, 'hub_pupil_id must be a string or null')
    }

    if (!isPlainObject(payload)) return badRequest(res, 'payload must be an object')

    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return badRequest(res, 'idempotency_key is required')
    }

    if (typeof occurredAt !== 'string' || Number.isNaN(Date.parse(occurredAt))) {
      return badRequest(res, 'occurred_at must be an ISO-8601 timestamp')
    }

    const result = await recordIntent({
      eventType,
      hubSchoolId: schoolId.trim(),
      hubPupilId: typeof hubPupilId === 'string' && hubPupilId.trim() ? hubPupilId.trim() : null,
      payload,
      idempotencyKey: idempotencyKey.trim(),
      occurredAt: new Date(occurredAt),
    })

    // `id` is the intent receipt; Active stores it as its connect_message_id.
    return res.json({
      id: result.id,
      status: result.status,
      recipients: result.recipients,
      ...(result.reason ? { reason: result.reason } : {}),
    })
  } catch (error) {
    // Deliberately a 500: unknown failures are RETRYABLE, and Active's outbox is
    // a better place for a transient database problem than a swallowed message.
    console.error('Partner communication intent failed:', error)
    return res.status(500).json({ error: 'intent_failed' })
  }
})

export default router
