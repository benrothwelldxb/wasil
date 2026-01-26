import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get messages (filtered by user's children's classes)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const childClassIds = user.children?.map(c => c.classId) || []

    const messages = await prisma.message.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
        ],
      },
      include: {
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
      senderName: msg.senderName,
      actionType: msg.actionType,
      actionLabel: msg.actionLabel,
      actionDueDate: msg.actionDueDate?.toISOString(),
      actionAmount: msg.actionAmount,
      isPinned: msg.isPinned,
      isUrgent: msg.isUrgent,
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
        _count: { select: { acknowledgments: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(messages.map(msg => ({
      id: msg.id,
      title: msg.title,
      content: msg.content,
      targetClass: msg.targetClass,
      classId: msg.classId,
      schoolId: msg.schoolId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      actionType: msg.actionType,
      actionLabel: msg.actionLabel,
      actionDueDate: msg.actionDueDate?.toISOString(),
      actionAmount: msg.actionAmount,
      isPinned: msg.isPinned,
      isUrgent: msg.isUrgent,
      acknowledgmentCount: msg._count.acknowledgments,
      createdAt: msg.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching all messages:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// Create message (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, content, targetClass, classId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent } = req.body

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
        isPinned: isPinned || false,
        isUrgent: isUrgent || false,
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
      createdAt: message.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating message:', error)
    res.status(500).json({ error: 'Failed to create message' })
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
