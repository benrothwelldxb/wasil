import { Request } from 'express'
import prisma from './prisma.js'
import { AuditAction, AuditResourceType } from '@prisma/client'

interface LogAuditParams {
  req: Request
  action: AuditAction
  resourceType: AuditResourceType
  resourceId: string
  metadata?: Record<string, unknown>
}

export async function logAudit({ req, action, resourceType, resourceId, metadata }: LogAuditParams): Promise<void> {
  try {
    const user = req.user!
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || null

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action,
        resourceType,
        resourceId,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        schoolId: user.schoolId,
        ipAddress,
      },
    })
  } catch (error) {
    console.error('Failed to create audit log:', error)
  }
}
