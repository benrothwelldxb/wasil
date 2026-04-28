import { Router } from 'express'
import multer from 'multer'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, isStaff, loadUserWithRelations } from '../middleware/auth.js'
import { uploadFile, generateKey } from '../services/storage.js'
import { sendPushNotification, removeInvalidTokens } from '../services/firebase.js'

const router = Router()

// In-memory typing indicators (conversationId -> Map<userId, expiresAt>)
const typingState = new Map<string, Map<string, number>>()

const TYPING_EXPIRY_MS = 4000

const ALLOWED_REACTION_EMOJIS = ['thumbsup', 'heart', 'laugh', 'sad', 'check']

function setTyping(conversationId: string, userId: string) {
  if (!typingState.has(conversationId)) typingState.set(conversationId, new Map())
  typingState.get(conversationId)!.set(userId, Date.now() + TYPING_EXPIRY_MS)
}

function getTypingUsers(conversationId: string, excludeUserId: string): string[] {
  const map = typingState.get(conversationId)
  if (!map) return []
  const now = Date.now()
  const active: string[] = []
  for (const [uid, expiresAt] of map) {
    if (uid !== excludeUserId && expiresAt > now) {
      active.push(uid)
    } else if (expiresAt <= now) {
      map.delete(uid)
    }
  }
  return active
}

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
})

const ATTACHMENT_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// Helper: serialize a message with soft-delete handling, replyTo, and reactions
function serializeMessage(
  m: {
    id: string
    senderId: string
    sender: { id: string; name: string }
    content: string
    readAt: Date | null
    createdAt: Date
    deletedAt: Date | null
    replyTo?: { id: string; content: string; senderId: string; sender: { name: string }; deletedAt: Date | null } | null
    attachments: Array<{ id: string; fileName: string; fileUrl: string; fileType: string; fileSize: number }>
    reactions: Array<{ emoji: string; userId: string }>
  },
  currentUserId: string,
) {
  const isDeleted = m.deletedAt !== null

  // Build reaction summary: { [emoji]: { count, reacted } }
  const reactionMap: Record<string, { count: number; reacted: boolean }> = {}
  for (const r of m.reactions) {
    if (!reactionMap[r.emoji]) {
      reactionMap[r.emoji] = { count: 0, reacted: false }
    }
    reactionMap[r.emoji].count++
    if (r.userId === currentUserId) {
      reactionMap[r.emoji].reacted = true
    }
  }

  return {
    id: m.id,
    senderId: m.senderId,
    senderName: m.sender.name,
    content: isDeleted ? '' : m.content,
    deleted: isDeleted || undefined,
    deletedAt: m.deletedAt?.toISOString() || null,
    readAt: m.readAt?.toISOString() || null,
    createdAt: m.createdAt.toISOString(),
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          content: m.replyTo.deletedAt ? '' : m.replyTo.content,
          senderName: m.replyTo.sender.name,
          deleted: m.replyTo.deletedAt ? true : undefined,
        }
      : null,
    reactions: Object.keys(reactionMap).length > 0 ? reactionMap : undefined,
    attachments: m.attachments.map(a => ({
      id: a.id,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileType: a.fileType,
      fileSize: a.fileSize,
    })),
  }
}

// ==========================================
// Parent endpoints
// ==========================================

// List conversations for parent
router.get('/conversations', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        parentId: user.id,
        archivedByParent: false,
      },
      include: {
        staff: { select: { id: true, name: true, avatarUrl: true } },
        student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
        schoolContact: { select: { id: true, name: true, icon: true } },
        messages: {
          where: { senderId: { not: user.id }, readAt: null },
          select: { id: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    res.json(conversations.map(c => ({
      id: c.id,
      staffId: c.staffId,
      staffName: c.staff.name,
      staffAvatarUrl: c.staff.avatarUrl,
      studentId: c.studentId,
      studentName: c.student ? `${c.student.firstName} ${c.student.lastName}` : null,
      className: c.student?.class?.name || null,
      schoolContactId: c.schoolContactId,
      schoolContactName: c.schoolContact?.name || null,
      schoolContactIcon: c.schoolContact?.icon || null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      lastMessageText: c.lastMessageText,
      unreadCount: c.messages.length,
      muted: c.mutedByParent,
      createdAt: c.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching conversations:', error)
    res.status(500).json({ error: 'Failed to fetch conversations' })
  }
})

// Get conversation with messages (parent/staff/admin)
router.get('/conversations/:id', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        OR: [
          { parentId: user.id },
          ...(user.role !== 'PARENT' ? [{ staffId: user.id }] : []),
          ...(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ schoolId: user.schoolId }] : []),
        ],
      },
      include: {
        staff: { select: { id: true, name: true, avatarUrl: true } },
        parent: { select: { id: true, name: true, avatarUrl: true } },
        student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
        schoolContact: { select: { id: true, name: true, icon: true } },
        messages: {
          include: {
            sender: { select: { id: true, name: true } },
            attachments: true,
            replyTo: {
              select: {
                id: true,
                content: true,
                senderId: true,
                sender: { select: { name: true } },
                deletedAt: true,
              },
            },
            reactions: { select: { emoji: true, userId: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    // Mark incoming messages as read
    await prisma.conversationMessage.updateMany({
      where: {
        conversationId: id,
        senderId: { not: user.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    })

    const isParent = user.id === conversation.parentId
    const muted = isParent ? conversation.mutedByParent : conversation.mutedByStaff

    res.json({
      id: conversation.id,
      parentId: conversation.parentId,
      parentName: conversation.parent.name,
      parentAvatarUrl: conversation.parent.avatarUrl,
      staffId: conversation.staffId,
      staffName: conversation.staff.name,
      staffAvatarUrl: conversation.staff.avatarUrl,
      studentId: conversation.studentId,
      studentName: conversation.student ? `${conversation.student.firstName} ${conversation.student.lastName}` : null,
      className: conversation.student?.class?.name || null,
      schoolContactId: conversation.schoolContactId,
      schoolContactName: conversation.schoolContact?.name || null,
      schoolContactIcon: conversation.schoolContact?.icon || null,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
      muted,
      messages: conversation.messages.map(m => serializeMessage(m as Parameters<typeof serializeMessage>[0], user.id)),
    })
  } catch (error) {
    console.error('Error fetching conversation:', error)
    res.status(500).json({ error: 'Failed to fetch conversation' })
  }
})

// Create or resume conversation (parent)
router.post('/conversations', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }

    const { staffId, studentId, schoolContactId } = req.body

    if (!staffId) {
      return res.status(400).json({ error: 'staffId is required' })
    }

    // Verify staff is in same school
    const staffUser = await prisma.user.findFirst({
      where: { id: staffId, schoolId: user.schoolId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
    })
    if (!staffUser) {
      return res.status(400).json({ error: 'Invalid staff member' })
    }

    // Verify student belongs to parent (if provided)
    if (studentId) {
      const link = await prisma.parentStudentLink.findFirst({
        where: { userId: user.id, studentId },
      })
      if (!link) {
        return res.status(400).json({ error: 'Invalid student' })
      }
    }

    // Find or create conversation
    const existing = await prisma.conversation.findFirst({
      where: {
        parentId: user.id,
        staffId,
        studentId: studentId || null,
        schoolContactId: schoolContactId || null,
      },
    })

    if (existing) {
      // Un-archive if needed
      if (existing.archivedByParent) {
        await prisma.conversation.update({
          where: { id: existing.id },
          data: { archivedByParent: false },
        })
      }
      return res.json({ id: existing.id, created: false })
    }

    const conversation = await prisma.conversation.create({
      data: {
        schoolId: user.schoolId,
        parentId: user.id,
        staffId,
        studentId: studentId || null,
        schoolContactId: schoolContactId || null,
      },
    })

    res.status(201).json({ id: conversation.id, created: true })
  } catch (error) {
    console.error('Error creating conversation:', error)
    res.status(500).json({ error: 'Failed to create conversation' })
  }
})

// Send message in conversation
router.post('/conversations/:id/messages', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { content, attachments, replyToId } = req.body

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' })
    }

    // Verify user is participant
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        OR: [
          { parentId: user.id },
          { staffId: user.id },
          ...(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ schoolId: user.schoolId }] : []),
        ],
      },
      include: {
        parent: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        schoolContact: { select: { name: true } },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: id,
        senderId: user.id,
        content: content.trim(),
        ...(replyToId ? { replyToId } : {}),
      },
    })

    // Create attachments if any
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      await prisma.conversationAttachment.createMany({
        data: attachments.map((a: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => ({
          messageId: message.id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileType: a.fileType,
          fileSize: a.fileSize,
        })),
      })
    }

    // Update conversation denormalized fields (do NOT auto-unset archive for recipient)
    const updateData: Record<string, unknown> = {
      lastMessageAt: message.createdAt,
      lastMessageText: content.trim().substring(0, 200),
    }

    await prisma.conversation.update({
      where: { id },
      data: updateData,
    })

    // Send push notification to recipient
    const recipientId = user.id === conversation.parentId ? conversation.staffId : conversation.parentId
    const senderDisplayName = user.id === conversation.parentId
      ? conversation.parent.name
      : (conversation.schoolContact ? `${conversation.staff.name} (via ${conversation.schoolContact.name})` : conversation.staff.name)

    // Create notification record (always created regardless of mute)
    await prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'DIRECT_MESSAGE',
        title: `Message from ${senderDisplayName}`,
        body: content.trim().substring(0, 200),
        resourceType: 'CONVERSATION',
        resourceId: id,
        data: { conversationId: id, route: `/inbox/${id}` },
        schoolId: conversation.schoolId,
      },
    })

    // Check mute status before sending push notification
    const senderIsParent = user.id === conversation.parentId
    const recipientHasMuted = senderIsParent ? conversation.mutedByStaff : conversation.mutedByParent

    if (!recipientHasMuted) {
      // Send FCM push only if recipient hasn't muted
      const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId: recipientId },
        select: { token: true },
      })
      if (deviceTokens.length > 0) {
        const tokens = deviceTokens.map(dt => dt.token)
        const result = await sendPushNotification(tokens, {
          title: `Message from ${senderDisplayName}`,
          body: content.trim().substring(0, 200),
          data: {
            type: 'DIRECT_MESSAGE',
            resourceType: 'CONVERSATION',
            resourceId: id,
            route: `/inbox/${id}`,
          },
        })
        if (result.failedTokens.length > 0) {
          await removeInvalidTokens(result.failedTokens)
        }
      }
    }

    const createdAttachments = await prisma.conversationAttachment.findMany({
      where: { messageId: message.id },
    })

    res.status(201).json({
      id: message.id,
      senderId: message.senderId,
      senderName: user.name,
      content: message.content,
      readAt: null,
      createdAt: message.createdAt.toISOString(),
      attachments: createdAttachments.map(a => ({
        id: a.id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
      })),
    })
  } catch (error) {
    console.error('Error sending message:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Archive conversation (parent)
router.patch('/conversations/:id/archive', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: { id, OR: [{ parentId: user.id }, { staffId: user.id }] },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const field = user.id === conversation.parentId ? 'archivedByParent' : 'archivedByStaff'
    await prisma.conversation.update({
      where: { id },
      data: { [field]: true },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error archiving conversation:', error)
    res.status(500).json({ error: 'Failed to archive conversation' })
  }
})

// Mute/Unmute conversation
router.patch('/conversations/:id/mute', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { muted } = req.body

    if (typeof muted !== 'boolean') {
      return res.status(400).json({ error: 'muted (boolean) is required' })
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, OR: [{ parentId: user.id }, { staffId: user.id }] },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const field = user.id === conversation.parentId ? 'mutedByParent' : 'mutedByStaff'
    await prisma.conversation.update({
      where: { id },
      data: { [field]: muted },
    })

    res.json({ success: true, muted })
  } catch (error) {
    console.error('Error muting conversation:', error)
    res.status(500).json({ error: 'Failed to mute conversation' })
  }
})

// Message search within a conversation
router.get('/conversations/:id/search', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const q = req.query.q as string

    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Search query is required' })
    }

    // Verify user is participant
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        OR: [
          { parentId: user.id },
          ...(user.role !== 'PARENT' ? [{ staffId: user.id }] : []),
          ...(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ schoolId: user.schoolId }] : []),
        ],
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const messages = await prisma.conversationMessage.findMany({
      where: {
        conversationId: id,
        content: { contains: q.trim(), mode: 'insensitive' },
        deletedAt: null,
      },
      include: {
        sender: { select: { id: true, name: true } },
        attachments: true,
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
            sender: { select: { name: true } },
            deletedAt: true,
          },
        },
        reactions: { select: { emoji: true, userId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    res.json(messages.map(m => serializeMessage(m as Parameters<typeof serializeMessage>[0], user.id)))
  } catch (error) {
    console.error('Error searching messages:', error)
    res.status(500).json({ error: 'Failed to search messages' })
  }
})

// Delete message for everyone (soft delete)
router.delete('/conversations/:id/messages/:messageId', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id, messageId } = req.params

    const message = await prisma.conversationMessage.findFirst({
      where: { id: messageId, conversationId: id },
    })

    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    // Only the sender can delete
    if (message.senderId !== user.id) {
      return res.status(403).json({ error: 'Only the sender can delete a message' })
    }

    // Time limit: 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
    if (message.createdAt < fifteenMinutesAgo) {
      return res.status(403).json({ error: 'Messages can only be deleted within 15 minutes of sending' })
    }

    await prisma.conversationMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting message:', error)
    res.status(500).json({ error: 'Failed to delete message' })
  }
})

// React to a message
router.post('/conversations/:id/messages/:messageId/react', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id, messageId } = req.params
    const { emoji } = req.body

    if (!emoji || !ALLOWED_REACTION_EMOJIS.includes(emoji)) {
      return res.status(400).json({ error: `Invalid emoji. Allowed: ${ALLOWED_REACTION_EMOJIS.join(', ')}` })
    }

    // Verify the message exists in this conversation
    const message = await prisma.conversationMessage.findFirst({
      where: { id: messageId, conversationId: id },
    })
    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: user.id,
          emoji,
        },
      },
      update: {},
      create: {
        messageId,
        userId: user.id,
        emoji,
      },
    })

    res.json({ id: reaction.id, emoji: reaction.emoji })
  } catch (error) {
    console.error('Error reacting to message:', error)
    res.status(500).json({ error: 'Failed to react to message' })
  }
})

// Remove a reaction
router.delete('/conversations/:id/messages/:messageId/react/:emoji', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { messageId, emoji } = req.params

    await prisma.messageReaction.deleteMany({
      where: {
        messageId,
        userId: user.id,
        emoji,
      },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error removing reaction:', error)
    res.status(500).json({ error: 'Failed to remove reaction' })
  }
})

// Export conversation as text file
router.get('/conversations/:id/export', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        OR: [
          { parentId: user.id },
          ...(user.role !== 'PARENT' ? [{ staffId: user.id }] : []),
          ...(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ schoolId: user.schoolId }] : []),
        ],
      },
      include: {
        staff: { select: { name: true } },
        parent: { select: { name: true } },
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        messages: {
          where: { deletedAt: null },
          include: {
            sender: { select: { name: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const exportDate = new Date().toISOString().split('T')[0]
    const studentInfo = conversation.student
      ? `${conversation.student.firstName} ${conversation.student.lastName} - ${conversation.student.class?.name || 'N/A'}`
      : 'N/A'

    let output = `Conversation with ${conversation.staff.name}\n`
    output += `Regarding: ${studentInfo}\n`
    output += `Exported: ${exportDate}\n`
    output += `---\n`

    for (const m of conversation.messages) {
      const date = m.createdAt.toISOString().split('T')[0]
      const time = m.createdAt.toISOString().split('T')[1].substring(0, 5)
      output += `\n${date} ${time} - ${m.sender.name}:\n`
      output += `${m.content}\n`
      for (const a of m.attachments) {
        output += `(Attachment: ${a.fileName})\n`
      }
    }

    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Content-Disposition', `attachment; filename="conversation-export-${exportDate}.txt"`)
    res.send(output)
  } catch (error) {
    console.error('Error exporting conversation:', error)
    res.status(500).json({ error: 'Failed to export conversation' })
  }
})

// Typing indicator
router.post('/conversations/:id/typing', isAuthenticated, async (req, res) => {
  const { id } = req.params
  setTyping(id, req.user!.id)
  res.json({ ok: true })
})

// Get typing status for a conversation
router.get('/conversations/:id/typing', isAuthenticated, async (req, res) => {
  const { id } = req.params
  const userIds = getTypingUsers(id, req.user!.id)
  res.json({ typing: userIds.length > 0, userIds })
})

// Get available contacts for parent (teachers + school contacts)
router.get('/contacts/available', isAuthenticated, async (req, res) => {
  try {
    const baseUser = req.user!
    if (baseUser.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }
    const user = (await loadUserWithRelations(baseUser.id))!

    // Get children's class IDs from both studentLinks and legacy children
    const studentLinks = user.studentLinks || []
    const legacyChildren = user.children || []

    // Build a unified children list with classIds
    const childrenInfo: Array<{ studentId: string; studentName: string; classId: string; className: string }> = []
    const classIdSet = new Set<string>()

    for (const l of studentLinks) {
      classIdSet.add(l.student.classId)
      childrenInfo.push({
        studentId: l.studentId,
        studentName: `${l.student.firstName} ${l.student.lastName}`,
        classId: l.student.classId,
        className: l.student.class.name,
      })
    }

    // Fall back to legacy children if no studentLinks
    if (studentLinks.length === 0 && legacyChildren.length > 0) {
      for (const c of legacyChildren) {
        classIdSet.add(c.classId)
        childrenInfo.push({
          studentId: c.id,
          studentName: c.name,
          classId: c.classId,
          className: c.class.name,
        })
      }
    }

    const classIds = [...classIdSet]

    // Get teachers assigned to those classes
    const staffAssignments = classIds.length > 0
      ? await prisma.staffClassAssignment.findMany({
          where: { classId: { in: classIds } },
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            class: { select: { id: true, name: true } },
          },
        })
      : []

    // Group by teacher
    const teacherMap = new Map<string, { id: string; name: string; avatarUrl: string | null; classes: Array<{ id: string; name: string }> }>()
    for (const sa of staffAssignments) {
      const existing = teacherMap.get(sa.userId)
      if (existing) {
        existing.classes.push({ id: sa.class.id, name: sa.class.name })
      } else {
        teacherMap.set(sa.userId, {
          id: sa.user.id,
          name: sa.user.name,
          avatarUrl: sa.user.avatarUrl,
          classes: [{ id: sa.class.id, name: sa.class.name }],
        })
      }
    }

    // Get school contacts
    const schoolContacts = await prisma.schoolContact.findMany({
      where: { schoolId: user.schoolId, archived: false },
      include: {
        assignedUser: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { order: 'asc' },
    })

    const children = childrenInfo

    res.json({
      teachers: Array.from(teacherMap.values()),
      schoolContacts: schoolContacts.map(sc => ({
        id: sc.id,
        name: sc.name,
        description: sc.description,
        icon: sc.icon,
        assignedUserId: sc.assignedUserId,
        assignedUserName: sc.assignedUser.name,
      })),
      children,
    })
  } catch (error) {
    console.error('Error fetching available contacts:', error)
    res.status(500).json({ error: 'Failed to fetch contacts' })
  }
})

// ==========================================
// Staff/Admin endpoints
// ==========================================

// List staff conversations
router.get('/staff/conversations', isStaff, async (req, res) => {
  try {
    const user = req.user!
    const { classId } = req.query

    const isAdminUser = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    const where: Record<string, unknown> = {
      archivedByStaff: false,
    }

    if (isAdminUser) {
      where.schoolId = user.schoolId
    } else {
      where.staffId = user.id
    }

    // Filter by class if specified
    if (classId && typeof classId === 'string') {
      where.student = { classId }
    }

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true, avatarUrl: true } },
        staff: { select: { id: true, name: true } },
        student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
        schoolContact: { select: { id: true, name: true, icon: true } },
        messages: {
          where: { senderId: { not: user.id }, readAt: null },
          select: { id: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    res.json(conversations.map(c => ({
      id: c.id,
      parentId: c.parentId,
      parentName: c.parent.name,
      parentAvatarUrl: c.parent.avatarUrl,
      staffId: c.staffId,
      staffName: c.staff.name,
      studentId: c.studentId,
      studentName: c.student ? `${c.student.firstName} ${c.student.lastName}` : null,
      className: c.student?.class?.name || null,
      schoolContactId: c.schoolContactId,
      schoolContactName: c.schoolContact?.name || null,
      schoolContactIcon: c.schoolContact?.icon || null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      lastMessageText: c.lastMessageText,
      unreadCount: c.messages.length,
      muted: c.mutedByStaff,
      createdAt: c.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching staff conversations:', error)
    res.status(500).json({ error: 'Failed to fetch conversations' })
  }
})

// Staff initiates conversation
router.post('/staff/conversations', isStaff, async (req, res) => {
  try {
    const user = req.user!
    const { parentId, studentId } = req.body

    if (!parentId) {
      return res.status(400).json({ error: 'parentId is required' })
    }

    // Verify parent is in same school
    const parentUser = await prisma.user.findFirst({
      where: { id: parentId, schoolId: user.schoolId, role: 'PARENT' },
    })
    if (!parentUser) {
      return res.status(400).json({ error: 'Invalid parent' })
    }

    // Find or create conversation
    const existing = await prisma.conversation.findFirst({
      where: {
        parentId,
        staffId: user.id,
        studentId: studentId || null,
        schoolContactId: null,
      },
    })

    if (existing) {
      if (existing.archivedByStaff) {
        await prisma.conversation.update({
          where: { id: existing.id },
          data: { archivedByStaff: false },
        })
      }
      return res.json({ id: existing.id, created: false })
    }

    const conversation = await prisma.conversation.create({
      data: {
        schoolId: user.schoolId,
        parentId,
        staffId: user.id,
        studentId: studentId || null,
      },
    })

    res.status(201).json({ id: conversation.id, created: true })
  } catch (error) {
    console.error('Error creating staff conversation:', error)
    res.status(500).json({ error: 'Failed to create conversation' })
  }
})

// ==========================================
// Shared endpoints
// ==========================================

// Unread count
router.get('/unread-count', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const isParent = user.role === 'PARENT'
    const isAdminUser = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    const conversations = await prisma.conversation.findMany({
      where: {
        ...(isParent
          ? { parentId: user.id, archivedByParent: false }
          : isAdminUser
            ? { schoolId: user.schoolId, archivedByStaff: false }
            : { staffId: user.id, archivedByStaff: false }
        ),
      },
      select: { id: true },
    })

    if (conversations.length === 0) {
      return res.json({ count: 0 })
    }

    const count = await prisma.conversationMessage.count({
      where: {
        conversationId: { in: conversations.map(c => c.id) },
        senderId: { not: user.id },
        readAt: null,
      },
    })

    res.json({ count })
  } catch (error) {
    console.error('Error fetching unread count:', error)
    res.status(500).json({ error: 'Failed to fetch unread count' })
  }
})

// Upload attachment (reuses existing R2/multer pattern) — with filename sanitization
router.post('/upload', isAuthenticated, attachmentUpload.single('file'), async (req, res) => {
  try {
    const uploaded = req.file
    if (!uploaded) {
      return res.status(400).json({ error: 'File is required' })
    }

    if (!ATTACHMENT_MIME_TYPES.includes(uploaded.mimetype)) {
      return res.status(400).json({ error: 'File type not allowed' })
    }

    const safeName = uploaded.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `inbox-attachments/${Date.now()}-${safeName}`
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

// ==========================================
// Admin contact management
// ==========================================

// List school contacts
router.get('/contacts', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const contacts = await prisma.schoolContact.findMany({
      where: { schoolId: user.schoolId },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { order: 'asc' },
    })

    res.json(contacts.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      icon: c.icon,
      assignedUserId: c.assignedUserId,
      assignedUserName: c.assignedUser.name,
      assignedUserEmail: c.assignedUser.email,
      order: c.order,
      archived: c.archived,
      createdAt: c.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching contacts:', error)
    res.status(500).json({ error: 'Failed to fetch contacts' })
  }
})

// Create school contact
router.post('/contacts', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, description, icon, assignedUserId, order } = req.body

    if (!name || !assignedUserId) {
      return res.status(400).json({ error: 'name and assignedUserId are required' })
    }

    // Verify assigned user is staff in same school
    const staffUser = await prisma.user.findFirst({
      where: { id: assignedUserId, schoolId: user.schoolId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
    })
    if (!staffUser) {
      return res.status(400).json({ error: 'Invalid staff member' })
    }

    const contact = await prisma.schoolContact.create({
      data: {
        schoolId: user.schoolId,
        name,
        description: description || null,
        icon: icon || null,
        assignedUserId,
        order: order ?? 0,
      },
    })

    res.status(201).json({
      id: contact.id,
      name: contact.name,
      description: contact.description,
      icon: contact.icon,
      assignedUserId: contact.assignedUserId,
      assignedUserName: staffUser.name,
      order: contact.order,
      archived: contact.archived,
      createdAt: contact.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating contact:', error)
    res.status(500).json({ error: 'Failed to create contact' })
  }
})

// Update school contact
router.put('/contacts/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { name, description, icon, assignedUserId, order } = req.body

    const existing = await prisma.schoolContact.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' })
    }

    if (assignedUserId) {
      const staffUser = await prisma.user.findFirst({
        where: { id: assignedUserId, schoolId: user.schoolId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
      })
      if (!staffUser) {
        return res.status(400).json({ error: 'Invalid staff member' })
      }
    }

    const contact = await prisma.schoolContact.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(icon !== undefined && { icon: icon || null }),
        ...(assignedUserId !== undefined && { assignedUserId }),
        ...(order !== undefined && { order }),
      },
      include: {
        assignedUser: { select: { id: true, name: true } },
      },
    })

    res.json({
      id: contact.id,
      name: contact.name,
      description: contact.description,
      icon: contact.icon,
      assignedUserId: contact.assignedUserId,
      assignedUserName: contact.assignedUser.name,
      order: contact.order,
      archived: contact.archived,
      createdAt: contact.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating contact:', error)
    res.status(500).json({ error: 'Failed to update contact' })
  }
})

// Archive school contact
router.delete('/contacts/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.schoolContact.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' })
    }

    await prisma.schoolContact.update({
      where: { id },
      data: { archived: true },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error archiving contact:', error)
    res.status(500).json({ error: 'Failed to archive contact' })
  }
})

export default router
