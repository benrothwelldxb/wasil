import { Router } from 'express'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { logAudit, computeChanges } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'
import { translateTexts } from '../services/translation.js'

const router = Router()

const createWeeklyMessageSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  weekOf: z.string().min(1),
  isCurrent: z.boolean().optional(),
  imageUrl: z.string().optional(),
  scheduledAt: z.string().optional(),
})

const updateWeeklyMessageSchema = createWeeklyMessageSchema.partial()

// Get current weekly message
router.get('/current', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const now = new Date()
    const message = await prisma.weeklyMessage.findFirst({
      where: {
        schoolId: user.schoolId,
        isCurrent: true,
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: now } },
        ],
      },
      include: {
        _count: { select: { hearts: true } },
        hearts: {
          where: { userId: user.id },
        },
      },
    })

    if (!message) {
      return res.json(null)
    }

    // Translate if user has non-English language preference
    const targetLang = user.preferredLanguage || 'en'
    let translatedTitle = message.title
    let translatedContent = message.content

    if (targetLang !== 'en') {
      const translations = await translateTexts([message.title, message.content], targetLang)
      translatedTitle = translations[0]
      translatedContent = translations[1]
    }

    res.json({
      id: message.id,
      title: translatedTitle,
      content: translatedContent,
      weekOf: message.weekOf.toISOString().split('T')[0],
      isCurrent: message.isCurrent,
      imageUrl: message.imageUrl,
      schoolId: message.schoolId,
      heartCount: message._count.hearts,
      hasHearted: message.hearts.length > 0,
      createdAt: message.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching current weekly message:', error)
    res.status(500).json({ error: 'Failed to fetch weekly message' })
  }
})

// Get all weekly messages
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const messages = await prisma.weeklyMessage.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: { select: { hearts: true } },
        hearts: {
          where: { userId: user.id },
        },
      },
      orderBy: { weekOf: 'desc' },
    })

    // Translate if user has non-English language preference
    const targetLang = user.preferredLanguage || 'en'
    const translationMap = new Map<string, string>()

    if (targetLang !== 'en') {
      const textsToTranslate: string[] = []
      messages.forEach(msg => {
        textsToTranslate.push(msg.title, msg.content)
      })

      const translations = await translateTexts(textsToTranslate, targetLang)

      let translationIndex = 0
      messages.forEach(msg => {
        translationMap.set(msg.title, translations[translationIndex++])
        translationMap.set(msg.content, translations[translationIndex++])
      })
    }

    const getTranslated = (text: string) => translationMap.get(text) || text

    res.json(messages.map(msg => ({
      id: msg.id,
      title: getTranslated(msg.title),
      content: getTranslated(msg.content),
      weekOf: msg.weekOf.toISOString().split('T')[0],
      isCurrent: msg.isCurrent,
      imageUrl: msg.imageUrl,
      scheduledAt: msg.scheduledAt?.toISOString() || null,
      schoolId: msg.schoolId,
      heartCount: msg._count.hearts,
      hasHearted: msg.hearts.length > 0,
      createdAt: msg.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching weekly messages:', error)
    res.status(500).json({ error: 'Failed to fetch weekly messages' })
  }
})

// Create/update weekly message (admin only)
router.post('/', isAdmin, validate(createWeeklyMessageSchema), async (req, res) => {
  try {
    const user = req.user!
    const { title, content, weekOf, isCurrent, imageUrl, scheduledAt } = req.body

    // If this is set as current, unset other current messages
    if (isCurrent) {
      await prisma.weeklyMessage.updateMany({
        where: { schoolId: user.schoolId, isCurrent: true },
        data: { isCurrent: false },
      })
    }

    const message = await prisma.weeklyMessage.create({
      data: {
        title,
        content,
        weekOf: new Date(weekOf),
        isCurrent: isCurrent || false,
        imageUrl: imageUrl || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        schoolId: user.schoolId,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'WEEKLY_MESSAGE', resourceId: message.id, metadata: { title: message.title } })

    // Only send notification if not scheduled for later
    if (!message.scheduledAt || message.scheduledAt <= new Date()) {
      sendNotification({ req, type: 'WEEKLY_MESSAGE', title: message.title, body: message.content.substring(0, 200), resourceType: 'WEEKLY_MESSAGE', resourceId: message.id, target: { targetClass: 'Whole School', schoolId: user.schoolId } })
    }

    res.status(201).json({
      id: message.id,
      title: message.title,
      content: message.content,
      weekOf: message.weekOf.toISOString().split('T')[0],
      isCurrent: message.isCurrent,
      imageUrl: message.imageUrl,
      scheduledAt: message.scheduledAt?.toISOString() || null,
      schoolId: message.schoolId,
      heartCount: 0,
      hasHearted: false,
      createdAt: message.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating weekly message:', error)
    res.status(500).json({ error: 'Failed to create weekly message' })
  }
})

// Update weekly message (admin only)
router.put('/:id', isAdmin, validate(updateWeeklyMessageSchema), async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, content, weekOf, isCurrent, imageUrl, scheduledAt } = req.body

    const existing = await prisma.weeklyMessage.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Weekly message not found' })
    }

    // If this is set as current, unset other current messages
    if (isCurrent) {
      await prisma.weeklyMessage.updateMany({
        where: { schoolId: user.schoolId, isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      })
    }

    const message = await prisma.weeklyMessage.update({
      where: { id },
      data: {
        title,
        content,
        weekOf: new Date(weekOf),
        isCurrent,
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
      },
      include: {
        _count: { select: { hearts: true } },
      },
    })

    res.json({
      id: message.id,
      title: message.title,
      content: message.content,
      weekOf: message.weekOf.toISOString().split('T')[0],
      isCurrent: message.isCurrent,
      imageUrl: message.imageUrl,
      scheduledAt: message.scheduledAt?.toISOString() || null,
      schoolId: message.schoolId,
      heartCount: message._count.hearts,
      createdAt: message.createdAt.toISOString(),
    })

    const changes = computeChanges(existing as any, message as any, ['title', 'content', 'weekOf', 'isCurrent', 'imageUrl', 'scheduledAt'])
    logAudit({ req, action: 'UPDATE', resourceType: 'WEEKLY_MESSAGE', resourceId: message.id, metadata: { title: message.title }, changes })
  } catch (error) {
    console.error('Error updating weekly message:', error)
    res.status(500).json({ error: 'Failed to update weekly message' })
  }
})

// Delete weekly message (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify message belongs to user's school
    const existing = await prisma.weeklyMessage.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Weekly message not found' })
    }

    await prisma.weeklyMessage.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'WEEKLY_MESSAGE', resourceId: id, metadata: { title: existing.title } })

    res.json({ message: 'Weekly message deleted successfully' })
  } catch (error) {
    console.error('Error deleting weekly message:', error)
    res.status(500).json({ error: 'Failed to delete weekly message' })
  }
})

// Toggle heart on weekly message
router.post('/:id/heart', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existingHeart = await prisma.weeklyMessageHeart.findUnique({
      where: {
        messageId_userId: {
          messageId: id,
          userId: user.id,
        },
      },
    })

    if (existingHeart) {
      await prisma.weeklyMessageHeart.delete({
        where: { id: existingHeart.id },
      })
      res.json({ hearted: false })
    } else {
      await prisma.weeklyMessageHeart.create({
        data: {
          messageId: id,
          userId: user.id,
        },
      })
      res.json({ hearted: true })
    }
  } catch (error) {
    console.error('Error toggling heart:', error)
    res.status(500).json({ error: 'Failed to toggle heart' })
  }
})

export default router
