import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = {
  $queryRaw: vi.fn(),
  jobRun: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
}
const prismaMock = {
  // Interactive transaction: run the callback with our tx stub.
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { withJobLock } = await import('../src/services/jobLock')

beforeEach(() => {
  vi.clearAllMocks()
  tx.jobRun.update.mockResolvedValue({})
})

// Guards R1: the advisory lock must be transaction-scoped and mutual exclusion
// must actually prevent a second worker from running the job body.
describe('withJobLock (R1 job-lock guardrail)', () => {
  it('uses the transaction-scoped advisory lock, not the session-scoped one', async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: true }])
    tx.jobRun.findUnique.mockResolvedValue(null)
    tx.jobRun.upsert.mockResolvedValue({ id: 'run-1' })

    await withJobLock('digest', '2026-07-17', vi.fn().mockResolvedValue(undefined))

    const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join('')
    expect(sql).toContain('pg_try_advisory_xact_lock')
    expect(sql).not.toContain('pg_advisory_unlock') // no manual unlock on a 2nd connection
  })

  it('does not run the job body when another worker holds the lock', async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: false }])
    const fn = vi.fn()
    const res = await withJobLock('digest', '2026-07-17', fn)
    expect(fn).not.toHaveBeenCalled()
    expect(res).toEqual({ ran: false, errored: false })
  })

  it('runs the job body once and records success', async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: true }])
    tx.jobRun.findUnique.mockResolvedValue(null)
    tx.jobRun.upsert.mockResolvedValue({ id: 'run-1' })
    const fn = vi.fn().mockResolvedValue(undefined)

    const res = await withJobLock('digest', '2026-07-17', fn)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(res.ran).toBe(true)
    expect(tx.jobRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ succeeded: true }) }),
    )
  })

  it('skips the job body when the period already completed (idempotent)', async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: true }])
    tx.jobRun.findUnique.mockResolvedValue({ completedAt: new Date(), succeeded: true })
    const fn = vi.fn()
    const res = await withJobLock('digest', '2026-07-17', fn)
    expect(fn).not.toHaveBeenCalled()
    expect(res.ran).toBe(false)
  })

  it('records the failure and re-raises when the job body throws', async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: true }])
    tx.jobRun.findUnique.mockResolvedValue(null)
    tx.jobRun.upsert.mockResolvedValue({ id: 'run-1' })
    const fn = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(withJobLock('digest', '2026-07-17', fn)).rejects.toThrow('boom')
    expect(tx.jobRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ succeeded: false, error: 'boom' }) }),
    )
  })
})
