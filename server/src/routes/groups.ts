import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

// Get all groups for school (admin)
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const groups = await prisma.group.findMany({
      where: { schoolId: user.schoolId },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        _count: {
          select: {
            studentMembers: true,
            staffManagers: true,
          },
        },
      },
      orderBy: [
        { category: { order: 'asc' } },
        { name: 'asc' },
      ],
    })

    res.json(groups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      categoryId: g.categoryId,
      category: g.category,
      schoolId: g.schoolId,
      isActive: g.isActive,
      memberCount: g._count.studentMembers,
      staffCount: g._count.staffManagers,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching groups:', error)
    res.status(500).json({ error: 'Failed to fetch groups' })
  }
})

// Get group categories (admin)
router.get('/categories', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const categories = await prisma.groupCategory.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: { select: { groups: true } },
      },
      orderBy: { order: 'asc' },
    })

    res.json(categories.map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      order: c.order,
      groupCount: c._count.groups,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching group categories:', error)
    res.status(500).json({ error: 'Failed to fetch group categories' })
  }
})

// Get single group with member details (admin)
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const group = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        _count: {
          select: {
            studentMembers: true,
            staffManagers: true,
          },
        },
      },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found' })
    }

    res.json({
      id: group.id,
      name: group.name,
      description: group.description,
      categoryId: group.categoryId,
      category: group.category,
      schoolId: group.schoolId,
      isActive: group.isActive,
      memberCount: group._count.studentMembers,
      staffCount: group._count.staffManagers,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching group:', error)
    res.status(500).json({ error: 'Failed to fetch group' })
  }
})

// Get group members (paginated) (admin)
router.get('/:id/members', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { page = '1', limit = '50' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = Math.min(parseInt(limit as string, 10), 100)
    const skip = (pageNum - 1) * limitNum

    // Verify group exists
    const group = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found' })
    }

    const [members, total] = await Promise.all([
      prisma.studentGroupLink.findMany({
        where: { groupId: id },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              class: { select: { id: true, name: true } },
            },
          },
        },
        skip,
        take: limitNum,
        orderBy: { student: { lastName: 'asc' } },
      }),
      prisma.studentGroupLink.count({ where: { groupId: id } }),
    ])

    res.json({
      members: members.map(m => ({
        id: m.id,
        studentId: m.studentId,
        studentName: `${m.student.firstName} ${m.student.lastName}`,
        firstName: m.student.firstName,
        lastName: m.student.lastName,
        classId: m.student.class.id,
        className: m.student.class.name,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Error fetching group members:', error)
    res.status(500).json({ error: 'Failed to fetch group members' })
  }
})

// Get group staff assignments (admin)
router.get('/:id/staff', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify group exists
    const group = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found' })
    }

    const assignments = await prisma.staffGroupAssignment.findMany({
      where: { groupId: id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { user: { name: 'asc' } },
    })

    res.json(assignments.map(a => ({
      id: a.id,
      userId: a.userId,
      userName: a.user.name,
      userEmail: a.user.email,
      userRole: a.user.role,
      canMessage: a.canMessage,
      canManage: a.canManage,
      createdAt: a.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching group staff:', error)
    res.status(500).json({ error: 'Failed to fetch group staff' })
  }
})

// Get groups where parent's children are members (parent)
router.get('/for-parent', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    // Get student IDs from both children (legacy) and studentLinks (new)
    const childClassIds = user.children?.map(c => c.classId) || []
    const studentIds = user.studentLinks?.map(l => l.studentId) || []

    // Get student IDs from legacy children by fetching students in those classes
    // This is a fallback for the old data model
    let allStudentIds = [...studentIds]
    if (childClassIds.length > 0 && studentIds.length === 0) {
      // Legacy support: find students linked to this user
      const students = await prisma.student.findMany({
        where: { classId: { in: childClassIds } },
        select: { id: true },
      })
      // This is an approximation - we can't perfectly match legacy children to students
    }

    if (studentIds.length === 0) {
      return res.json([])
    }

    // Get groups where these students are members
    const groupLinks = await prisma.studentGroupLink.findMany({
      where: { studentId: { in: studentIds } },
      include: {
        group: {
          include: {
            category: { select: { id: true, name: true, icon: true, color: true } },
          },
        },
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Group by group ID to avoid duplicates but keep track of which children are in each
    const groupMap = new Map<string, {
      group: typeof groupLinks[0]['group']
      children: Array<{ studentId: string; studentName: string }>
    }>()

    for (const link of groupLinks) {
      if (!link.group.isActive) continue

      const existing = groupMap.get(link.group.id)
      const childInfo = {
        studentId: link.student.id,
        studentName: `${link.student.firstName} ${link.student.lastName}`,
      }

      if (existing) {
        existing.children.push(childInfo)
      } else {
        groupMap.set(link.group.id, {
          group: link.group,
          children: [childInfo],
        })
      }
    }

    res.json(Array.from(groupMap.values()).map(({ group, children }) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      category: group.category,
      children,
    })))
  } catch (error) {
    console.error('Error fetching parent groups:', error)
    res.status(500).json({ error: 'Failed to fetch groups' })
  }
})

// Create group (admin)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, description, categoryId, isActive = true } = req.body

    const group = await prisma.group.create({
      data: {
        name,
        description: description || null,
        categoryId: categoryId || null,
        schoolId: user.schoolId,
        isActive,
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'GROUP', resourceId: group.id, metadata: { name: group.name } })

    res.status(201).json({
      id: group.id,
      name: group.name,
      description: group.description,
      categoryId: group.categoryId,
      category: group.category,
      schoolId: group.schoolId,
      isActive: group.isActive,
      memberCount: 0,
      staffCount: 0,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A group with this name already exists' })
    }
    console.error('Error creating group:', error)
    res.status(500).json({ error: 'Failed to create group' })
  }
})

// Create category (admin)
router.post('/categories', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, icon, color, order } = req.body

    // Get max order if not specified
    const maxOrder = order ?? (await prisma.groupCategory.aggregate({
      where: { schoolId: user.schoolId },
      _max: { order: true },
    }))._max.order ?? -1

    const category = await prisma.groupCategory.create({
      data: {
        name,
        icon: icon || null,
        color: color || null,
        order: order ?? maxOrder + 1,
        schoolId: user.schoolId,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'GROUP_CATEGORY', resourceId: category.id, metadata: { name: category.name } })

    res.status(201).json({
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      order: category.order,
      groupCount: 0,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A category with this name already exists' })
    }
    console.error('Error creating group category:', error)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// Add students to group (admin)
router.post('/:id/members', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { studentIds, role } = req.body

    // Verify group exists
    const group = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found' })
    }

    // Verify students exist and belong to same school
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId: user.schoolId },
      select: { id: true },
    })

    const validStudentIds = students.map(s => s.id)

    // Create links (skip existing)
    const created = await prisma.studentGroupLink.createMany({
      data: validStudentIds.map(studentId => ({
        studentId,
        groupId: id,
        role: role || null,
      })),
      skipDuplicates: true,
    })

    res.json({ added: created.count })
  } catch (error) {
    console.error('Error adding members to group:', error)
    res.status(500).json({ error: 'Failed to add members' })
  }
})

// Assign staff to group (admin)
router.post('/:id/staff', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { userId, canMessage = true, canManage = false } = req.body

    // Verify group exists
    const group = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found' })
    }

    // Verify user exists and is staff/admin
    const staffUser = await prisma.user.findFirst({
      where: {
        id: userId,
        schoolId: user.schoolId,
        role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },
      },
    })

    if (!staffUser) {
      return res.status(400).json({ error: 'Invalid staff user' })
    }

    const assignment = await prisma.staffGroupAssignment.upsert({
      where: {
        userId_groupId: { userId, groupId: id },
      },
      update: { canMessage, canManage },
      create: {
        userId,
        groupId: id,
        canMessage,
        canManage,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    res.json({
      id: assignment.id,
      userId: assignment.userId,
      userName: assignment.user.name,
      userEmail: assignment.user.email,
      userRole: assignment.user.role,
      canMessage: assignment.canMessage,
      canManage: assignment.canManage,
      createdAt: assignment.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error assigning staff to group:', error)
    res.status(500).json({ error: 'Failed to assign staff' })
  }
})

// Update group (admin)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { name, description, categoryId, isActive } = req.body

    // Verify group exists
    const existing = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Group not found' })
    }

    const group = await prisma.group.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        description: description !== undefined ? (description || null) : existing.description,
        categoryId: categoryId !== undefined ? (categoryId || null) : existing.categoryId,
        isActive: isActive ?? existing.isActive,
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        _count: {
          select: {
            studentMembers: true,
            staffManagers: true,
          },
        },
      },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'GROUP', resourceId: group.id, metadata: { name: group.name } })

    res.json({
      id: group.id,
      name: group.name,
      description: group.description,
      categoryId: group.categoryId,
      category: group.category,
      schoolId: group.schoolId,
      isActive: group.isActive,
      memberCount: group._count.studentMembers,
      staffCount: group._count.staffManagers,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A group with this name already exists' })
    }
    console.error('Error updating group:', error)
    res.status(500).json({ error: 'Failed to update group' })
  }
})

// Update category (admin)
router.put('/categories/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { name, icon, color, order } = req.body

    // Verify category exists
    const existing = await prisma.groupCategory.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Category not found' })
    }

    const category = await prisma.groupCategory.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        icon: icon !== undefined ? (icon || null) : existing.icon,
        color: color !== undefined ? (color || null) : existing.color,
        order: order ?? existing.order,
      },
      include: {
        _count: { select: { groups: true } },
      },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'GROUP_CATEGORY', resourceId: category.id, metadata: { name: category.name } })

    res.json({
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      order: category.order,
      groupCount: category._count.groups,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A category with this name already exists' })
    }
    console.error('Error updating group category:', error)
    res.status(500).json({ error: 'Failed to update category' })
  }
})

// Delete group (admin)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify group exists
    const existing = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Group not found' })
    }

    await prisma.group.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'GROUP', resourceId: id, metadata: { name: existing.name } })

    res.json({ message: 'Group deleted successfully' })
  } catch (error) {
    console.error('Error deleting group:', error)
    res.status(500).json({ error: 'Failed to delete group' })
  }
})

// Delete category (admin)
router.delete('/categories/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify category exists
    const existing = await prisma.groupCategory.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Category not found' })
    }

    // Category deletion will set categoryId to null on groups (due to onDelete: SetNull)
    await prisma.groupCategory.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'GROUP_CATEGORY', resourceId: id, metadata: { name: existing.name } })

    res.json({ message: 'Category deleted successfully' })
  } catch (error) {
    console.error('Error deleting group category:', error)
    res.status(500).json({ error: 'Failed to delete category' })
  }
})

// Remove student from group (admin)
router.delete('/:id/members/:studentId', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, studentId } = req.params

    // Verify group exists
    const group = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found' })
    }

    await prisma.studentGroupLink.deleteMany({
      where: { groupId: id, studentId },
    })

    res.json({ message: 'Member removed successfully' })
  } catch (error) {
    console.error('Error removing member from group:', error)
    res.status(500).json({ error: 'Failed to remove member' })
  }
})

// Remove staff from group (admin)
router.delete('/:id/staff/:userId', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, userId } = req.params

    // Verify group exists
    const group = await prisma.group.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!group) {
      return res.status(404).json({ error: 'Group not found' })
    }

    await prisma.staffGroupAssignment.deleteMany({
      where: { groupId: id, userId },
    })

    res.json({ message: 'Staff removed successfully' })
  } catch (error) {
    console.error('Error removing staff from group:', error)
    res.status(500).json({ error: 'Failed to remove staff' })
  }
})

// Reorder categories (admin)
router.put('/categories/reorder', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { ids } = req.body

    // Update order for each category
    await Promise.all(
      ids.map((id: string, index: number) =>
        prisma.groupCategory.updateMany({
          where: { id, schoolId: user.schoolId },
          data: { order: index },
        })
      )
    )

    res.json({ message: 'Categories reordered successfully' })
  } catch (error) {
    console.error('Error reordering categories:', error)
    res.status(500).json({ error: 'Failed to reorder categories' })
  }
})

export default router
