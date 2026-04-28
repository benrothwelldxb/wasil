import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import prisma from '../services/prisma.js'
import { isAuthenticated, isSuperAdmin } from '../middleware/auth.js'
import { logAudit, computeChanges } from '../services/audit.js'

const router = Router()
const SALT_ROUNDS = 12

// GET /api/schools/system-stats - System-wide dashboard stats (must be before /:id)
router.get('/system-stats', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalSchools,
      totalUsers,
      totalStudents,
      totalMessages,
      totalForms,
      schoolsThisMonth,
      parentCount,
    ] = await Promise.all([
      prisma.school.count({ where: { archived: false } }),
      prisma.user.count(),
      prisma.student.count(),
      prisma.message.count(),
      prisma.form.count(),
      prisma.school.count({ where: { archived: false, createdAt: { gte: startOfMonth } } }),
      prisma.user.count({ where: { role: 'PARENT' } }),
    ])

    // Messages in last 30 days
    const messagesThisMonth = await prisma.message.count({
      where: { createdAt: { gte: startOfMonth } },
    })

    // Most active schools by message count in last 30 days
    const activeSchools = await prisma.message.groupBy({
      by: ['schoolId'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    })

    const schoolIds = activeSchools.map(s => s.schoolId)
    const schoolNames = schoolIds.length > 0
      ? await prisma.school.findMany({
          where: { id: { in: schoolIds } },
          select: { id: true, name: true },
        })
      : []

    const mostActiveSchools = activeSchools.map(s => {
      const school = schoolNames.find(sn => sn.id === s.schoolId)
      return { schoolId: s.schoolId, name: school?.name || 'Unknown', messageCount: s._count.id }
    })

    res.json({
      totalSchools,
      totalUsers,
      totalParents: parentCount,
      totalStudents,
      totalMessages,
      totalForms,
      messagesThisMonth,
      schoolsThisMonth,
      mostActiveSchools,
    })
  } catch (error) {
    console.error('Error fetching system stats:', error)
    res.status(500).json({ error: 'Failed to fetch system stats' })
  }
})

// GET /api/schools - List all schools (SUPER_ADMIN only)
router.get('/', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true'

    const schools = await prisma.school.findMany({
      where: includeArchived ? {} : { archived: false },
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
        paymentUrl: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            students: true,
            classes: true,
            messages: true,
          },
        },
      },
    })

    // Enrich with role-specific counts
    const enrichedSchools = await Promise.all(
      schools.map(async (school) => {
        const [parentCount, staffCount] = await Promise.all([
          prisma.user.count({ where: { schoolId: school.id, role: 'PARENT' } }),
          prisma.user.count({ where: { schoolId: school.id, role: { in: ['STAFF', 'ADMIN'] } } }),
        ])
        return { ...school, parentCount, staffCount }
      })
    )

    res.json(enrichedSchools)
  } catch (error) {
    console.error('Error fetching schools:', error)
    res.status(500).json({ error: 'Failed to fetch schools' })
  }
})

// POST /api/schools - Create a new school
router.post('/', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { name, shortName, city, academicYear, brandColor, accentColor, tagline, logoUrl, logoIconUrl, paymentUrl } = req.body

    if (!name) {
      return res.status(400).json({ error: 'School name is required' })
    }

    const school = await prisma.school.create({
      data: {
        name,
        shortName: shortName || name.split(' ').map((w: string) => w[0]).join('').toUpperCase(),
        city: city || '',
        academicYear: academicYear || '2025/26',
        brandColor: brandColor || '#7f0029',
        accentColor: accentColor || '#D4AF37',
        tagline: tagline || undefined,
        logoUrl: logoUrl || undefined,
        logoIconUrl: logoIconUrl || undefined,
        paymentUrl: paymentUrl || undefined,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'SCHOOL', resourceId: school.id, metadata: { name: school.name } })

    res.status(201).json(school)
  } catch (error) {
    console.error('Error creating school:', error)
    res.status(500).json({ error: 'Failed to create school' })
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
        paymentUrl: true,
        archived: true,
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

// GET /api/schools/:id/stats - Detailed stats for a school
router.get('/:id/stats', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const school = await prisma.school.findUnique({ where: { id } })
    if (!school) {
      return res.status(404).json({ error: 'School not found' })
    }

    const [
      parentCount,
      staffCount,
      adminCount,
      studentCount,
      classCount,
      messageCount,
      formCount,
      ecaTermCount,
    ] = await Promise.all([
      prisma.user.count({ where: { schoolId: id, role: 'PARENT' } }),
      prisma.user.count({ where: { schoolId: id, role: 'STAFF' } }),
      prisma.user.count({ where: { schoolId: id, role: 'ADMIN' } }),
      prisma.student.count({ where: { schoolId: id } }),
      prisma.class.count({ where: { schoolId: id } }),
      prisma.message.count({ where: { schoolId: id } }),
      prisma.form.count({ where: { schoolId: id } }),
      prisma.ecaTerm.count({ where: { schoolId: id } }),
    ])

    // Active ECA allocations
    const activeAllocations = await prisma.ecaAllocation.count({
      where: {
        ecaTerm: { schoolId: id },
        status: 'CONFIRMED',
      },
    })

    // Latest activity (most recent audit log)
    const latestActivity = await prisma.auditLog.findFirst({
      where: { schoolId: id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })

    // Recent audit logs (last 5)
    const recentAuditLogs = await prisma.auditLog.findMany({
      where: { schoolId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        userName: true,
        action: true,
        resourceType: true,
        resourceId: true,
        metadata: true,
        createdAt: true,
      },
    })

    res.json({
      parentCount,
      staffCount,
      adminCount,
      studentCount,
      classCount,
      messageCount,
      formCount,
      ecaTermCount,
      activeAllocations,
      latestActivity: latestActivity?.createdAt || null,
      recentAuditLogs,
    })
  } catch (error) {
    console.error('Error fetching school stats:', error)
    res.status(500).json({ error: 'Failed to fetch school stats' })
  }
})

// PATCH /api/schools/:id/branding - Update school branding
router.patch('/:id/branding', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { brandColor, accentColor, tagline, logoUrl, logoIconUrl, name, shortName, city, paymentUrl, academicYear, principalName, principalTitle } = req.body

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
    if (paymentUrl !== undefined) updateData.paymentUrl = paymentUrl
    if (academicYear !== undefined) updateData.academicYear = academicYear
    if (principalName !== undefined) updateData.principalName = principalName
    if (principalTitle !== undefined) updateData.principalTitle = principalTitle

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
        paymentUrl: true,
        principalName: true,
        principalTitle: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const changes = computeChanges(existingSchool as any, school as any, ['name', 'shortName', 'brandColor', 'accentColor', 'tagline', 'principalName', 'principalTitle', 'paymentUrl', 'academicYear'])
    logAudit({ req, action: 'UPDATE', resourceType: 'SCHOOL', resourceId: id, metadata: { name: school.name }, changes })

    res.json(school)
  } catch (error) {
    console.error('Error updating school branding:', error)
    res.status(500).json({ error: 'Failed to update school branding' })
  }
})

// DELETE /api/schools/:id - Soft delete (archive) a school
router.delete('/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const school = await prisma.school.findUnique({ where: { id } })
    if (!school) {
      return res.status(404).json({ error: 'School not found' })
    }

    await prisma.school.update({
      where: { id },
      data: { archived: true },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'SCHOOL', resourceId: id, metadata: { name: school.name, action: 'archived' } })

    res.json({ success: true, message: 'School archived successfully' })
  } catch (error) {
    console.error('Error archiving school:', error)
    res.status(500).json({ error: 'Failed to archive school' })
  }
})

// POST /api/schools/:id/admins - Create an admin user for a school
router.post('/:id/admins', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { email, name, role } = req.body

    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' })
    }

    const school = await prisma.school.findUnique({ where: { id } })
    if (!school) {
      return res.status(404).json({ error: 'School not found' })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' })
    }

    // Generate a random temporary password
    const tempPassword = crypto.randomBytes(12).toString('base64url')
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS)

    const userRole = (role === 'STAFF') ? 'STAFF' : 'ADMIN'

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        role: userRole,
        schoolId: id,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        schoolId: true,
        createdAt: true,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'STAFF', resourceId: user.id, metadata: { name: user.name, email: user.email, role: userRole, schoolName: school.name } })

    res.status(201).json({
      ...user,
      tempPassword,
      note: 'User can use "forgot password" to set their own password',
    })
  } catch (error) {
    console.error('Error creating admin user:', error)
    res.status(500).json({ error: 'Failed to create admin user' })
  }
})

// GET /api/schools/:id/users - List all users for a school
router.get('/:id/users', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { role } = req.query

    const school = await prisma.school.findUnique({ where: { id } })
    if (!school) {
      return res.status(404).json({ error: 'School not found' })
    }

    const where: any = { schoolId: id }
    if (role && typeof role === 'string') {
      where.role = role.toUpperCase()
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.json(users)
  } catch (error) {
    console.error('Error fetching school users:', error)
    res.status(500).json({ error: 'Failed to fetch school users' })
  }
})

// DELETE /api/schools/:id/users/:userId - Remove a user from a school
router.delete('/:id/users/:userId', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { id, userId } = req.params

    const user = await prisma.user.findFirst({
      where: { id: userId, schoolId: id },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found in this school' })
    }

    if (user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot remove a SUPER_ADMIN user' })
    }

    await prisma.user.delete({ where: { id: userId } })

    logAudit({ req, action: 'DELETE', resourceType: 'STAFF', resourceId: userId, metadata: { name: user.name, email: user.email, role: user.role } })

    res.json({ success: true, message: 'User removed successfully' })
  } catch (error) {
    console.error('Error removing user:', error)
    res.status(500).json({ error: 'Failed to remove user' })
  }
})

export default router
