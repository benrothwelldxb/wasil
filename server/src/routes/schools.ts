import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

// Middleware to check if user is SUPER_ADMIN
function isSuperAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Access denied. SUPER_ADMIN role required.' })
  }
  next()
}

// GET /api/schools - List all schools (SUPER_ADMIN only)
router.get('/', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const schools = await prisma.school.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        academicYear: true,
        brandColor: true,
        accentColor: true,
        tagline: true,
        logoUrl: true,
        logoIconUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { users: true },
        },
      },
    })

    res.json(schools)
  } catch (error) {
    console.error('Error fetching schools:', error)
    res.status(500).json({ error: 'Failed to fetch schools' })
  }
})

// GET /api/schools/:id - Get single school details
router.get('/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const school = await prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        academicYear: true,
        brandColor: true,
        accentColor: true,
        tagline: true,
        logoUrl: true,
        logoIconUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { users: true },
        },
      },
    })

    if (!school) {
      return res.status(404).json({ error: 'School not found' })
    }

    res.json(school)
  } catch (error) {
    console.error('Error fetching school:', error)
    res.status(500).json({ error: 'Failed to fetch school' })
  }
})

// PATCH /api/schools/:id/branding - Update school branding
router.patch('/:id/branding', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { brandColor, accentColor, tagline, logoUrl, logoIconUrl, name, shortName, city } = req.body

    // Check if school exists
    const existingSchool = await prisma.school.findUnique({
      where: { id },
    })

    if (!existingSchool) {
      return res.status(404).json({ error: 'School not found' })
    }

    // Build update data - only include fields that were provided
    const updateData: any = {}
    if (brandColor !== undefined) updateData.brandColor = brandColor
    if (accentColor !== undefined) updateData.accentColor = accentColor
    if (tagline !== undefined) updateData.tagline = tagline
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl
    if (logoIconUrl !== undefined) updateData.logoIconUrl = logoIconUrl
    if (name !== undefined) updateData.name = name
    if (shortName !== undefined) updateData.shortName = shortName
    if (city !== undefined) updateData.city = city

    const school = await prisma.school.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        academicYear: true,
        brandColor: true,
        accentColor: true,
        tagline: true,
        logoUrl: true,
        logoIconUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'SCHOOL', resourceId: id, metadata: { name: school.name } })

    res.json(school)
  } catch (error) {
    console.error('Error updating school branding:', error)
    res.status(500).json({ error: 'Failed to update school branding' })
  }
})

export default router
