import { Router } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { logAudit, computeChanges } from '../services/audit.js'
import { sendEmail } from '../services/email.js'

const router = Router()

const createStaffSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.enum(['STAFF', 'ADMIN']),
  position: z.string().optional(),
  assignedClassIds: z.array(z.string()).optional(),
})

const updateStaffSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  role: z.enum(['STAFF', 'ADMIN', 'PARENT']).optional(),
  position: z.string().optional(),
  assignedClassIds: z.array(z.string()).optional(),
})

const ADMIN_APP_URL = process.env.ADMIN_APP_URL || process.env.VITE_ADMIN_URL || 'http://localhost:3001'
const MAGIC_LINK_EXPIRY_HOURS = 72 // Staff get 72 hours to set up

async function sendStaffWelcomeEmail(staffEmail: string, staffName: string, schoolName: string, schoolId: string): Promise<boolean> {
  try {
    // Generate a magic link token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_HOURS * 60 * 60 * 1000)

    // Delete any existing login tokens for this email
    await prisma.magicLinkToken.deleteMany({
      where: { email: staffEmail.toLowerCase(), type: 'LOGIN' },
    })

    await prisma.magicLinkToken.create({
      data: {
        token,
        email: staffEmail.toLowerCase(),
        schoolId,
        type: 'LOGIN',
        expiresAt,
      },
    })

    const magicLink = `${ADMIN_APP_URL}/auth/magic?token=${token}`

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #FAF8F6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; border: 1px solid #F0E4E6;">
    <h1 style="color: #2D2225; font-size: 22px; margin: 0 0 8px 0;">${schoolName}</h1>
    <p style="color: #7A6469; font-size: 14px; margin: 0 0 24px 0;">Staff Portal Access</p>

    <p style="color: #2D2225; font-size: 16px; line-height: 24px; margin: 0 0 8px 0;">
      Hello ${staffName},
    </p>
    <p style="color: #4A3A40; font-size: 15px; line-height: 24px; margin: 0 0 24px 0;">
      You've been added as a staff member. Click below to access the admin portal and set up your account.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${magicLink}"
         style="display: inline-block; background-color: #C4506E; color: white; text-decoration: none; padding: 14px 32px; border-radius: 14px; font-weight: 700; font-size: 15px;">
        Access Admin Portal
      </a>
    </div>

    <p style="color: #A8929A; font-size: 13px; line-height: 20px; margin: 24px 0 0 0;">
      This link expires in ${MAGIC_LINK_EXPIRY_HOURS} hours. After signing in, you can set a password via your Google/Microsoft account or use magic links to sign in.
    </p>

    <hr style="border: none; border-top: 1px solid #F0E4E6; margin: 32px 0;">
    <p style="color: #A8929A; font-size: 11px; text-align: center; margin: 0;">Powered by Wasil</p>
  </div>
</body>
</html>`

    const text = `Hello ${staffName},\n\nYou've been added as a staff member at ${schoolName}.\n\nAccess the admin portal: ${magicLink}\n\nThis link expires in ${MAGIC_LINK_EXPIRY_HOURS} hours.`

    return await sendEmail({ to: staffEmail, subject: `You've been added to ${schoolName} - Access your portal`, html, text })
  } catch (error) {
    console.error('Failed to send staff welcome email:', error)
    return false
  }
}

// Get all staff members for the school
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const staff = await prisma.user.findMany({
      where: {
        schoolId: user.schoolId,
        role: { in: ['STAFF', 'ADMIN'] },
      },
      include: {
        assignedClasses: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { name: 'asc' },
      ],
    })

    res.json(staff.map(s => ({
      id: s.id,
      email: s.email,
      name: s.name,
      role: s.role,
      position: s.position,
      avatarUrl: s.avatarUrl,
      hasPassword: !!s.passwordHash,
      twoFactorEnabled: s.twoFactorEnabled,
      lastLoginAt: s.lastLoginAt?.toISOString() || null,
      assignedClasses: s.assignedClasses.map(ac => ({
        id: ac.class.id,
        name: ac.class.name,
      })),
      createdAt: s.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching staff:', error)
    res.status(500).json({ error: 'Failed to fetch staff' })
  }
})

// Create a new staff member
router.post('/', isAdmin, validate(createStaffSchema), async (req, res) => {
  try {
    const adminUser = req.user!
    const { email, name, role, position, assignedClassIds } = req.body

    // Validate role
    if (!['STAFF', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be STAFF or ADMIN' })
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(400).json({ error: 'A user with this email already exists' })
    }

    // Create user with assigned classes
    const staff = await prisma.user.create({
      data: {
        email,
        name,
        role,
        position: position || null,
        schoolId: adminUser.schoolId,
        assignedClasses: assignedClassIds?.length ? {
          create: assignedClassIds.map((classId: string) => ({
            classId,
          })),
        } : undefined,
      },
      include: {
        assignedClasses: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'STAFF', resourceId: staff.id, metadata: { name: staff.name, email: staff.email } })

    // Send welcome email with magic link
    const school = await prisma.school.findUnique({ where: { id: adminUser.schoolId }, select: { name: true } })
    const emailSent = await sendStaffWelcomeEmail(staff.email, staff.name, school?.name || 'School', adminUser.schoolId)

    res.status(201).json({
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      position: staff.position,
      avatarUrl: staff.avatarUrl,
      assignedClasses: staff.assignedClasses.map(ac => ({
        id: ac.class.id,
        name: ac.class.name,
      })),
      emailSent,
      createdAt: staff.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating staff:', error)
    res.status(500).json({ error: 'Failed to create staff member' })
  }
})

// Resend login email to a staff member
router.post('/:id/send-login', isAdmin, async (req, res) => {
  try {
    const adminUser = req.user!
    const { id } = req.params

    const staff = await prisma.user.findFirst({
      where: { id, schoolId: adminUser.schoolId, role: { in: ['STAFF', 'ADMIN'] } },
    })

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' })
    }

    const school = await prisma.school.findUnique({ where: { id: adminUser.schoolId }, select: { name: true } })
    const sent = await sendStaffWelcomeEmail(staff.email, staff.name, school?.name || 'School', adminUser.schoolId)

    if (sent) {
      res.json({ message: `Login email sent to ${staff.email}` })
    } else {
      res.status(500).json({ error: 'Failed to send email. Check email service configuration.' })
    }
  } catch (error) {
    console.error('Error sending staff login email:', error)
    res.status(500).json({ error: 'Failed to send login email' })
  }
})

// Bulk create staff members
router.post('/bulk', isAdmin, async (req, res) => {
  try {
    const adminUser = req.user!
    const { staff: staffList } = req.body as { staff: Array<{ name: string; email: string; role: 'STAFF' | 'ADMIN' }> }

    if (!Array.isArray(staffList) || staffList.length === 0) {
      return res.status(400).json({ error: 'No staff members provided' })
    }

    // Validate all entries
    const errors: string[] = []
    const validStaff: Array<{ name: string; email: string; role: 'STAFF' | 'ADMIN' }> = []

    for (let i = 0; i < staffList.length; i++) {
      const { name, email, role } = staffList[i]

      if (!name?.trim()) {
        errors.push(`Row ${i + 1}: Name is required`)
        continue
      }
      if (!email?.trim()) {
        errors.push(`Row ${i + 1}: Email is required`)
        continue
      }
      if (!['STAFF', 'ADMIN'].includes(role)) {
        errors.push(`Row ${i + 1}: Invalid role`)
        continue
      }

      // Check for duplicate emails in the input
      if (validStaff.some(s => s.email.toLowerCase() === email.toLowerCase())) {
        errors.push(`Row ${i + 1}: Duplicate email in import`)
        continue
      }

      validStaff.push({ name: name.trim(), email: email.trim().toLowerCase(), role })
    }

    // Check for existing emails in database
    const existingEmails = await prisma.user.findMany({
      where: {
        email: { in: validStaff.map(s => s.email) },
      },
      select: { email: true },
    })

    const existingEmailSet = new Set(existingEmails.map(e => e.email.toLowerCase()))
    const toCreate = validStaff.filter(s => {
      if (existingEmailSet.has(s.email.toLowerCase())) {
        errors.push(`${s.email}: User already exists`)
        return false
      }
      return true
    })

    if (toCreate.length === 0) {
      return res.status(400).json({
        error: 'No valid staff members to create',
        details: errors,
      })
    }

    // Create all valid staff members
    const created = await prisma.$transaction(
      toCreate.map(s =>
        prisma.user.create({
          data: {
            name: s.name,
            email: s.email,
            role: s.role,
            schoolId: adminUser.schoolId,
          },
        })
      )
    )

    logAudit({ req, action: 'CREATE', resourceType: 'STAFF', resourceId: 'bulk', metadata: { count: created.length } })

    res.status(201).json({
      created: created.length,
      skipped: staffList.length - created.length,
      errors: errors.length > 0 ? errors : undefined,
      staff: created.map(s => ({
        id: s.id,
        email: s.email,
        name: s.name,
        role: s.role,
      })),
    })
  } catch (error) {
    console.error('Error bulk creating staff:', error)
    res.status(500).json({ error: 'Failed to create staff members' })
  }
})

// Update a staff member
router.put('/:id', isAdmin, validate(updateStaffSchema), async (req, res) => {
  try {
    const adminUser = req.user!
    const { id } = req.params
    const { email, name, role, position, assignedClassIds } = req.body

    // Verify staff belongs to admin's school
    const existing = await prisma.user.findFirst({
      where: { id, schoolId: adminUser.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Staff member not found' })
    }

    // Prevent changing own role (admin can't demote themselves)
    if (id === adminUser.id && role !== existing.role) {
      return res.status(400).json({ error: 'You cannot change your own role' })
    }

    // Validate role
    if (role && !['STAFF', 'ADMIN', 'PARENT'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    // Check email uniqueness if changing
    if (email && email !== existing.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } })
      if (emailExists) {
        return res.status(400).json({ error: 'A user with this email already exists' })
      }
    }

    // Update user and class assignments in a transaction
    const staff = await prisma.$transaction(async (tx) => {
      // Delete existing class assignments if new ones provided
      if (assignedClassIds !== undefined) {
        await tx.staffClassAssignment.deleteMany({
          where: { userId: id },
        })

        // Create new assignments
        if (assignedClassIds.length > 0) {
          await tx.staffClassAssignment.createMany({
            data: assignedClassIds.map((classId: string) => ({
              userId: id,
              classId,
            })),
          })
        }
      }

      // Update user
      return tx.user.update({
        where: { id },
        data: {
          email: email || undefined,
          name: name || undefined,
          role: role || undefined,
          ...(position !== undefined && { position: position || null }),
        },
        include: {
          assignedClasses: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
        },
      })
    })

    const changes = computeChanges(existing as any, staff as any, ['name', 'email', 'role', 'position'])
    logAudit({ req, action: 'UPDATE', resourceType: 'STAFF', resourceId: staff.id, metadata: { name: staff.name }, changes })

    res.json({
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      position: staff.position,
      avatarUrl: staff.avatarUrl,
      assignedClasses: staff.assignedClasses.map(ac => ({
        id: ac.class.id,
        name: ac.class.name,
      })),
      createdAt: staff.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating staff:', error)
    res.status(500).json({ error: 'Failed to update staff member' })
  }
})

// Delete a staff member
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const adminUser = req.user!
    const { id } = req.params

    // Prevent self-deletion
    if (id === adminUser.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' })
    }

    // Verify staff belongs to admin's school
    const existing = await prisma.user.findFirst({
      where: { id, schoolId: adminUser.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Staff member not found' })
    }

    await prisma.user.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'STAFF', resourceId: id, metadata: { name: existing.name, email: existing.email } })

    res.json({ message: 'Staff member deleted successfully' })
  } catch (error) {
    console.error('Error deleting staff:', error)
    res.status(500).json({ error: 'Failed to delete staff member' })
  }
})

// Reset 2FA for a staff member (admin only)
router.post('/:id/reset-2fa', isAdmin, async (req, res) => {
  try {
    const adminUser = req.user!
    const { id } = req.params

    const staff = await prisma.user.findFirst({
      where: { id, schoolId: adminUser.schoolId, role: { in: ['STAFF', 'ADMIN'] } },
    })

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' })
    }

    if (!staff.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is not enabled for this user' })
    }

    await prisma.user.update({
      where: { id },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorRecoveryCodes: null,
        twoFactorSetupAt: null,
      },
    })

    await logAudit({ req, action: 'UPDATE', resourceType: 'STAFF', resourceId: id, metadata: { action: 'reset-2fa', staffName: staff.name } })

    res.json({ message: `2FA has been reset for ${staff.name}` })
  } catch (error) {
    console.error('Error resetting staff 2FA:', error)
    res.status(500).json({ error: 'Failed to reset 2FA' })
  }
})

export default router
