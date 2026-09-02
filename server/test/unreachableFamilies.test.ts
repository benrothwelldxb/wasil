import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/analytics/unreachable-families
 *
 * The distinction this exists for: a family that deliberately connects one of
 * two guardians is perfectly reachable, and listing the other one as "not
 * activated" buries the families nobody can reach at all. A dead end is a
 * household where NO guardian has ever signed in.
 */
const prismaMock = {
  user: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  refreshToken: { findMany: vi.fn() },
  loginCode: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const activatedParentIds = vi.fn()
vi.mock('../src/services/parentActivation', () => ({ activatedParentIds }))

// The route caches per school for five minutes, and the cache is module-level,
// so every test needs its own school or the first result is served to them all.
let schoolId = 'school-1'
vi.mock('../src/middleware/auth', () => {
  const asAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'admin-1', schoolId, role: 'ADMIN' }
    next()
  }
  return { isAuthenticated: asAdmin, isAdmin: asAdmin }
})

const { default: analyticsRoutes } = await import('../src/routes/analytics')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/analytics', analyticsRoutes)
  return app
}

const guardian = (id: string) => ({ user: { id, name: `Guardian ${id}`, email: `${id}@example.com` } })
const pupil = (id: string, first: string, last: string, guardians: string[]) => ({
  id, firstName: first, lastName: last,
  class: { name: '3A' },
  parentLinks: guardians.map(guardian),
})

let schoolCounter = 0
beforeEach(() => {
  vi.clearAllMocks()
  schoolId = `school-${++schoolCounter}`
  prismaMock.user.findMany.mockResolvedValue([])
  activatedParentIds.mockResolvedValue(new Set<string>())
})

describe('GET /api/analytics/unreachable-families', () => {
  // The whole point: one connected guardian makes the family reachable, and it
  // must not appear on a chase list.
  it('leaves out a family where one of two guardians has connected', async () => {
    prismaMock.student.findMany.mockResolvedValue([pupil('s1', 'Amir', 'Khan', ['g1', 'g2'])])
    activatedParentIds.mockResolvedValue(new Set(['g1']))

    const res = await request(makeApp()).get('/api/analytics/unreachable-families')

    expect(res.status).toBe(200)
    expect(res.body.families).toEqual([])
    expect(res.body.summary).toMatchObject({ unreachableFamilies: 0, totalFamilies: 1 })
  })

  it('lists a family where neither guardian has connected', async () => {
    prismaMock.student.findMany.mockResolvedValue([pupil('s1', 'Amir', 'Khan', ['g1', 'g2'])])

    const res = await request(makeApp()).get('/api/analytics/unreachable-families')

    expect(res.body.families).toHaveLength(1)
    expect(res.body.families[0].guardians.map((g: { userId: string }) => g.userId)).toEqual(['g1', 'g2'])
    expect(res.body.families[0].children[0].studentName).toBe('Amir Khan')
  })

  // Siblings are one family and one phone call, not two rows.
  it('groups siblings who share a guardian set into one family', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Amir', 'Khan', ['g1', 'g2']),
      pupil('s2', 'Sara', 'Khan', ['g2', 'g1']),
    ])

    const res = await request(makeApp()).get('/api/analytics/unreachable-families')

    expect(res.body.families).toHaveLength(1)
    expect(res.body.families[0].children).toHaveLength(2)
    expect(res.body.summary).toMatchObject({ unreachableFamilies: 1, childrenAffected: 2 })
  })

  it('keeps half-siblings with different guardian sets apart', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Amir', 'Khan', ['g1', 'g2']),
      pupil('s2', 'Yousef', 'Khan', ['g1', 'g3']),
    ])

    const res = await request(makeApp()).get('/api/analytics/unreachable-families')
    expect(res.body.families).toHaveLength(2)
  })

  // A different problem with different work behind it: nobody to chase at all.
  it('separates a child with no guardian account from an unconnected family', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Amir', 'Khan', ['g1']),
      pupil('s2', 'Lena', 'Osei', []),
    ])

    const res = await request(makeApp()).get('/api/analytics/unreachable-families')

    expect(res.body.families).toHaveLength(1)
    expect(res.body.noGuardianAccount).toHaveLength(1)
    expect(res.body.noGuardianAccount[0].studentName).toBe('Lena Osei')
    expect(res.body.summary.childrenWithNoGuardianAccount).toBe(1)
    // Not counted as a family — there is no household account to reach.
    expect(res.body.summary.totalFamilies).toBe(1)
  })

  it('excludes Test Students, which would never come off the list', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    await request(makeApp()).get('/api/analytics/unreachable-families')
    expect(prismaMock.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isTest: false, schoolId }) }),
    )
  })

  it('a fully connected school reports nothing to chase', async () => {
    prismaMock.student.findMany.mockResolvedValue([pupil('s1', 'Amir', 'Khan', ['g1'])])
    activatedParentIds.mockResolvedValue(new Set(['g1']))

    const res = await request(makeApp()).get('/api/analytics/unreachable-families')

    expect(res.body).toMatchObject({
      families: [], noGuardianAccount: [],
      summary: { unreachableFamilies: 0, childrenAffected: 0, totalFamilies: 1 },
    })
  })
})
