import { Router } from 'express'
import { Role } from '@prisma/client'
import prisma from '../services/prisma.js'
import { isAdmin, isAuthenticated } from '../middleware/auth.js'
import { SUPPORTED_LANGUAGES } from '../services/translation.js'
import { logAudit, computeChanges, anonymizeUserAuditLogs } from '../services/audit.js'

const router = Router()

// Roles a caller can assign or take a user to. SUPER_ADMIN is reserved — only
// existing SUPER_ADMINs can grant it or modify other SUPER_ADMINs.
const ADMIN_ASSIGNABLE_ROLES: Role[] = [Role.PARENT, Role.STAFF, Role.ADMIN]

function canAssignRole(callerRole: Role, targetRole: Role): boolean {
  if (callerRole === Role.SUPER_ADMIN) return true
  return ADMIN_ASSIGNABLE_ROLES.includes(targetRole)
}

async function classesAllInSchool(classIds: string[], schoolId: string): Promise<boolean> {
  if (classIds.length === 0) return true
  const count = await prisma.class.count({
    where: { id: { in: classIds }, schoolId },
  })
  return count === classIds.length
}

function serializeUser(u: {
  id: string
  email: string
  name: string
  role: Role
  schoolId: string
  avatarUrl: string | null
  createdAt: Date
  children: Array<{ id: string; name: string; classId: string; class: { name: string } }>
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    schoolId: u.schoolId,
    avatarUrl: u.avatarUrl,
    children: u.children.map(c => ({
      id: c.id,
      name: c.name,
      classId: c.classId,
      className: c.class.name,
    })),
    createdAt: u.createdAt.toISOString(),
  }
}

// Get all users (admin only) — scoped to caller's school
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const users = await prisma.user.findMany({
      where: { schoolId: user.schoolId },
      include: { children: { include: { class: true } } },
      orderBy: { name: 'asc' },
    })

    res.json(users.map(serializeUser))
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Create/invite user (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const admin = req.user!
    const { email, name, role: rawRole, children } = req.body as {
      email: string
      name: string
      role?: Role
      children?: Array<{ name: string; classId: string }>
    }

    if (!email || !name) {
      return res.status(400).json({ error: 'email and name are required' })
    }

    const role: Role = rawRole ?? Role.PARENT
    if (!Object.values(Role).includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }
    if (!canAssignRole(admin.role, role)) {
      return res.status(403).json({ error: 'Cannot assign that role' })
    }

    const childList = children ?? []
    if (childList.length > 0) {
      const classIds = childList.map(c => c.classId)
      if (!(await classesAllInSchool(classIds, admin.schoolId))) {
        return res.status(400).json({ error: 'One or more classes are not in your school' })
      }
    }

    const created = await prisma.$transaction(async tx => {
      const newUser = await tx.user.create({
        data: { email, name, role, schoolId: admin.schoolId },
      })

      if (childList.length > 0) {
        await tx.child.createMany({
          data: childList.map(child => ({
            name: child.name,
            classId: child.classId,
            parentId: newUser.id,
          })),
        })
      }

      return tx.user.findUnique({
        where: { id: newUser.id },
        include: { children: { include: { class: true } } },
      })
    })

    await logAudit({
      req,
      action: 'CREATE',
      resourceType: 'USER',
      resourceId: created!.id,
      metadata: { email: created!.email, role: created!.role },
    })

    res.status(201).json(serializeUser(created!))
  } catch (error) {
    console.error('Error creating user:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Update user (admin only) — scoped to caller's school + role allowlist
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const admin = req.user!
    const { id } = req.params
    const { name, role: rawRole, children } = req.body as {
      name?: string
      role?: Role
      children?: Array<{ name: string; classId: string }>
    }

    // Load existing user scoped to caller's school
    const existing = await prisma.user.findFirst({
      where: { id, schoolId: admin.schoolId },
      include: { children: { include: { class: true } } },
    })
    if (!existing) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Role transitions: validate target role, gate SUPER_ADMIN, prevent
    // SUPER_ADMIN target being modified by non-SUPER_ADMIN.
    let newRole: Role = existing.role
    if (rawRole !== undefined) {
      if (!Object.values(Role).includes(rawRole)) {
        return res.status(400).json({ error: 'Invalid role' })
      }
      if (existing.role === Role.SUPER_ADMIN && admin.role !== Role.SUPER_ADMIN) {
        return res.status(403).json({ error: 'Cannot modify a SUPER_ADMIN' })
      }
      if (!canAssignRole(admin.role, rawRole)) {
        return res.status(403).json({ error: 'Cannot assign that role' })
      }
      newRole = rawRole
    }

    // Validate child classes belong to admin's school
    if (children !== undefined && children.length > 0) {
      const classIds = children.map(c => c.classId)
      if (!(await classesAllInSchool(classIds, admin.schoolId))) {
        return res.status(400).json({ error: 'One or more classes are not in your school' })
      }
    }

    const updated = await prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          role: newRole,
        },
      })

      if (children !== undefined) {
        await tx.child.deleteMany({ where: { parentId: id } })
        if (children.length > 0) {
          await tx.child.createMany({
            data: children.map(child => ({
              name: child.name,
              classId: child.classId,
              parentId: id,
            })),
          })
        }
      }

      return tx.user.findUnique({
        where: { id },
        include: { children: { include: { class: true } } },
      })
    })

    const changes = computeChanges(
      { name: existing.name, role: existing.role },
      { name: updated!.name, role: updated!.role },
    )

    await logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: id,
      changes,
      metadata: { email: existing.email },
    })

    res.json(serializeUser(updated!))
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Delete user (admin only) — scoped to caller's school
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const admin = req.user!
    const { id } = req.params

    const existing = await prisma.user.findFirst({
      where: { id, schoolId: admin.schoolId },
      select: { id: true, email: true, name: true, role: true },
    })
    if (!existing) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (existing.id === admin.id) {
      return res.status(400).json({ error: 'You cannot delete your own account here' })
    }

    if (existing.role === Role.SUPER_ADMIN && admin.role !== Role.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Cannot delete a SUPER_ADMIN' })
    }

    // Anonymise the user's audit trail and delete the user atomically. The
    // FK from AuditLog.userId is ON DELETE SET NULL so the trail itself
    // survives; stripping userName here is the GDPR step.
    await prisma.$transaction(async tx => {
      await anonymizeUserAuditLogs(tx, id)
      await tx.user.delete({ where: { id } })
    })

    await logAudit({
      req,
      action: 'DELETE',
      resourceType: 'USER',
      resourceId: id,
      metadata: { email: existing.email, name: existing.name, role: existing.role },
    })

    res.json({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('Error deleting user:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

// Get supported languages
router.get('/languages', isAuthenticated, async (_req, res) => {
  res.json(SUPPORTED_LANGUAGES)
})

// ─── Contact-details confirmation ────────────────────────────────────────────
// Parents are periodically asked to confirm their mobile number is still
// current. School.contactConfirmDays governs the cadence; 0 disables it.
// Staff/admins don't need this prompt.

function normalisePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^\d+]/g, '')
  // Allow digits + optional leading + with 6-20 chars (covers international)
  if (!/^\+?\d{6,20}$/.test(cleaned)) return null
  return cleaned
}

// GET /me/contact-prompt — should the contact-details modal be shown?
router.get('/me/contact-prompt', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.json({ needsConfirmation: false, phone: null, daysOverdue: 0 })
    }

    const [me, school] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { phone: true, phoneConfirmedAt: true },
      }),
      prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { contactConfirmDays: true },
      }),
    ])

    const intervalDays = school?.contactConfirmDays ?? 0
    if (intervalDays <= 0) {
      return res.json({ needsConfirmation: false, phone: me?.phone ?? null, daysOverdue: 0 })
    }

    const now = Date.now()
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000
    const lastConfirmed = me?.phoneConfirmedAt?.getTime() ?? 0
    const overdue = lastConfirmed === 0 ? true : now - lastConfirmed > intervalMs
    const daysOverdue = lastConfirmed === 0 ? 0 : Math.max(0, Math.floor((now - lastConfirmed - intervalMs) / (24 * 60 * 60 * 1000)))

    res.json({
      needsConfirmation: overdue,
      phone: me?.phone ?? null,
      daysOverdue,
    })
  } catch (error) {
    console.error('Error fetching contact prompt:', error)
    res.status(500).json({ error: 'Failed to load contact prompt' })
  }
})

// POST /me/contact-confirm — parent confirms or updates their number
router.post('/me/contact-confirm', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Only parents can use this endpoint' })
    }

    const { phone } = req.body as { phone?: string }
    if (typeof phone !== 'string') {
      return res.status(400).json({ error: 'phone is required' })
    }
    const normalised = normalisePhone(phone)
    if (!normalised) {
      return res.status(400).json({ error: 'Please enter a valid mobile number (digits only, 6–20 characters)' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { phone: normalised, phoneConfirmedAt: new Date() },
    })

    res.json({ phone: normalised, confirmedAt: new Date().toISOString() })
  } catch (error) {
    console.error('Error confirming contact details:', error)
    res.status(500).json({ error: 'Failed to confirm contact details' })
  }
})

// Update user's language preference
router.patch('/me/language', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { language } = req.body

    const validLanguage = SUPPORTED_LANGUAGES.find(l => l.code === language)
    if (!validLanguage) {
      return res.status(400).json({ error: 'Invalid language code' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { preferredLanguage: language },
    })

    res.json({ language })
  } catch (error) {
    console.error('Error updating language preference:', error)
    res.status(500).json({ error: 'Failed to update language preference' })
  }
})

export default router
