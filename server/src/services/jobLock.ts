import crypto from 'crypto'
import prisma from './prisma.js'
import logger from './logger.js'

/**
 * Job locking + idempotency for scheduled work.
 *
 * Two distinct concerns this combines:
 *
 *   1. Mutual exclusion (right now): two processes can't run the same job
 *      at the same time. We use Postgres advisory locks via
 *      `pg_try_advisory_lock(key)` — automatically released when the
 *      session ends, so a crashed worker leaves no stuck locks.
 *
 *   2. Per-period idempotency (across runs): a job that has already
 *      completed for a given period must not run again. The JobRun table
 *      has a unique (jobKey, periodKey) constraint, so a second attempt
 *      either races with an in-progress run (handled by 1) or sees the
 *      completed row and bails.
 *
 * Usage:
 *
 *   await withJobLock('attendance-digest', '2026-06-29', async () => {
 *     // ... do the work
 *   })
 */

/**
 * Hash a string into a stable bigint that fits pg_try_advisory_lock(bigint).
 * SHA-256 truncated to 8 bytes (a Postgres bigint). The probability of two
 * different job keys colliding is ~1 in 2^32 for billions of keys, which is
 * fine for our purposes.
 */
function lockKey(jobKey: string): bigint {
  const hash = crypto.createHash('sha256').update(jobKey).digest()
  const buf = hash.subarray(0, 8)
  // Force the high bit off so the result is always a positive bigint
  buf[0] &= 0x7f
  return buf.readBigInt64BE()
}

interface JobLockResult {
  /** True if the job actually ran. False means another process held the lock
   *  or the job had already completed for this period (idempotent skip). */
  ran: boolean
  /** True if the underlying work threw. ran is still true in that case. */
  errored: boolean
}

/**
 * Run `fn` with cross-process mutual exclusion and per-period idempotency.
 *
 * - If another process holds the lock for `jobKey`, returns immediately.
 * - If a JobRun row already exists for `(jobKey, periodKey)`, returns
 *   immediately (idempotent skip).
 * - Otherwise: insert the JobRun row, run `fn`, then mark the JobRun as
 *   completed/succeeded.
 *
 * Failures in `fn` are recorded on the JobRun row and re-raised so the
 * caller's catch / error reporter sees them.
 */
export async function withJobLock(
  jobKey: string,
  periodKey: string,
  fn: () => Promise<void> | void,
): Promise<JobLockResult> {
  const key = lockKey(jobKey)

  // Try to acquire the advisory lock. If false, another process is in this
  // job; we bail quietly.
  const [{ pg_try_advisory_lock }] = await prisma.$queryRaw<
    Array<{ pg_try_advisory_lock: boolean }>
  >`SELECT pg_try_advisory_lock(${key}) AS pg_try_advisory_lock`

  if (!pg_try_advisory_lock) {
    logger.debug({ jobKey, periodKey }, 'job lock not acquired — another worker is running')
    return { ran: false, errored: false }
  }

  try {
    // Idempotency check: if we already completed this period, skip.
    const existing = await prisma.jobRun.findUnique({
      where: { jobKey_periodKey: { jobKey, periodKey } },
      select: { completedAt: true, succeeded: true },
    })
    if (existing?.succeeded && existing.completedAt) {
      logger.debug({ jobKey, periodKey }, 'job already completed for this period')
      return { ran: false, errored: false }
    }

    // Insert (or update an earlier failed run) and mark it started
    const runRow = await prisma.jobRun.upsert({
      where: { jobKey_periodKey: { jobKey, periodKey } },
      create: { jobKey, periodKey, startedAt: new Date() },
      update: { startedAt: new Date(), completedAt: null, succeeded: false, error: null },
      select: { id: true },
    })

    try {
      await fn()
      await prisma.jobRun.update({
        where: { id: runRow.id },
        data: { completedAt: new Date(), succeeded: true },
      })
      return { ran: true, errored: false }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      await prisma.jobRun.update({
        where: { id: runRow.id },
        data: { completedAt: new Date(), succeeded: false, error: errorMsg },
      })
      throw err
    }
  } finally {
    // Release the advisory lock. Crashes here are fine — Postgres drops the
    // lock on session close anyway, but releasing eagerly is cleaner.
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${key})`.catch(() => {})
  }
}
