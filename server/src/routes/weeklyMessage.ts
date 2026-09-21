import { Router } from 'express'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { logAudit, computeChanges } from '../services/audit.js'
import { sendNotification, sendStaffNotification } from '../services/notify.js'
import { translateTexts } from '../services/translation.js'
import { parseWallClockForSchool } from '../services/dateTime.js'
import { stripMarkdown, repairTranslatedMarkdown, parseMentions } from '../services/markdownText.js'

const router = Router()

const createWeeklyMessageSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(20000),
  weekOf: z.string().min(1),
  isCurrent: z.boolean().optional(),
  imageUrl: z.string().optional(),
  scheduledAt: z.string().optional(),
})

const updateWeeklyMessageSchema = createWeeklyMessageSchema.partial()


/**
 * Tell staff they have been @mentioned in a weekly update.
 *
 * A tag is a promise made on someone else's behalf — "message Rob about Sports
 * Day" sends parents to Rob whether or not Rob knows. So the tag notifies him,
 * with the update's title, before the messages start arriving.
 *
 * `newlyMentionedOnly` matters on edit: re-saving a published update must not
 * re-notify everyone already tagged in it, or correcting a typo becomes a
 * second round of pings.
 */
function notifyMentionedStaff(opts: {
  schoolId: string
  messageId: string
  title: string
  content: string
  previousContent?: string
}) {
  const mentions = parseMentions(opts.content)
  if (mentions.length === 0) return

  const already = new Set(parseMentions(opts.previousContent || '').map(m => m.staffId))
  const staffIds = mentions.map(m => m.staffId).filter(id => !already.has(id))
  if (staffIds.length === 0) return

  sendStaffNotification({
    schoolId: opts.schoolId,
    type: 'STAFF_MENTION',
    title: 'You were tagged in a weekly update',
    body: `${opts.title} — parents have been pointed to you for more details.`,
    resourceType: 'WEEKLY_MESSAGE',
    resourceId: opts.messageId,
    // Any member of staff can be tagged, not just the office.
    roles: ['STAFF', 'ADMIN', 'SUPER_ADMIN'],
    userIds: staffIds,
  })
}

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
      // Content is markdown; translation pads the markers. See the helper.
      translatedContent = repairTranslatedMarkdown(translations[1])
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

    // A scheduled update is NOT yet for parents.
    //
    // /current has always filtered on this; the list never did, so an update
    // written on Thursday and scheduled for Monday was hidden from the
    // dashboard card and sitting in the Principal's Updates list the whole
    // time. Nothing contradicted the principal's belief that it was held back:
    // the create route deliberately suppresses the notification for a
    // future-dated one, so it went out silently rather than not at all.
    //
    // Staff and admin DO see them — the admin page badges them as scheduled
    // and would be unusable without them, and the same route serves both.
    const staffViewer = user.role !== 'PARENT'
    const visibility = staffViewer
      ? {}
      : { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] }

    const messages = await prisma.weeklyMessage.findMany({
      where: { schoolId: user.schoolId, ...visibility },
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
        translationMap.set(msg.content, repairTranslatedMarkdown(translations[translationIndex++]))
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

    // The typed time is the school's wall clock, not the server's — see
    // parseSchoolWallClock. Reading it as UTC scheduled a Dubai 11:30 for 15:30.
    const scheduledDate = scheduledAt ? await parseWallClockForSchool(scheduledAt, user.schoolId) : null

    const message = await prisma.weeklyMessage.create({
      data: {
        title,
        content,
        weekOf: new Date(weekOf),
        isCurrent: isCurrent || false,
        imageUrl: imageUrl || null,
        scheduledAt: scheduledDate,
        schoolId: user.schoolId,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'WEEKLY_MESSAGE', resourceId: message.id, metadata: { title: message.title } })

    // Only send notification if not scheduled for later
    if (!message.scheduledAt || message.scheduledAt <= new Date()) {
      sendNotification({ req, type: 'WEEKLY_MESSAGE', title: message.title, body: stripMarkdown(message.content).substring(0, 200), resourceType: 'WEEKLY_MESSAGE', resourceId: message.id, target: { targetClass: 'Whole School', schoolId: user.schoolId } })
      notifyMentionedStaff({ schoolId: user.schoolId, messageId: message.id, title: message.title, content: message.content })
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

    // Same wall-clock reading as create: the school's zone, not the server's.
    const scheduledDate = scheduledAt ? await parseWallClockForSchool(scheduledAt, user.schoolId) : null

    const message = await prisma.weeklyMessage.update({
      where: { id },
      data: {
        title,
        content,
        weekOf: new Date(weekOf),
        isCurrent,
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledDate }),
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

    // Editing a live update can add a tag that was not there before.
    if (!message.scheduledAt || message.scheduledAt <= new Date()) {
      notifyMentionedStaff({
        schoolId: user.schoolId,
        messageId: message.id,
        title: message.title,
        content: message.content,
        previousContent: existing.content,
      })
    }

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
