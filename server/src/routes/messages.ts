import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, isStaff, canSendToTarget, canMarkUrgent } from '../middleware/auth.js'

const router = Router()

// Get messages (filtered by user's children's classes)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const childClassIds = user.children?.map(c => c.classId) || []
    const now = new Date()

    const messages = await prisma.message.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
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
    const { title, content, targetClass, classId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent, expiresAt } = req.body

    // Staff cannot pin messages (only admin)
    const canPin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    const message = await prisma.message.create({
      data: {
        title,
        content,
        targetClass,
        classId: classId || null,
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
      },
    })

    res.status(201).json({
      id: message.id,
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      classId: message.classId,
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
    const { title, content, targetClass, classId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent, expiresAt } = req.body

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
        actionType: actionType || null,
        actionLabel: actionLabel || null,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : null,
        actionAmount: actionAmount || null,
        isPinned: isPinned ?? existing.isPinned,
        isUrgent: isUrgent ?? existing.isUrgent,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    res.json({
      id: message.id,
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      classId: message.classId,
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
