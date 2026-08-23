import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import prisma from '../services/prisma.js'

// Public, UNAUTHENTICATED tenant branding lookup — the one thing that has to be
// readable before a visitor logs in, so the sign-in page can brand itself to the
// school in the URL (Phase 0 of multi-tenant login). It exposes only cosmetic
// branding fields; nothing sensitive and no list endpoint (lookup by slug only),
// so it can't be used to enumerate schools.
const router = Router()

// Light limiter: this is a public GET, but cap per-IP to blunt scraping/abuse.
const brandingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

// GET /api/public/tenants — every active school with a slug, minimal branding.
// Powers the root school picker and the "how many schools exist" decision (1 →
// auto-redirect, 2+ → show the picker). Only slugged, non-archived schools.
router.get('/tenants', brandingLimiter, async (_req: Request, res: Response) => {
  try {
    const schools = await prisma.school.findMany({
      where: { archived: false, slug: { not: null } },
      select: { slug: true, name: true, shortName: true, city: true, brandColor: true, logoUrl: true },
      orderBy: { name: 'asc' },
    })
    res.set('Cache-Control', 'public, max-age=300')
    res.json(schools)
  } catch (error) {
    console.error('Public tenants list failed:', error)
    res.status(500).json({ error: 'Failed to load schools' })
  }
})

// GET /api/public/tenant/:slug — branding for one school by its URL slug.
router.get('/tenant/:slug', brandingLimiter, async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug.toLowerCase()

    const school = await prisma.school.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        shortName: true,
        city: true,
        brandColor: true,
        accentColor: true,
        logoUrl: true,
        logoIconUrl: true,
        tagline: true,
        archived: true,
      },
    })

    // Treat archived schools as absent — don't brand a login for a school that's
    // been retired. Same 404 as an unknown slug (no existence signal either way).
    if (!school || school.archived) {
      return res.status(404).json({ error: 'Unknown school' })
    }

    const { archived: _archived, ...branding } = school
    // Cacheable at the edge/browser — branding changes rarely.
    res.set('Cache-Control', 'public, max-age=300')
    res.json(branding)
  } catch (error) {
    console.error('Public tenant branding lookup failed:', error)
    res.status(500).json({ error: 'Failed to load school' })
  }
})

export default router
