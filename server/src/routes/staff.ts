import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

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
      avatarUrl: s.avatarUrl,
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
router.post('/', isAdmin, async (req, res) => {
  try {
    const adminUser = req.user!
    const { email, name, role, assignedClassIds } = req.body

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

    res.status(201).json({
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      avatarUrl: staff.avatarUrl,
      assignedClasses: staff.assignedClasses.map(ac => ({
        id: ac.class.id,
        name: ac.class.name,
      })),
      createdAt: staff.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating staff:', error)
    res.status(500).json({ error: 'Failed to create staff member' })
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
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const adminUser = req.user!
    const { id } = req.params
    const { email, name, role, assignedClassIds } = req.body

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

    logAudit({ req, action: 'UPDATE', resourceType: 'STAFF', resourceId: staff.id, metadata: { name: staff.name } })

    res.json({
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
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

export default router
