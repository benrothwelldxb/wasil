import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

// Get all classes (basic - for dropdowns etc)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const classes = await prisma.class.findMany({
      where: { schoolId: user.schoolId },
      include: {
        yearGroup: { select: { id: true, name: true, order: true } },
      },
      orderBy: { name: 'asc' },
    })

    // Sort by yearGroup.order then name
    const sorted = [...classes].sort((a, b) => {
      const aOrder = a.yearGroup?.order ?? 9999
      const bOrder = b.yearGroup?.order ?? 9999
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.name.localeCompare(b.name)
    })

    res.json(sorted.map(c => ({
      id: c.id,
      name: c.name,
      colorBg: c.colorBg,
      colorText: c.colorText,
      schoolId: c.schoolId,
      yearGroupId: c.yearGroupId,
      yearGroup: c.yearGroup,
    })))
  } catch (error) {
    console.error('Error fetching classes:', error)
    res.status(500).json({ error: 'Failed to fetch classes' })
  }
})

// Get all classes with staff and student counts (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const classes = await prisma.class.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: { select: { children: true } },
        assignedStaff: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
        yearGroup: { select: { id: true, name: true, order: true } },
      },
      orderBy: { name: 'asc' },
    })

    // Sort by yearGroup.order then name
    const sorted = [...classes].sort((a, b) => {
      const aOrder = a.yearGroup?.order ?? 9999
      const bOrder = b.yearGroup?.order ?? 9999
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.name.localeCompare(b.name)
    })

    res.json(sorted.map(c => ({
      id: c.id,
      name: c.name,
      colorBg: c.colorBg,
      colorText: c.colorText,
      schoolId: c.schoolId,
      yearGroupId: c.yearGroupId,
      yearGroup: c.yearGroup,
      studentCount: c._count.children,
      assignedStaff: c.assignedStaff.map(a => ({
        id: a.user.id,
        name: a.user.name,
        role: a.user.role,
      })),
    })))
  } catch (error) {
    console.error('Error fetching all classes:', error)
    res.status(500).json({ error: 'Failed to fetch classes' })
  }
})

// Create class (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, colorBg, colorText, staffIds, yearGroupId } = req.body

    const newClass = await prisma.class.create({
      data: {
        name,
        colorBg: colorBg || 'bg-gray-600',
        colorText: colorText || 'text-white',
        schoolId: user.schoolId,
        yearGroupId: yearGroupId || null,
        assignedStaff: staffIds?.length ? {
          create: staffIds.map((userId: string) => ({
            userId,
          })),
        } : undefined,
      },
      include: {
        _count: { select: { children: true } },
        assignedStaff: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
        yearGroup: { select: { id: true, name: true, order: true } },
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'CLASS', resourceId: newClass.id, metadata: { name: newClass.name } })

    res.status(201).json({
      id: newClass.id,
      name: newClass.name,
      colorBg: newClass.colorBg,
      colorText: newClass.colorText,
      schoolId: newClass.schoolId,
      yearGroupId: newClass.yearGroupId,
      yearGroup: newClass.yearGroup,
      studentCount: newClass._count.children,
      assignedStaff: newClass.assignedStaff.map(a => ({
        id: a.user.id,
        name: a.user.name,
        role: a.user.role,
      })),
    })
  } catch (error) {
    console.error('Error creating class:', error)
    res.status(500).json({ error: 'Failed to create class' })
  }
})

// Update class (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { name, colorBg, colorText, staffIds, yearGroupId } = req.body

    // Verify class belongs to user's school
    const existing = await prisma.class.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Class not found' })
    }

    // Update class and staff assignments in a transaction
    const updatedClass = await prisma.$transaction(async (tx) => {
      // Update staff assignments if provided
      if (staffIds !== undefined) {
        await tx.staffClassAssignment.deleteMany({
          where: { classId: id },
        })

        if (staffIds.length > 0) {
          await tx.staffClassAssignment.createMany({
            data: staffIds.map((userId: string) => ({
              userId,
              classId: id,
            })),
          })
        }
      }

      return tx.class.update({
        where: { id },
        data: { name, colorBg, colorText, yearGroupId: yearGroupId !== undefined ? (yearGroupId || null) : undefined },
        include: {
          _count: { select: { children: true } },
          assignedStaff: {
            include: {
              user: { select: { id: true, name: true, role: true } },
            },
          },
          yearGroup: { select: { id: true, name: true, order: true } },
        },
      })
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'CLASS', resourceId: updatedClass.id, metadata: { name: updatedClass.name } })

    res.json({
      id: updatedClass.id,
      name: updatedClass.name,
      colorBg: updatedClass.colorBg,
      colorText: updatedClass.colorText,
      schoolId: updatedClass.schoolId,
      yearGroupId: updatedClass.yearGroupId,
      yearGroup: updatedClass.yearGroup,
      studentCount: updatedClass._count.children,
      assignedStaff: updatedClass.assignedStaff.map(a => ({
        id: a.user.id,
        name: a.user.name,
        role: a.user.role,
      })),
    })
  } catch (error) {
    console.error('Error updating class:', error)
    res.status(500).json({ error: 'Failed to update class' })
  }
})

// Delete class (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify class belongs to user's school
    const existing = await prisma.class.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Class not found' })
    }

    // Check if class has children
    const childCount = await prisma.child.count({
      where: { classId: id },
    })

    if (childCount > 0) {
      return res.status(400).json({ error: 'Cannot delete class with enrolled children' })
    }

    await prisma.class.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'CLASS', resourceId: id, metadata: { name: existing.name } })

    res.json({ message: 'Class deleted successfully' })
  } catch (error) {
    console.error('Error deleting class:', error)
    res.status(500).json({ error: 'Failed to delete class' })
  }
})

export default router
