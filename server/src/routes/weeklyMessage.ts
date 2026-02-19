import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'
import { translateTexts } from '../services/translation.js'

const router = Router()

// Get current weekly message
router.get('/current', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const message = await prisma.weeklyMessage.findFirst({
      where: {
        schoolId: user.schoolId,
        isCurrent: true,
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
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, content, weekOf, isCurrent } = req.body

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
        schoolId: user.schoolId,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'WEEKLY_MESSAGE', resourceId: message.id, metadata: { title: message.title } })
    sendNotification({ req, type: 'WEEKLY_MESSAGE', title: message.title, body: message.content.substring(0, 200), resourceType: 'WEEKLY_MESSAGE', resourceId: message.id, target: { targetClass: 'Whole School', schoolId: user.schoolId } })

    res.status(201).json({
      id: message.id,
      title: message.title,
      content: message.content,
      weekOf: message.weekOf.toISOString().split('T')[0],
      isCurrent: message.isCurrent,
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
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, content, weekOf, isCurrent } = req.body

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
      schoolId: message.schoolId,
      heartCount: message._count.hearts,
      createdAt: message.createdAt.toISOString(),
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'WEEKLY_MESSAGE', resourceId: message.id, metadata: { title: message.title } })
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
