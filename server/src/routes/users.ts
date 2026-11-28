import { Router } from 'express'
import { currentTermStart, isUaePhone, promptDue, requestContactChange, samePhone } from '../services/contactDetails.js'
import { Role } from '@prisma/client'
import prisma from '../services/prisma.js'
import { isAdmin, isAuthenticated } from '../middleware/auth.js'
import { SUPPORTED_LANGUAGES } from '../services/translation.js'
import { logAudit, computeChanges, anonymizeUserAuditLogs } from '../services/audit.js'
import { removeGuardianAnswers } from '../services/perChildForms.js'

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
    // A guardian's answers on per-child forms go with them, and the other
    // guardian's answer then stands for the child (services/perChildForms).
    await removeGuardianAnswers(id)
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
// Parents are periodically asked whether their phone and email are still
// right — once a term, or every 14 days when the school has no UAE number to
// ring. The rules are in services/contactDetails.ts. Staff/admins are not asked.

function normalisePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^\d+]/g, '')
  // Allow digits + optional leading + with 6-20 chars (covers international)
  if (!/^\+?\d{6,20}$/.test(cleaned)) return null
  return cleaned
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function pendingEmailFor(userId: string): Promise<string | null> {
  const r = await prisma.contactChangeRequest.findFirst({
    where: { userId, field: 'EMAIL', resolvedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { newValue: true },
  })
  return r?.newValue ?? null
}

// GET /me/contact-prompt — should the contact-details prompt be shown?
router.get('/me/contact-prompt', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.json({ needsConfirmation: false, phone: null, email: null, daysOverdue: 0 })
    }

    const now = new Date()
    const [me, school, termStart, pendingEmail] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { phone: true, email: true, phoneConfirmedAt: true },
      }),
      prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { contactConfirmDays: true },
      }),
      currentTermStart(user.schoolId, now),
      pendingEmailFor(user.id),
    ])

    const reason = promptDue({
      now,
      intervalDays: school?.contactConfirmDays ?? 0,
      lastConfirmedAt: me?.phoneConfirmedAt ?? null,
      phone: me?.phone ?? null,
      currentTermStart: termStart,
    })

    res.json({
      needsConfirmation: reason !== null,
      reason,
      phone: me?.phone ?? null,
      // False when the school cannot ring this number as a UAE call (or there
      // is none) — the prompt says so, and comes back every 14 days.
      phoneReachable: isUaePhone(me?.phone ?? null),
      email: me?.email ?? null,
      // An email change the parent asked for that the school hasn't made yet.
      pendingEmail,
      // Kept for older app builds, which read it; nothing new should.
      daysOverdue: 0,
    })
  } catch (error) {
    console.error('Error fetching contact prompt:', error)
    res.status(500).json({ error: 'Failed to load contact prompt' })
  }
})

// POST /me/contact-confirm — parent confirms or corrects their details.
// Body: { phone, email? }. `email` is optional so older app builds, which
// send only the phone, keep working.
router.post('/me/contact-confirm', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Only parents can use this endpoint' })
    }

    const { phone, email } = req.body as { phone?: string; email?: string }
    if (typeof phone !== 'string') {
      return res.status(400).json({ error: 'phone is required' })
    }
    const normalised = normalisePhone(phone)
    if (!normalised) {
      return res.status(400).json({ error: 'Please enter a valid mobile number (digits only, 6–20 characters)' })
    }
    const nextEmail = typeof email === 'string' ? email.trim() : null
    if (nextEmail !== null && !EMAIL_RE.test(nextEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' })
    }

    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true, email: true },
    })
    if (!me) return res.status(404).json({ error: 'User not found' })

    // A new number is used by Connect at once and handed to the office; the
    // Hub sync leaves it alone until the school's records catch up.
    if (!samePhone(me.phone, normalised)) {
      await requestContactChange({
        schoolId: user.schoolId, userId: user.id, field: 'PHONE',
        schoolValue: me.phone, newValue: normalised,
      })
    }
    // A new email is ONLY requested. It is their sign-in; the school changes it.
    if (nextEmail !== null) {
      await requestContactChange({
        schoolId: user.schoolId, userId: user.id, field: 'EMAIL',
        schoolValue: me.email, newValue: nextEmail.toLowerCase(),
      })
    }

    const confirmedAt = new Date()
    await prisma.user.update({
      where: { id: user.id },
      data: { phone: normalised, phoneConfirmedAt: confirmedAt },
    })

    res.json({
      phone: normalised,
      phoneReachable: isUaePhone(normalised),
      pendingEmail: await pendingEmailFor(user.id),
      confirmedAt: confirmedAt.toISOString(),
    })
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
