import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { policyUpload } from '../upload.js'
import { uploadFile, deleteFile, generateKey } from '../services/storage.js'

const router = Router()

function extractKeyFromUrl(fileUrl: string): string | null {
  // Extract the R2 object key from a full URL
  // e.g. "https://....r2.cloudflarestorage.com/policies/abc.pdf" → "policies/abc.pdf"
  try {
    const url = new URL(fileUrl)
    return url.pathname.replace(/^\//, '')
  } catch {
    // Legacy local path like "/uploads/policies/abc.pdf" — no R2 key
    return null
  }
}

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
router.post('/', isAdmin, policyUpload.single('file'), async (req, res) => {
  try {
    const user = req.user!
    const { name, description } = req.body
    const file = req.file

    if (!file) {
      return res.status(400).json({ error: 'PDF file is required' })
    }

    const key = generateKey('policies', file.originalname)
    const fileUrl = await uploadFile(file.buffer, key, file.mimetype)

    const policy = await prisma.policy.create({
      data: {
        name,
        description: description || null,
        fileUrl,
        fileSize: file.size,
        schoolId: user.schoolId,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'POLICY', resourceId: policy.id, metadata: { name: policy.name } })

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
router.put('/:id', isAdmin, policyUpload.single('file'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, description } = req.body
    const file = req.file

    const existing = await prisma.policy.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Policy not found' })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description || null

    if (file) {
      // Delete old file from R2
      const oldKey = extractKeyFromUrl(existing.fileUrl)
      if (oldKey) {
        await deleteFile(oldKey).catch(() => {})
      }

      const key = generateKey('policies', file.originalname)
      updateData.fileUrl = await uploadFile(file.buffer, key, file.mimetype)
      updateData.fileSize = file.size
    }

    const policy = await prisma.policy.update({
      where: { id },
      data: updateData,
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'POLICY', resourceId: policy.id, metadata: { name: policy.name } })

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

    const policy = await prisma.policy.findUnique({ where: { id } })
    if (policy) {
      const key = extractKeyFromUrl(policy.fileUrl)
      if (key) {
        await deleteFile(key).catch(() => {})
      }
    }

    await prisma.policy.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'POLICY', resourceId: id, metadata: { name: policy?.name } })

    res.json({ message: 'Policy deleted successfully' })
  } catch (error) {
    console.error('Error deleting policy:', error)
    res.status(500).json({ error: 'Failed to delete policy' })
  }
})

export default router
