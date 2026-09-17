import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

/**
 * The gate on who a staff member may post to, now that a post can name several
 * classes at once.
 *
 * This is the half of the multi-class change that could have gone quietly
 * wrong. The middleware checked `req.body.classId` — the singular field — so
 * adding `classIds` without touching it would have left an array as an
 * unguarded route to any class in the school. Nothing would have failed; the
 * post would simply have gone out.
 */

const prismaMock = {
  staffClassAssignment: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { canSendToTarget } = await import('../src/middleware/auth')

function run(role: string, body: Record<string, unknown>) {
  const req = { user: { id: 'u-1', role, schoolId: 'school-1' }, body } as unknown as Request
  const status = vi.fn().mockReturnThis()
  const json = vi.fn()
  const res = { status, json } as unknown as Response
  const next = vi.fn()
  return canSendToTarget(req, res, next).then(() => ({ status, json, next }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // This teacher has Y3 Blue and nothing else.
  prismaMock.staffClassAssignment.findMany.mockResolvedValue([{ classId: 'c-1' }])
})

describe('canSendToTarget with several classes', () => {
  it('lets a teacher post to the classes they are assigned to', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Y3 Blue', classIds: ['c-1'] })
    expect(next).toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
  })

  // The hole this exists to prevent.
  it('refuses a class smuggled in through the array', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Y4 Red', classIds: ['c-elsewhere'] })
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
  })

  // All or nothing: a selection that is partly allowed is refused whole rather
  // than quietly posted to the subset the sender happens to teach — which would
  // look to them like it worked.
  it('refuses the whole selection when one class is not theirs', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Y3 Blue', classIds: ['c-1', 'c-elsewhere'] })
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
  })

  it('still checks the singular field, which existing callers use', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Y4 Red', classId: 'c-elsewhere' })
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
  })

  it('checks both fields together when a caller sends both', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Y3 Blue', classId: 'c-1', classIds: ['c-elsewhere'] })
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
  })

  it('still refuses a staff member the whole school', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Whole School', classIds: [] })
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
  })

  it('lets an admin post anywhere, including several classes', async () => {
    const { next, status } = await run('ADMIN', { targetClass: 'Y3 Blue', classIds: ['c-1', 'c-elsewhere'] })
    expect(next).toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
  })
})
