import { Router, Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import prisma from '../services/prisma.js'
import { isAdmin, isAuthenticated, loadUserWithRelations } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

// ==========================================
// API Key Authentication (for Wasil Inclusion)
// ==========================================

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['x-api-key'] as string
  if (!authHeader) {
    return res.status(401).json({ error: 'API key required (X-API-Key header)' })
  }

  const hashedKey = hashApiKey(authHeader)
  const apiKey = await prisma.inclusionApiKey.findUnique({
    where: { key: hashedKey },
    include: { school: { select: { id: true, name: true } } },
  })

  if (!apiKey || !apiKey.isActive) {
    return res.status(401).json({ error: 'Invalid or inactive API key' })
  }

  // Update last used
  await prisma.inclusionApiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  })

  // Attach school context
  ;(req as any).inclusionSchoolId = apiKey.schoolId
  ;(req as any).inclusionSchoolName = apiKey.school.name
  next()
}

// ==========================================
// Admin: Manage API Keys
// ==========================================

// List API keys
router.get('/api-keys', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const keys = await prisma.inclusionApiKey.findMany({
      where: { schoolId: user.schoolId },
      select: {
        id: true,
        label: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(keys.map(k => ({
      ...k,
      lastUsedAt: k.lastUsedAt?.toISOString() || null,
      createdAt: k.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error listing API keys:', error)
    res.status(500).json({ error: 'Failed to list API keys' })
  }
})

// Create API key
router.post('/api-keys', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { label } = req.body

    if (!label) return res.status(400).json({ error: 'Label is required' })

    // Generate a random API key
    const rawKey = `wsl_${crypto.randomBytes(32).toString('hex')}`
    const hashedKey = hashApiKey(rawKey)

    const apiKey = await prisma.inclusionApiKey.create({
      data: {
        schoolId: user.schoolId,
        key: hashedKey,
        label,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'INCLUSION_API_KEY' as any, resourceId: apiKey.id, metadata: { label } })

    // Return the raw key ONCE — it won't be retrievable again
    res.status(201).json({
      id: apiKey.id,
      label: apiKey.label,
      key: rawKey, // Only shown at creation time
      createdAt: apiKey.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating API key:', error)
    res.status(500).json({ error: 'Failed to create API key' })
  }
})

// Revoke API key
router.delete('/api-keys/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.inclusionApiKey.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!existing) return res.status(404).json({ error: 'API key not found' })

    await prisma.inclusionApiKey.update({
      where: { id },
      data: { isActive: false },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'INCLUSION_API_KEY' as any, resourceId: id, metadata: { label: existing.label } })

    res.json({ success: true })
  } catch (error) {
    console.error('Error revoking API key:', error)
    res.status(500).json({ error: 'Failed to revoke API key' })
  }
})

// ==========================================
// Wasil Inclusion API (authenticated by API key)
// ==========================================

// Sync IEP data for a student
router.post('/sync/iep', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const schoolId = (req as any).inclusionSchoolId
    const { externalId, studentId, title, status, targets, reviewDate, keyWorker, notes, parentVisible } = req.body

    if (!title || !targets) {
      return res.status(400).json({ error: 'title and targets are required' })
    }

    // Find student by externalId or studentId
    let student = null
    if (studentId) {
      student = await prisma.student.findFirst({ where: { id: studentId, schoolId } })
    }
    if (!student && externalId) {
      student = await prisma.student.findFirst({ where: { schoolId, externalId } })
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found. Provide valid studentId or externalId.' })
    }

    // Upsert IEP (match by student + title)
    const iep = await prisma.studentIep.upsert({
      where: {
        id: await prisma.studentIep.findFirst({
          where: { studentId: student.id, title },
          select: { id: true },
        }).then(r => r?.id || 'nonexistent'),
      },
      create: {
        studentId: student.id,
        schoolId,
        title,
        status: status || 'ACTIVE',
        targets: JSON.parse(JSON.stringify(targets)),
        reviewDate: reviewDate || null,
        keyWorker: keyWorker || null,
        notes: notes || null,
        parentVisible: parentVisible !== false,
        syncedAt: new Date(),
      },
      update: {
        status: status || undefined,
        targets: JSON.parse(JSON.stringify(targets)),
        reviewDate: reviewDate !== undefined ? reviewDate : undefined,
        keyWorker: keyWorker !== undefined ? keyWorker : undefined,
        notes: notes !== undefined ? notes : undefined,
        parentVisible: parentVisible !== undefined ? parentVisible : undefined,
        syncedAt: new Date(),
      },
    })

    res.json({
      id: iep.id,
      studentId: student.id,
      title: iep.title,
      status: iep.status,
      syncedAt: iep.syncedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error syncing IEP:', error)
    res.status(500).json({ error: 'Failed to sync IEP' })
  }
})

// Bulk sync multiple IEPs
router.post('/sync/ieps', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const schoolId = (req as any).inclusionSchoolId
    const { ieps } = req.body as { ieps: Array<{
      externalId?: string
      studentId?: string
      title: string
      status?: string
      targets: unknown[]
      reviewDate?: string
      keyWorker?: string
      notes?: string
      parentVisible?: boolean
    }> }

    if (!ieps || !Array.isArray(ieps)) {
      return res.status(400).json({ error: 'ieps array is required' })
    }

    // Pre-fetch all students
    const allStudents = await prisma.student.findMany({
      where: { schoolId },
      select: { id: true, externalId: true },
    })
    const byExternalId = new Map(allStudents.filter(s => s.externalId).map(s => [s.externalId!, s]))
    const byId = new Map(allStudents.map(s => [s.id, s]))

    let synced = 0
    let failed = 0
    const errors: string[] = []

    for (const iep of ieps) {
      let student = iep.studentId ? byId.get(iep.studentId) : undefined
      if (!student && iep.externalId) student = byExternalId.get(iep.externalId)

      if (!student) {
        errors.push(`Student not found: ${iep.externalId || iep.studentId}`)
        failed++
        continue
      }

      try {
        const existing = await prisma.studentIep.findFirst({
          where: { studentId: student.id, title: iep.title },
        })

        if (existing) {
          await prisma.studentIep.update({
            where: { id: existing.id },
            data: {
              status: iep.status || undefined,
              targets: JSON.parse(JSON.stringify(iep.targets)),
              reviewDate: iep.reviewDate ?? undefined,
              keyWorker: iep.keyWorker ?? undefined,
              notes: iep.notes ?? undefined,
              parentVisible: iep.parentVisible ?? undefined,
              syncedAt: new Date(),
            },
          })
        } else {
          await prisma.studentIep.create({
            data: {
              studentId: student.id,
              schoolId,
              title: iep.title,
              status: iep.status || 'ACTIVE',
              targets: JSON.parse(JSON.stringify(iep.targets)),
              reviewDate: iep.reviewDate || null,
              keyWorker: iep.keyWorker || null,
              notes: iep.notes || null,
              parentVisible: iep.parentVisible !== false,
              syncedAt: new Date(),
            },
          })
        }
        synced++
      } catch {
        errors.push(`Failed to sync IEP for ${iep.externalId || iep.studentId}: ${iep.title}`)
        failed++
      }
    }

    res.json({ synced, failed, total: ieps.length, errors: errors.length > 0 ? errors : undefined })
  } catch (error) {
    console.error('Error bulk syncing IEPs:', error)
    res.status(500).json({ error: 'Failed to bulk sync IEPs' })
  }
})

// ==========================================
// Parent-facing: View child's IEPs
// ==========================================

router.get('/my-children', isAuthenticated, async (req, res) => {
  try {
    const baseUser = req.user!
    if (baseUser.role !== 'PARENT') return res.status(403).json({ error: 'Parent access required' })
    const user = (await loadUserWithRelations(baseUser.id))!

    // Get student IDs linked to parent
    const studentLinks = user.studentLinks || []
    const studentIds = studentLinks.map(l => l.studentId)

    if (studentIds.length === 0) return res.json([])

    const ieps = await prisma.studentIep.findMany({
      where: {
        studentId: { in: studentIds },
        parentVisible: true,
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
      },
      orderBy: [{ studentId: 'asc' }, { createdAt: 'desc' }],
    })

    res.json(ieps.map(iep => ({
      id: iep.id,
      studentId: iep.studentId,
      studentName: `${iep.student.firstName} ${iep.student.lastName}`,
      className: iep.student.class.name,
      title: iep.title,
      status: iep.status,
      targets: iep.targets,
      reviewDate: iep.reviewDate,
      keyWorker: iep.keyWorker,
      notes: iep.notes,
      syncedAt: iep.syncedAt.toISOString(),
      updatedAt: iep.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching IEPs:', error)
    res.status(500).json({ error: 'Failed to fetch IEPs' })
  }
})

export default router
