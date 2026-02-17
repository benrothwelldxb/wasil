import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, isStaff, canSendToTarget, canMarkUrgent } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'

const router = Router()

// Get messages (filtered by user's children's classes)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const childClassIds = user.children?.map(c => c.classId) || []
    const now = new Date()

    // Get year group IDs from children's classes
    const childClasses = childClassIds.length > 0
      ? await prisma.class.findMany({
          where: { id: { in: childClassIds } },
          select: { yearGroupId: true },
        })
      : []
    const childYearGroupIds = [...new Set(childClasses.map(c => c.yearGroupId).filter(Boolean))] as string[]

    const messages = await prisma.message.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
          ...(childYearGroupIds.length > 0 ? [{ yearGroupId: { in: childYearGroupIds } }] : []),
        ],
        // Filter out expired messages for parents
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
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
      },
      orderBy: [
        { isPinned: 'desc' },
        { isUrgent: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    res.json(messages.map(msg => ({
      id: msg.id,
      title: msg.title,
      content: msg.content,
      targetClass: msg.targetClass,
      classId: msg.classId,
      yearGroupId: msg.yearGroupId,
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
        title: msg.form.title,
        description: msg.form.description,
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
router.post('/', isStaff, canSendToTarget, canMarkUrgent, async (req, res) => {
  try {
    const user = req.user!
    const { title, content, targetClass, classId, yearGroupId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent, expiresAt, formId } = req.body

    // Staff cannot pin messages (only admin)
    const canPin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    const message = await prisma.message.create({
      data: {
        title,
        content,
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
        schoolId: user.schoolId,
        senderId: user.id,
        senderName: user.name,
        actionType: actionType || null,
        actionLabel: actionLabel || null,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : null,
        actionAmount: actionAmount || null,
        isPinned: canPin ? (isPinned || false) : false,
        isUrgent: isUrgent || false,
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

    logAudit({ req, action: 'CREATE', resourceType: 'MESSAGE', resourceId: message.id, metadata: { title: message.title } })
    sendNotification({ req, type: 'MESSAGE', title: message.title, body: message.content.substring(0, 200), resourceType: 'MESSAGE', resourceId: message.id, target: { targetClass, classId: classId || undefined, yearGroupId: yearGroupId || undefined, schoolId: user.schoolId } })

    res.status(201).json({
      id: message.id,
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      classId: message.classId,
      yearGroupId: message.yearGroupId,
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
      createdAt: message.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating message:', error)
    res.status(500).json({ error: 'Failed to create message' })
  }
})

// Update message (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, content, targetClass, classId, yearGroupId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent, expiresAt, formId } = req.body

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
        actionType: actionType || null,
        actionLabel: actionLabel || null,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : null,
        actionAmount: actionAmount || null,
        isPinned: isPinned ?? existing.isPinned,
        isUrgent: isUrgent ?? existing.isUrgent,
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

    logAudit({ req, action: 'UPDATE', resourceType: 'MESSAGE', resourceId: message.id, metadata: { title: message.title } })

    res.json({
      id: message.id,
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      classId: message.classId,
      yearGroupId: message.yearGroupId,
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
