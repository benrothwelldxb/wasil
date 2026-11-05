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
  staffGroupAssignment: { findMany: vi.fn() },
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
  // ...and manages the swimming squad, with canMessage. The query filters on
  // canMessage itself, so a manager without it simply isn't returned.
  prismaMock.staffGroupAssignment.findMany.mockResolvedValue([{ groupId: 'g-1' }])
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

/**
 * Groups were never checked at all: any staff member could post to any group in
 * the school by naming its id, while the canMessage flag an admin set on each of
 * the group's managers was stored and never read.
 */
describe('canSendToTarget with groups', () => {
  it('lets a staff member post to a group they manage with canMessage', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Swimming squad', groupIds: ['g-1'] })
    expect(next).toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    expect(prismaMock.staffGroupAssignment.findMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', canMessage: true, groupId: { in: ['g-1'] } },
      select: { groupId: true },
    })
  })

  it('refuses a group they do not manage', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Choir', groupId: 'g-elsewhere' })
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
  })

  it('refuses the whole selection when one group is not theirs', async () => {
    const { next, status } = await run('STAFF', { targetClass: 'Swimming squad', groupId: 'g-1', groupIds: ['g-elsewhere'] })
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
  })

  it('does not ask about groups when none are named', async () => {
    await run('STAFF', { targetClass: 'Y3 Blue', classIds: ['c-1'] })
    expect(prismaMock.staffGroupAssignment.findMany).not.toHaveBeenCalled()
  })

  it('lets an admin post to any group', async () => {
    const { next } = await run('ADMIN', { targetClass: 'Choir', groupIds: ['g-elsewhere'] })
    expect(next).toHaveBeenCalled()
    expect(prismaMock.staffGroupAssignment.findMany).not.toHaveBeenCalled()
  })
})
