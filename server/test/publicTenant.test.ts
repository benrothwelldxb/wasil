import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Public branding lookup for the multi-tenant login page. It must: return only
// cosmetic fields by slug, 404 an unknown slug, and 404 an archived school
// (same response as unknown — no existence signal), all without auth.
const prismaMock = {
  school: { findUnique: vi.fn(), findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { default: publicTenantRoutes } = await import('../src/routes/publicTenant')

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/public', publicTenantRoutes)
  return a
}

const VHPS = {
  slug: 'vhpscoa',
  name: 'Victory Heights Primary School',
  shortName: 'VHPS COA',
  city: 'City of Arabia',
  brandColor: '#7f0029',
  accentColor: '#ecd4ac',
  logoUrl: null,
  logoIconUrl: null,
  tagline: 'Belong. Become. Be Anything.',
  archived: false,
}

describe('GET /api/public/tenant/:slug', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns branding for a known slug (and drops the archived flag)', async () => {
    prismaMock.school.findUnique.mockResolvedValue(VHPS)
    const res = await request(app()).get('/api/public/tenant/vhpscoa')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      slug: 'vhpscoa',
      name: 'Victory Heights Primary School',
      shortName: 'VHPS COA',
      city: 'City of Arabia',
      brandColor: '#7f0029',
      accentColor: '#ecd4ac',
      logoUrl: null,
      logoIconUrl: null,
      tagline: 'Belong. Become. Be Anything.',
    })
    expect(res.body).not.toHaveProperty('archived')
  })

  it('lower-cases the slug before lookup', async () => {
    prismaMock.school.findUnique.mockResolvedValue(VHPS)
    await request(app()).get('/api/public/tenant/VHPSCOA')
    expect(prismaMock.school.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'vhpscoa' } }),
    )
  })

  it('404s an unknown slug', async () => {
    prismaMock.school.findUnique.mockResolvedValue(null)
    const res = await request(app()).get('/api/public/tenant/nope')
    expect(res.status).toBe(404)
  })

  it('404s an archived school (no existence signal)', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ ...VHPS, archived: true })
    const res = await request(app()).get('/api/public/tenant/vhpscoa')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/public/tenants', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists active slugged schools (minimal branding) for the picker', async () => {
    prismaMock.school.findMany.mockResolvedValue([
      { slug: 'vhpscoa', name: 'Victory Heights Primary School', shortName: 'VHPS COA', city: 'City of Arabia', brandColor: '#7f0029', logoUrl: null },
    ])
    const res = await request(app()).get('/api/public/tenants')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ slug: 'vhpscoa', brandColor: '#7f0029' })
    // Only active, slugged schools are queried.
    expect(prismaMock.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archived: false, slug: { not: null } } }),
    )
  })
})
