import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { Prisma } from '@prisma/client'

/**
 * PATCH /api/school-settings — the parent bottom bar.
 *
 * The settings page PATCHes the whole settings object on every save, so
 * `bottomNavItems` is in the body every time, including as `null` for a school
 * that has never customised its bar. Prisma will not take a bare null for a
 * nullable Json column, and `data` being Record<string, unknown> meant the
 * compiler never caught it — so that case threw at runtime and took the entire
 * save down with it.
 */
const prismaMock = {
  school: { findUnique: vi.fn(), update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/middleware/auth', () => {
  const asAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'u-1', schoolId: 'school-1', role: 'ADMIN' }
    next()
  }
  return { isAuthenticated: asAdmin, isAdmin: asAdmin }
})

const { default: settingsRoutes } = await import('../src/routes/schoolSettings')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/school-settings', settingsRoutes)
  return app
}
const written = () => prismaMock.school.update.mock.calls[0][0].data

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.school.findUnique.mockResolvedValue({ id: 'school-1' })
  prismaMock.school.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'school-1',
    ...data,
  }))
})

describe('bottomNavItems', () => {
  it('saves the three chosen destinations, in order', async () => {
    const res = await request(makeApp())
      .patch('/api/school-settings')
      .send({ bottomNavItems: ['messages', 'clubs', 'timetable'] })

    expect(res.status).toBe(200)
    expect(written().bottomNavItems).toEqual(['messages', 'clubs', 'timetable'])
    expect(res.body.bottomNavItems).toEqual(['messages', 'clubs', 'timetable'])
  })

  // The regression: a bare null is not a valid Json write in Prisma, and this
  // is what every uncustomised school sends on every save.
  it('resets to the default bar with DbNull, not a bare null', async () => {
    const res = await request(makeApp())
      .patch('/api/school-settings')
      .send({ bottomNavItems: null })

    expect(res.status).toBe(200)
    expect(written().bottomNavItems).toBe(Prisma.DbNull)
    expect(written().bottomNavItems).not.toBeNull()
  })

  // Saving anything else must not be collateral damage of the null case.
  it('a module toggle still saves when the bar has never been customised', async () => {
    const res = await request(makeApp())
      .patch('/api/school-settings')
      .send({ inboxEnabled: false, bottomNavItems: null })

    expect(res.status).toBe(200)
    expect(written().inboxEnabled).toBe(false)
  })

  it('an empty array is stored as an empty array, which reads as the default', async () => {
    const res = await request(makeApp()).patch('/api/school-settings').send({ bottomNavItems: [] })
    expect(res.status).toBe(200)
    expect(written().bottomNavItems).toEqual([])
  })

  it('rejects an unknown destination rather than storing junk the bar would drop', async () => {
    const res = await request(makeApp())
      .patch('/api/school-settings')
      .send({ bottomNavItems: ['messages', 'not-a-real-page'] })

    expect(res.status).toBe(400)
    expect(prismaMock.school.update).not.toHaveBeenCalled()
  })

  it('rejects the same destination twice', async () => {
    const res = await request(makeApp())
      .patch('/api/school-settings')
      .send({ bottomNavItems: ['messages', 'messages'] })
    expect(res.status).toBe(400)
  })

  it('rejects more than the three slots the bar has', async () => {
    const res = await request(makeApp())
      .patch('/api/school-settings')
      .send({ bottomNavItems: ['messages', 'clubs', 'timetable', 'events'] })
    expect(res.status).toBe(400)
  })

  it('leaves the bar alone when the field is absent', async () => {
    const res = await request(makeApp()).patch('/api/school-settings').send({ inboxEnabled: true })
    expect(res.status).toBe(200)
    expect(written()).not.toHaveProperty('bottomNavItems')
  })
})
