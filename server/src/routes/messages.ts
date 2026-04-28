import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, isStaff, canSendToTarget, canMarkUrgent, loadUserWithRelations } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { logAudit, computeChanges } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'
import { translateTexts } from '../services/translation.js'
import { uploadFile, generateKey } from '../services/storage.js'

const router = Router()

const createMessageSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  targetClass: z.string().min(1),
  classId: z.string().optional(),
  yearGroupId: z.string().optional(),
  groupId: z.string().optional(),
  actionType: z.string().optional(),
  actionLabel: z.string().optional(),
  actionDueDate: z.string().optional(),
  actionAmount: z.string().optional(),
  isPinned: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  scheduledAt: z.string().optional(),
  expiresAt: z.string().optional(),
  formId: z.string().optional(),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileUrl: z.string(),
    fileType: z.string(),
    fileSize: z.number(),
  })).optional(),
})

const updateMessageSchema = createMessageSchema.partial()

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB
})

const ATTACHMENT_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// Upload attachment file to R2 (staff/admin only)
router.post('/upload', isStaff, attachmentUpload.single('file'), async (req, res) => {
  try {
    const uploaded = req.file
    if (!uploaded) {
      return res.status(400).json({ error: 'File is required' })
    }

    if (!ATTACHMENT_MIME_TYPES.includes(uploaded.mimetype)) {
      return res.status(400).json({ error: 'File type not allowed. Supported: images, PDF, Word documents.' })
    }

    const key = generateKey('message-attachments', uploaded.originalname)
    const fileUrl = await uploadFile(uploaded.buffer, key, uploaded.mimetype)

    res.json({
      fileName: uploaded.originalname,
      fileUrl,
      fileType: uploaded.mimetype,
      fileSize: uploaded.size,
    })
  } catch (error) {
    console.error('Error uploading attachment:', error)
    res.status(500).json({ error: 'Failed to upload attachment' })
  }
})

// Get messages (filtered by user's children's classes and groups)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const childClassIds = user.children?.map(c => c.classId) || []
    const studentIds = user.studentLinks?.map(l => l.studentId) || []
    const now = new Date()

    // Get year group IDs from children's classes
    const childClasses = childClassIds.length > 0
      ? await prisma.class.findMany({
          where: { id: { in: childClassIds } },
          select: { yearGroupId: true },
        })
      : []
    const childYearGroupIds = [...new Set(childClasses.map(c => c.yearGroupId).filter(Boolean))] as string[]

    // Get groups where parent's children are members
    const childGroupLinks = studentIds.length > 0
      ? await prisma.studentGroupLink.findMany({
          where: { studentId: { in: studentIds } },
          select: { groupId: true },
        })
      : []
    const childGroupIds = [...new Set(childGroupLinks.map(l => l.groupId))]

    const messages = await prisma.message.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
          ...(childYearGroupIds.length > 0 ? [{ yearGroupId: { in: childYearGroupIds } }] : []),
          ...(childGroupIds.length > 0 ? [{ groupId: { in: childGroupIds } }] : []),
        ],
        // Filter out expired and not-yet-scheduled messages for parents
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
          {
            OR: [
              { scheduledAt: null },
              { scheduledAt: { lte: now } },
            ],
          },
        ],
      },
      include: {
        sender: { select: { id: true, name: true } },
        acknowledgments: {
          where: { userId: user.id },
        },
        _count: { select: { acknowledgments: true } },
        form: {
          include: {
            responses: {
              where: { userId: user.id },
            },
          },
        },
        attachments: true,
      },
      orderBy: [
        { isPinned: 'desc' },
        { isUrgent: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    // Translate messages if user has non-English language preference
    const targetLang = user.preferredLanguage || 'en'

    // Build translation map for titles and contents
    const translationMap = new Map<string, string>()
    if (targetLang !== 'en') {
      const textsToTranslate: string[] = []
      messages.forEach(msg => {
        textsToTranslate.push(msg.title, msg.content)
        if (msg.form?.title) textsToTranslate.push(msg.form.title)
        if (msg.form?.description) textsToTranslate.push(msg.form.description)
      })

      const translations = await translateTexts(textsToTranslate, targetLang)

      let translationIndex = 0
      messages.forEach(msg => {
        translationMap.set(msg.title, translations[translationIndex++])
        translationMap.set(msg.content, translations[translationIndex++])
        if (msg.form?.title) translationMap.set(msg.form.title, translations[translationIndex++])
        if (msg.form?.description) translationMap.set(msg.form.description, translations[translationIndex++])
      })
    }

    const getTranslated = (text: string) => translationMap.get(text) || text

    res.json(messages.map(msg => ({
      id: msg.id,
      title: getTranslated(msg.title),
      content: getTranslated(msg.content),
      targetClass: msg.targetClass,
      classId: msg.classId,
      yearGroupId: msg.yearGroupId,
      groupId: msg.groupId,
      schoolId: msg.schoolId,
      senderId: msg.senderId,
      senderName: msg.sender.name,
      actionType: msg.actionType,
      actionLabel: msg.actionLabel,
      actionDueDate: msg.actionDueDate?.toISOString(),
      actionAmount: msg.actionAmount,
      isPinned: msg.isPinned,
      isUrgent: msg.isUrgent,
      expiresAt: msg.expiresAt?.toISOString(),
      formId: msg.formId,
      form: msg.form ? {
        id: msg.form.id,
        title: getTranslated(msg.form.title),
        description: msg.form.description ? getTranslated(msg.form.description) : null,
        type: msg.form.type,
        status: msg.form.status,
        fields: msg.form.fields,
        targetClass: msg.form.targetClass,
        classIds: msg.form.classIds as string[],
        yearGroupIds: msg.form.yearGroupIds as string[],
        schoolId: msg.form.schoolId,
        expiresAt: msg.form.expiresAt?.toISOString() || null,
        createdAt: msg.form.createdAt.toISOString(),
        updatedAt: msg.form.updatedAt.toISOString(),
        userResponse: msg.form.responses[0] ? {
          id: msg.form.responses[0].id,
          formId: msg.form.responses[0].formId,
          userId: msg.form.responses[0].userId,
          answers: msg.form.responses[0].answers,
          createdAt: msg.form.responses[0].createdAt.toISOString(),
        } : null,
      } : undefined,
      attachments: msg.attachments.map(a => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
      acknowledged: msg.acknowledgments.length > 0,
      acknowledgmentCount: msg._count.acknowledgments,
      createdAt: msg.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching messages:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// Get all messages (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const messages = await prisma.message.findMany({
      where: { schoolId: user.schoolId },
      include: {
        sender: { select: { id: true, name: true } },
        _count: { select: { acknowledgments: true } },
        form: {
          include: {
            _count: { select: { responses: true } },
          },
        },
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    res.json(messages.map(msg => ({
      id: msg.id,
      title: msg.title,
      content: msg.content,
      targetClass: msg.targetClass,
      classId: msg.classId,
      yearGroupId: msg.yearGroupId,
      groupId: msg.groupId,
      schoolId: msg.schoolId,
      senderId: msg.senderId,
      senderName: msg.sender.name,
      actionType: msg.actionType,
      actionLabel: msg.actionLabel,
      actionDueDate: msg.actionDueDate?.toISOString(),
      actionAmount: msg.actionAmount,
      isPinned: msg.isPinned,
      isUrgent: msg.isUrgent,
      scheduledAt: msg.scheduledAt?.toISOString(),
      isScheduled: msg.scheduledAt ? msg.scheduledAt > now : false,
      expiresAt: msg.expiresAt?.toISOString(),
      isExpired: msg.expiresAt ? msg.expiresAt < now : false,
      formId: msg.formId,
      form: msg.form ? {
        id: msg.form.id,
        title: msg.form.title,
        type: msg.form.type,
        status: msg.form.status,
        fields: msg.form.fields,
        responseCount: msg.form._count.responses,
      } : undefined,
      attachments: msg.attachments.map(a => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
      acknowledgmentCount: msg._count.acknowledgments,
      createdAt: msg.createdAt.toISOString(),
      updatedAt: msg.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching all messages:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// Create message (staff can send to assigned classes, admin can send anywhere)
router.post('/', isStaff, validate(createMessageSchema), canSendToTarget, canMarkUrgent, async (req, res) => {
  try {
    const user = req.user!
    const { title, content, targetClass, classId, yearGroupId, groupId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent, scheduledAt, expiresAt, formId, attachments } = req.body

    // Staff cannot pin messages (only admin)
    const canPin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    const message = await prisma.message.create({
      data: {
        title,
        content,
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
        groupId: groupId || null,
        schoolId: user.schoolId,
        senderId: user.id,
        senderName: user.name,
        actionType: actionType || null,
        actionLabel: actionLabel || null,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : null,
        actionAmount: actionAmount || null,
        isPinned: canPin ? (isPinned || false) : false,
        isUrgent: isUrgent || false,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        formId: formId || null,
      },
    })

    // Auto-activate attached form
    if (formId) {
      await prisma.form.update({
        where: { id: formId },
        data: { status: 'ACTIVE' },
      })
    }

    // Create attachment records
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      await prisma.messageAttachment.createMany({
        data: attachments.map((a: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => ({
          messageId: message.id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileType: a.fileType,
          fileSize: a.fileSize,
        })),
      })
    }

    // Fetch created attachments for response
    const createdAttachments = await prisma.messageAttachment.findMany({
      where: { messageId: message.id },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'MESSAGE', resourceId: message.id, metadata: { title: message.title, attachmentCount: createdAttachments.length } })
    sendNotification({ req, type: 'MESSAGE', title: message.title, body: message.content.substring(0, 200), resourceType: 'MESSAGE', resourceId: message.id, target: { targetClass, classId: classId || undefined, yearGroupId: yearGroupId || undefined, groupId: groupId || undefined, schoolId: user.schoolId } })

    res.status(201).json({
      id: message.id,
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      classId: message.classId,
      yearGroupId: message.yearGroupId,
      groupId: message.groupId,
      schoolId: message.schoolId,
      senderId: message.senderId,
      senderName: message.senderName,
      actionType: message.actionType,
      actionLabel: message.actionLabel,
      actionDueDate: message.actionDueDate?.toISOString(),
      actionAmount: message.actionAmount,
      isPinned: message.isPinned,
      isUrgent: message.isUrgent,
      scheduledAt: message.scheduledAt?.toISOString(),
      expiresAt: message.expiresAt?.toISOString(),
      formId: message.formId,
      attachments: createdAttachments.map(a => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: message.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating message:', error)
    res.status(500).json({ error: 'Failed to create message' })
  }
})

// Update message (admin only)
router.put('/:id', isAdmin, validate(updateMessageSchema), async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, content, targetClass, classId, yearGroupId, groupId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent, scheduledAt, expiresAt, formId, attachments } = req.body

    // Verify message belongs to user's school
    const existing = await prisma.message.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Message not found' })
    }

    const message = await prisma.message.update({
      where: { id },
      data: {
        title,
        content,
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
        groupId: groupId !== undefined ? (groupId || null) : existing.groupId,
        actionType: actionType || null,
        actionLabel: actionLabel || null,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : null,
        actionAmount: actionAmount || null,
        isPinned: isPinned ?? existing.isPinned,
        isUrgent: isUrgent ?? existing.isUrgent,
        scheduledAt: scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : existing.scheduledAt,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        formId: formId !== undefined ? (formId || null) : existing.formId,
      },
    })

    // Auto-activate newly attached form
    if (formId && formId !== existing.formId) {
      await prisma.form.update({
        where: { id: formId },
        data: { status: 'ACTIVE' },
      })
    }

    // Sync attachments if provided (replace all)
    if (attachments !== undefined && Array.isArray(attachments)) {
      await prisma.messageAttachment.deleteMany({ where: { messageId: id } })
      if (attachments.length > 0) {
        await prisma.messageAttachment.createMany({
          data: attachments.map((a: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => ({
            messageId: id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            fileType: a.fileType,
            fileSize: a.fileSize,
          })),
        })
      }
    }

    const updatedAttachments = await prisma.messageAttachment.findMany({
      where: { messageId: id },
    })

    const changes = computeChanges(existing as any, message as any, ['title', 'content', 'targetClass', 'isPinned', 'isUrgent', 'actionType', 'actionLabel', 'actionDueDate', 'actionAmount'])
    logAudit({ req, action: 'UPDATE', resourceType: 'MESSAGE', resourceId: message.id, metadata: { title: message.title }, changes })

    res.json({
      id: message.id,
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      classId: message.classId,
      yearGroupId: message.yearGroupId,
      groupId: message.groupId,
      schoolId: message.schoolId,
      senderId: message.senderId,
      senderName: message.senderName,
      actionType: message.actionType,
      actionLabel: message.actionLabel,
      actionDueDate: message.actionDueDate?.toISOString(),
      actionAmount: message.actionAmount,
      isPinned: message.isPinned,
      isUrgent: message.isUrgent,
      expiresAt: message.expiresAt?.toISOString(),
      formId: message.formId,
      attachments: updatedAttachments.map(a => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating message:', error)
    res.status(500).json({ error: 'Failed to update message' })
  }
})

// Delete message (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify message belongs to user's school
    const existing = await prisma.message.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Message not found' })
    }

    await prisma.message.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'MESSAGE', resourceId: id, metadata: { title: existing.title } })

    res.json({ message: 'Message deleted successfully' })
  } catch (error) {
    console.error('Error deleting message:', error)
    res.status(500).json({ error: 'Failed to delete message' })
  }
})

// Acknowledge message
router.post('/:id/ack', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const acknowledgment = await prisma.messageAcknowledgment.upsert({
      where: {
        messageId_userId: {
          messageId: id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        messageId: id,
        userId: user.id,
      },
    })

    res.json({
      id: acknowledgment.id,
      messageId: acknowledgment.messageId,
      userId: acknowledgment.userId,
      createdAt: acknowledgment.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error acknowledging message:', error)
    res.status(500).json({ error: 'Failed to acknowledge message' })
  }
})

export default router
