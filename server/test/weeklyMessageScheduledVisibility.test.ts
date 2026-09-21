import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A scheduled weekly update is not yet for parents.
 *
 * /current has always filtered on scheduledAt. The LIST never did — so an
 * update written on Thursday and scheduled for Monday was hidden from the
 * dashboard card and sitting in the Principal's Updates list the whole
 * time, readable by every parent in the school.
 *
 * Nothing contradicted the principal's belief that it was held back. The
 * create route deliberately suppresses the notification for a future-dated
 * update, so it went out SILENTLY rather than not at all — which is the worse
 * of the two, because the absence of a notification is what he would take as
 * evidence it had not gone.
 *
 * Found because Desk asked whether `scheduledAt` and a published state were
 * cleanly separable on this model before building against the assumption that
 * they were. They were not.
 */

const prismaMock = {
  weeklyMessage: { findMany: vi.fn(), findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), sendStaffNotification: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn(async (t: string[]) => t) }))
vi.mock('../src/middleware/validate', () => ({
  validate: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}))

let role = 'PARENT'
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'u-1', schoolId: 'sch-1', role, preferredLanguage: 'en',
    }
    next()
  }
  return { isAuthenticated: attach, isStaff: attach, isAdmin: attach, loadUserWithRelations: vi.fn() }
})

const { default: weeklyRoutes } = await import('../src/routes/weeklyMessage')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/weekly-message', weeklyRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  role = 'PARENT'
  prismaMock.weeklyMessage.findMany.mockResolvedValue([])
})

describe('GET /api/weekly-message — who sees a scheduled update', () => {
  it('hides future-scheduled updates from a parent', async () => {
    await request(makeApp()).get('/api/weekly-message')

    const where = prismaMock.weeklyMessage.findMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('sch-1')
    // Either never scheduled, or its moment has passed — the same rule
    // /current applies, rather than a second one that could drift from it.
    expect(where.OR).toHaveLength(2)
    expect(where.OR[0]).toEqual({ scheduledAt: null })
    expect(where.OR[1].scheduledAt.lte).toBeInstanceOf(Date)
  })

  // The admin page badges scheduled updates and would be unusable without
  // them, and the same route serves both audiences.
  it('still shows them to an admin', async () => {
    role = 'ADMIN'

    await request(makeApp()).get('/api/weekly-message')

    const where = prismaMock.weeklyMessage.findMany.mock.calls[0][0].where
    expect(where).toEqual({ schoolId: 'sch-1' })
    expect(where.OR).toBeUndefined()
  })

  it('still shows them to staff', async () => {
    role = 'STAFF'

    await request(makeApp()).get('/api/weekly-message')

    expect(prismaMock.weeklyMessage.findMany.mock.calls[0][0].where.OR).toBeUndefined()
  })

  it('scopes to the school either way', async () => {
    role = 'ADMIN'
    await request(makeApp()).get('/api/weekly-message')
    expect(prismaMock.weeklyMessage.findMany.mock.calls[0][0].where.schoolId).toBe('sch-1')
  })
})
