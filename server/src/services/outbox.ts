import { Prisma, OutboxStatus } from '@prisma/client'
import prisma from './prisma.js'
import logger from './logger.js'
import { captureException } from './errorReporter.js'
import { sendEmail } from './email.js'
import { sendPushNotification, removeInvalidTokens } from './firebase.js'

/**
 * Outbox: reliable delivery for outbound email and push notifications.
 *
 * Callers `enqueue*()` rows inside their own business transaction. A worker
 * drains the queue with exponential backoff. This:
 *   - Removes silent loss when Resend or FCM is briefly unavailable
 *   - Decouples request latency from downstream provider latency
 *   - Gives one place to inspect what's queued, what failed, and why
 */

const MAX_ATTEMPTS = 5
const BATCH_SIZE = 50
// Backoff schedule in minutes: 1m, 5m, 15m, 1h, 6h. Index is `attempts` value
// AFTER incrementing — so a row that just failed for the 1st time waits 1m.
const BACKOFF_MINUTES = [1, 5, 15, 60, 6 * 60]

// ─── Payload shapes ──────────────────────────────────────────────────────────

interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

interface PushPayload {
  // Snapshot of device tokens at enqueue time. Tokens that have rotated
  // since will simply fail and be removed by the worker; the user's next
  // device-register call will refresh them.
  tokens: string[]
  title: string
  body: string
  data?: Record<string, string>
}

// ─── Enqueue ─────────────────────────────────────────────────────────────────

type TxClient = Prisma.TransactionClient | typeof prisma

export async function enqueueEmail(
  schoolId: string,
  payload: EmailPayload,
  client: TxClient = prisma,
): Promise<void> {
  await client.outboxEntry.create({
    data: {
      schoolId,
      kind: 'EMAIL',
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  })
}

export async function enqueuePush(
  schoolId: string,
  payload: PushPayload,
  client: TxClient = prisma,
): Promise<void> {
  if (payload.tokens.length === 0) return
  await client.outboxEntry.create({
    data: {
      schoolId,
      kind: 'PUSH',
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  })
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

async function dispatch(kind: 'EMAIL' | 'PUSH', payload: unknown): Promise<void> {
  if (kind === 'EMAIL') {
    const p = payload as EmailPayload
    const ok = await sendEmail({ to: p.to, subject: p.subject, html: p.html, text: p.text })
    if (!ok) throw new Error('sendEmail returned false')
    return
  }
  if (kind === 'PUSH') {
    const p = payload as PushPayload
    const result = await sendPushNotification(p.tokens, {
      title: p.title,
      body: p.body,
      data: p.data,
    })
    if (result.failedTokens.length > 0) {
      // Clean up dead device tokens — they're worth removing even on partial
      // success, since they'll keep failing forever otherwise.
      await removeInvalidTokens(result.failedTokens).catch(err => {
        logger.warn({ err }, 'outbox: removeInvalidTokens failed')
      })
    }
    // We don't throw on partial failure — some recipients got it, which is
    // good enough. Total failure is when FCM itself throws.
    return
  }
  throw new Error(`Unknown outbox kind: ${kind}`)
}

// ─── Worker ──────────────────────────────────────────────────────────────────

/**
 * Drain a batch of pending outbox entries. Picks rows that are due
 * (`status = PENDING and runAfter <= now()`), locking them with FOR UPDATE
 * SKIP LOCKED so concurrent workers don't double-process. Designed to be
 * called on a fixed interval — see index.ts.
 */
export async function drainOutbox(): Promise<{ processed: number; failed: number }> {
  let processed = 0
  let failed = 0

  // Single transaction picks + claims a batch. We then dispatch outside the
  // transaction so a slow provider doesn't hold row locks.
  const claimed = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{
      id: string
      kind: 'EMAIL' | 'PUSH'
      payload: unknown
      attempts: number
    }>>`
      SELECT id, kind, payload, attempts
      FROM "OutboxEntry"
      WHERE status = 'PENDING' AND "runAfter" <= NOW()
      ORDER BY "runAfter" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `
    if (rows.length === 0) return []

    // Re-stamp runAfter so a worker that crashes mid-dispatch doesn't leave
    // the row picked-up-but-never-finished forever — the next worker will
    // see it again after a short cooldown.
    const ids = rows.map(r => r.id)
    await tx.$executeRaw`
      UPDATE "OutboxEntry"
      SET "runAfter" = NOW() + INTERVAL '2 minutes', "updatedAt" = NOW()
      WHERE id = ANY(${ids})
    `
    return rows
  })

  for (const row of claimed) {
    try {
      await dispatch(row.kind, row.payload)
      await prisma.outboxEntry.update({
        where: { id: row.id },
        data: {
          status: OutboxStatus.SENT,
          sentAt: new Date(),
          attempts: row.attempts + 1,
          lastError: null,
        },
      })
      processed++
    } catch (err) {
      failed++
      const nextAttempt = row.attempts + 1
      const giveUp = nextAttempt >= MAX_ATTEMPTS
      const backoffMin = BACKOFF_MINUTES[Math.min(nextAttempt - 1, BACKOFF_MINUTES.length - 1)]
      const errorMsg = err instanceof Error ? err.message : String(err)

      await prisma.outboxEntry.update({
        where: { id: row.id },
        data: giveUp
          ? {
              status: OutboxStatus.FAILED,
              attempts: nextAttempt,
              lastError: errorMsg,
              failedAt: new Date(),
            }
          : {
              attempts: nextAttempt,
              lastError: errorMsg,
              runAfter: new Date(Date.now() + backoffMin * 60_000),
            },
      })

      if (giveUp) {
        logger.error(
          { outboxId: row.id, kind: row.kind, attempts: nextAttempt, err },
          'outbox entry permanently failed',
        )
        captureException(err, {
          source: 'outbox',
          outboxId: row.id,
          kind: row.kind,
          attempts: nextAttempt,
        })
      } else {
        logger.warn(
          { outboxId: row.id, kind: row.kind, attempts: nextAttempt, backoffMin, err },
          'outbox entry retrying after backoff',
        )
      }
    }
  }

  if (processed > 0 || failed > 0) {
    logger.info({ processed, failed }, 'outbox drained')
  }

  return { processed, failed }
}
