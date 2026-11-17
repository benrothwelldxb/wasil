import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Tapping a search result must open that result.
 *
 * A parent's post and form results all pointed at "/", the home page, where a
 * post more than a few days old is not even shown, so search looked broken
 * ("I search, I tap it, nothing"). Each now carries a link to the thing itself.
 */
const role = vi.hoisted(() => ({ value: 'PARENT' }))
const prismaMock = {
  message: { findMany: vi.fn() },
  event: { findMany: vi.fn() },
  weeklyMessage: { findMany: vi.fn() },
  form: { findMany: vi.fn() },
  knowledgeArticle: { findMany: vi.fn() },
  student: { findMany: vi.fn(async () => []) },
  user: { findMany: vi.fn(async () => []) },
  class: { findMany: vi.fn(async () => []) },
  studentGroupLink: { findMany: vi.fn(async () => []) },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => { req.user = { id: 'u-1', schoolId: 's-1', role: role.value }; next() },
  loadUserWithRelations: vi.fn(async () => ({ children: [], studentLinks: [] })),
}))

const { default: searchRoutes } = await import('../src/routes/search')
const search = () => request(express().use('/api/search', searchRoutes)).get('/api/search?q=trip')

const D = new Date('2026-11-10T08:00:00Z')
beforeEach(() => {
  vi.clearAllMocks()
  role.value = 'PARENT'
  prismaMock.message.findMany.mockResolvedValue([
    { id: 'm-feed', title: 'Trip letter', targetClass: 'Year 3', createdAt: D, channel: 'FEED' },
    { id: 'm-notice', title: 'Trip notice', targetClass: 'Whole School', createdAt: D, channel: 'NOTICE' },
  ])
  prismaMock.event.findMany.mockResolvedValue([{ id: 'e-1', title: 'Trip day', date: D, location: null }])
  prismaMock.weeklyMessage.findMany.mockResolvedValue([{ id: 'w-1', title: 'Trips', weekOf: D }])
  prismaMock.form.findMany.mockResolvedValue([{ id: 'f-1', title: 'Trip consent', status: 'ACTIVE', createdAt: D }])
  prismaMock.knowledgeArticle.findMany.mockResolvedValue([{ id: 'a-1', title: 'Trips policy', category: { name: 'Trips' } }])
})

describe('a parent tapping a search result', () => {
  it('opens the thing itself, never the home page', async () => {
    const routes = Object.fromEntries((await search()).body.results.map((r: any) => [r.id, r.route]))
    expect(routes).toEqual({
      'm-feed': '/posts?open=m-feed',
      'm-notice': '/admin-notices',
      'e-1': '/events?open=e-1',
      'w-1': '/principal-updates?open=w-1',
      'f-1': '/posts?form=f-1',
      'a-1': '/resources?open=a-1',
    })
  })
})

describe('staff search', () => {
  it('keeps its own admin pages', async () => {
    role.value = 'STAFF'
    const routes = Object.fromEntries((await search()).body.results.map((r: any) => [r.id, r.route]))
    expect(routes['m-feed']).toBe('/messages')
    expect(routes['f-1']).toBe('/forms')
    expect(routes['e-1']).toBe('/events')
  })
})
