import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'

const router = Router()

// Get all users (admin only)
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const users = await prisma.user.findMany({
      where: { schoolId: user.schoolId },
      include: {
        children: {
          include: { class: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    res.json(users.map(u => ({
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
    })))
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Create/invite user (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const admin = req.user!
    const { email, name, role, children } = req.body

    // Create user
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        role: role || 'PARENT',
        schoolId: admin.schoolId,
      },
    })

    // Create children if provided
    if (children && children.length > 0) {
      await prisma.child.createMany({
        data: children.map((child: { name: string; classId: string }) => ({
          name: child.name,
          classId: child.classId,
          parentId: newUser.id,
        })),
      })
    }

    // Fetch the complete user with children
    const user = await prisma.user.findUnique({
      where: { id: newUser.id },
      include: {
        children: {
          include: { class: true },
        },
      },
    })

    res.status(201).json({
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      schoolId: user!.schoolId,
      avatarUrl: user!.avatarUrl,
      children: user!.children.map(c => ({
        id: c.id,
        name: c.name,
        classId: c.classId,
        className: c.class.name,
      })),
      createdAt: user!.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating user:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Update user (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, role, children } = req.body

    // Update user
    await prisma.user.update({
      where: { id },
      data: { name, role },
    })

    // Update children if provided
    if (children !== undefined) {
      // Delete existing children
      await prisma.child.deleteMany({
        where: { parentId: id },
      })

      // Create new children
      if (children.length > 0) {
        await prisma.child.createMany({
          data: children.map((child: { name: string; classId: string }) => ({
            name: child.name,
            classId: child.classId,
            parentId: id,
          })),
        })
      }
    }

    // Fetch updated user
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        children: {
          include: { class: true },
        },
      },
    })

    res.json({
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      schoolId: user!.schoolId,
      avatarUrl: user!.avatarUrl,
      children: user!.children.map(c => ({
        id: c.id,
        name: c.name,
        classId: c.classId,
        className: c.class.name,
      })),
      createdAt: user!.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Delete user (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.user.delete({
      where: { id },
    })

    res.json({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('Error deleting user:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export default router
