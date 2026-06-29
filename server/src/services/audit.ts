import { Request } from 'express'
import prisma from './prisma.js'
import { AuditAction, AuditResourceType, Prisma } from '@prisma/client'

interface LogAuditParams {
  req: Request
  action: AuditAction
  resourceType: AuditResourceType
  resourceId: string
  metadata?: Record<string, unknown>
  changes?: Record<string, { from: unknown; to: unknown }> | null
}

export async function logAudit({ req, action, resourceType, resourceId, metadata, changes }: LogAuditParams): Promise<void> {
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
        changes: changes && Object.keys(changes).length > 0 ? JSON.parse(JSON.stringify(changes)) : undefined,
        schoolId: user.schoolId,
        ipAddress,
      },
    })
  } catch (error) {
    console.error('Failed to create audit log:', error)
  }
}

/**
 * Compute a diff between before and after objects.
 * Only includes fields that actually changed.
 * Pass `fields` to limit which fields are compared (omit for all keys from `after`).
 * Skips internal fields like updatedAt, passwordHash, etc.
 */
const SKIP_FIELDS = new Set([
  'updatedAt', 'createdAt', 'passwordHash', 'twoFactorSecret',
  'twoFactorRecoveryCodes', 'exportToken', 'exportTokenCreatedAt',
])

export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[]
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  const keys = fields || Object.keys(after)

  for (const key of keys) {
    if (SKIP_FIELDS.has(key)) continue
    if (!(key in after)) continue

    const oldVal = before[key]
    const newVal = after[key]

    // Normalize for comparison: convert Dates to ISO strings
    const normalizeVal = (v: unknown): unknown => {
      if (v instanceof Date) return v.toISOString()
      if (v === undefined) return null
      return v
    }

    const a = normalizeVal(oldVal)
    const b = normalizeVal(newVal)

    // Deep equality for arrays/objects via JSON
    const aStr = JSON.stringify(a)
    const bStr = JSON.stringify(b)

    if (aStr !== bStr) {
      // Truncate long values for readability
      const truncate = (v: unknown): unknown => {
        if (typeof v === 'string' && v.length > 200) return v.slice(0, 200) + '...'
        if (Array.isArray(v) && v.length > 10) return `[${v.length} items]`
        return v
      }
      changes[key] = { from: truncate(a), to: truncate(b) }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null
}

/**
 * Anonymise audit log rows owned by a soon-to-be-deleted user.
 *
 * The FK is ON DELETE SET NULL so deleting the User won't kill the trail,
 * but we also need to strip the redundant userName field (which carries the
 * person's actual name) for GDPR. Call this BEFORE deleting the User row,
 * ideally in the same transaction so the two writes are atomic.
 */
export async function anonymizeUserAuditLogs(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
): Promise<void> {
  await client.auditLog.updateMany({
    where: { userId },
    data: { userName: '[deleted user]' },
  })
}

/**
 * Delete audit logs older than the retention period (default: 1 year).
 */
const RETENTION_DAYS = 365

export async function cleanupOldAuditLogs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const deleted = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    if (deleted.count > 0) {
      console.log(`[Cleanup] Deleted ${deleted.count} audit logs older than ${RETENTION_DAYS} days`)
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning up old audit logs:', error)
  }
}
