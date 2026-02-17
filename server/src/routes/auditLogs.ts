import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'
import { AuditAction, AuditResourceType } from '@prisma/client'

const router = Router()

// Get audit logs (admin only)
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { action, resourceType, userId, startDate, endDate, page = '1', limit = '50' } = req.query

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50))
    const skip = (pageNum - 1) * limitNum

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }

    if (action && Object.values(AuditAction).includes(action as AuditAction)) {
      where.action = action
    }

    if (resourceType && Object.values(AuditResourceType).includes(resourceType as AuditResourceType)) {
      where.resourceType = resourceType
    }

    if (userId) {
      where.userId = userId
    }

    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {}
      if (startDate) createdAt.gte = new Date(startDate as string)
      if (endDate) createdAt.lte = new Date(endDate as string)
      where.createdAt = createdAt
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.auditLog.count({ where }),
    ])

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        userId: log.userId,
        userName: log.userName,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        metadata: log.metadata,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    res.status(500).json({ error: 'Failed to fetch audit logs' })
  }
})

export default router
