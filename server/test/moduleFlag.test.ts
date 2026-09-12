import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A module flag on a cross-app integration has to close the ROUTE, not just
 * hide the menu item.
 *
 * Connect's other module flags are a navigation concern: the parent app hides a
 * link and the route behind it keeps answering. That is a reasonable trade for
 * a Connect-owned feature, where the data is the school's own either way. It is
 * not a reasonable trade for a feature that reads ANOTHER app's data — "off"
 * there has to mean the data does not reach this app, and a hidden link is not
 * an off switch.
 */
const prismaMock = { school: { findUnique: vi.fn() } }
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { requireModule } = await import('../src/middleware/moduleFlag')

let reached = false
function makeApp() {
  reached = false
  const app = express()
  app.get(
    '/gated',
    (req: any, _res, next) => { req.user = { id: 'u-1', schoolId: 'sch-1' }; next() },
    requireModule('activeScheduleEnabled'),
    (_q, res) => { reached = true; res.json({ ok: true }) },
  )
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('requireModule', () => {
  it('lets the request through when the school has the module on', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ activeScheduleEnabled: true })
    const res = await request(makeApp()).get('/gated')
    expect(res.status).toBe(200)
    expect(reached).toBe(true)
  })

  // The property that makes this an off switch rather than a hidden link: the
  // handler never runs, so nothing is read and nothing leaves Connect.
  it('404s when off, and the handler never runs', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ activeScheduleEnabled: false })
    const res = await request(makeApp()).get('/gated')
    expect(res.status).toBe(404)
    expect(reached).toBe(false)
  })

  // 404 rather than 403: a module a school doesn't have is not a permission
  // they lack, it's a feature that isn't there — a stale bookmark should read
  // the same as a wrong URL.
  it('404s rather than 403s', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ activeScheduleEnabled: false })
    const res = await request(makeApp()).get('/gated')
    expect(res.body).toEqual({ error: 'not_found' })
  })

  it('404s when the school cannot be loaded at all', async () => {
    prismaMock.school.findUnique.mockResolvedValue(null)
    expect((await request(makeApp()).get('/gated')).status).toBe(404)
    expect(reached).toBe(false)
  })

  // Anything other than an explicit true is off. A flag that arrives undefined
  // — a column not selected, a stale client — must not read as permission.
  it('treats a missing flag as off, never as on', async () => {
    prismaMock.school.findUnique.mockResolvedValue({})
    expect((await request(makeApp()).get('/gated')).status).toBe(404)
  })
})
