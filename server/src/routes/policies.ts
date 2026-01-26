import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get all policies (alphabetized)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const policies = await prisma.policy.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: 'asc' },
    })

    res.json(policies.map(policy => ({
      id: policy.id,
      name: policy.name,
      description: policy.description,
      fileUrl: policy.fileUrl,
      fileSize: policy.fileSize,
      updatedAt: policy.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching policies:', error)
    res.status(500).json({ error: 'Failed to fetch policies' })
  }
})

// Create policy (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, description, fileUrl, fileSize } = req.body

    const policy = await prisma.policy.create({
      data: {
        name,
        description: description || null,
        fileUrl,
        fileSize: fileSize || null,
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: policy.id,
      name: policy.name,
      description: policy.description,
      fileUrl: policy.fileUrl,
      fileSize: policy.fileSize,
      updatedAt: policy.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating policy:', error)
    res.status(500).json({ error: 'Failed to create policy' })
  }
})

// Update policy (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, fileUrl, fileSize } = req.body

    const policy = await prisma.policy.update({
      where: { id },
      data: {
        name,
        description: description || null,
        fileUrl,
        fileSize: fileSize || null,
      },
    })

    res.json({
      id: policy.id,
      name: policy.name,
      description: policy.description,
      fileUrl: policy.fileUrl,
      fileSize: policy.fileSize,
      updatedAt: policy.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating policy:', error)
    res.status(500).json({ error: 'Failed to update policy' })
  }
})

// Delete policy (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.policy.delete({
      where: { id },
    })

    res.json({ message: 'Policy deleted successfully' })
  } catch (error) {
    console.error('Error deleting policy:', error)
    res.status(500).json({ error: 'Failed to delete policy' })
  }
})

export default router
