import { Router } from 'express'
import multer from 'multer'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, isStaff, loadUserWithRelations } from '../middleware/auth.js'
import { uploadFile, generateKey } from '../services/storage.js'
import { checkUpload } from '../services/uploadValidation.js'
import { sendPushNotification, removeInvalidTokens } from '../services/firebase.js'
import { getInboxUnreadCount, getPushBadgeCount } from '../services/unreadCount.js'
import { teachingStaffForClasses, timetableLookupPossible } from '../services/classTeachingStaff.js'
import { todayInTimezone } from '../services/dateTime.js'

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

    // A parent sees their OWN threads (parentId) plus any thread SHARED with them
    // as an added guardian (a participant row with archivedAt: null). For a shared
    // thread the added guardian's own muted/archived/lastReadAt drive the view —
    // never the primary parent's flags or ConversationMessage.readAt.
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { parentId: user.id, archivedByParent: false },
          { participants: { some: { userId: user.id, archivedAt: null } } },
        ],
      },
      include: {
        staff: { select: { id: true, name: true, avatarUrl: true } },
        student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
        schoolContact: { select: { id: true, name: true, icon: true } },
        participants: { where: { userId: user.id }, select: { mutedAt: true, lastReadAt: true } },
        messages: {
          where: { senderId: { not: user.id }, deletedAt: null },
          select: { readAt: true, createdAt: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    res.json(conversations.map(c => {
      const isPrimary = c.parentId === user.id
      const myParticipant = c.participants[0]
      // Primary parent: unread = inbound messages with no readAt (two-party read
      // model). Added guardian: inbound messages newer than their lastReadAt
      // (null lastReadAt ⇒ everything counts).
      const unreadCount = isPrimary
        ? c.messages.filter(m => m.readAt === null).length
        : c.messages.filter(m => (myParticipant?.lastReadAt ? m.createdAt > myParticipant.lastReadAt : true)).length
      const muted = isPrimary ? c.mutedByParent : myParticipant?.mutedAt != null
      return {
        id: c.id,
        // Thread kind: "STAFF" (teacher/office) or "ILSA" (private parent↔ILSA).
        // Lets the parent app badge an ILSA thread + label its counterpart as the
        // "Learning Support Assistant" rather than a teacher.
        kind: c.kind,
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
        unreadCount,
        muted,
        // True when this thread was shared with the requester as a co-guardian
        // (they are an added participant, not the primary parent).
        shared: !isPrimary || undefined,
        createdAt: c.createdAt.toISOString(),
      }
    }))
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
          { participants: { some: { userId: user.id } } },
          // Admin school-wide override is limited to STAFF threads — a private
          // parent↔ILSA thread is reachable by an admin ONLY via the audited
          // oversight route, never the native inbox (ADR 0006, #2/#4).
          ...(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ schoolId: user.schoolId, kind: 'STAFF' }] : []),
        ],
      },
      include: {
        staff: { select: { id: true, name: true, avatarUrl: true } },
        parent: { select: { id: true, name: true, avatarUrl: true } },
        student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
        schoolContact: { select: { id: true, name: true, icon: true } },
        participants: { select: { id: true, userId: true, role: true, mutedAt: true, user: { select: { name: true } } } },
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

    const isPrimaryParent = user.id === conversation.parentId
    const isStaffParty = user.id === conversation.staffId
    const myParticipant = conversation.participants.find(p => p.userId === user.id)

    if (myParticipant && !isPrimaryParent && !isStaffParty) {
      // Added guardian: their read-state lives on the participant row, not on the
      // two-party ConversationMessage.readAt (which stays the primary read model).
      await prisma.conversationParticipant.update({
        where: { id: myParticipant.id },
        data: { lastReadAt: new Date() },
      })
    } else {
      // Primary parent / staff / admin: mark incoming messages as read.
      await prisma.conversationMessage.updateMany({
        where: {
          conversationId: id,
          senderId: { not: user.id },
          readAt: null,
        },
        data: { readAt: new Date() },
      })
    }

    const muted = myParticipant && !isPrimaryParent && !isStaffParty
      ? myParticipant.mutedAt != null
      : isPrimaryParent ? conversation.mutedByParent : conversation.mutedByStaff

    res.json({
      id: conversation.id,
      // "STAFF" or "ILSA" — lets the parent app badge/label the thread's kind.
      kind: conversation.kind,
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
      // Additional people on this thread with their role, so the parent UI can
      // separate co-guardians (PARENT) from CC'd staff (STAFF). `shared` = the
      // requester is one of them (an added guardian) rather than the owner.
      participants: conversation.participants.map(p => ({ userId: p.userId, name: p.user.name, role: p.role })),
      shared: !!myParticipant && !isPrimaryParent && !isStaffParty,
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

    // The counterpart is either a staff member OR the pupil's ILSA (a role-ILSA
    // user the parent may start a PRIVATE thread with). Resolve the target and
    // decide the thread `kind`. A parent may never open an ILSA thread for a
    // pupil that isn't theirs, nor with a deactivated ILSA.
    const targetUser = await prisma.user.findFirst({
      where: { id: staffId, schoolId: user.schoolId },
      select: { id: true, role: true },
    })
    if (!targetUser) {
      return res.status(400).json({ error: 'Invalid recipient' })
    }

    let kind: 'STAFF' | 'ILSA'
    if (['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(targetUser.role)) {
      kind = 'STAFF'
    } else if (targetUser.role === 'ILSA') {
      // ILSA thread: require a student the parent guardians AND an ACTIVE link
      // between that ILSA and that exact pupil.
      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required to message a Learning Support Assistant' })
      }
      const link = await prisma.ilsaLink.findFirst({
        where: { userId: staffId, studentId, active: true },
        select: { id: true },
      })
      if (!link) {
        return res.status(400).json({ error: 'Invalid Learning Support Assistant for this pupil' })
      }
      kind = 'ILSA'
    } else {
      return res.status(400).json({ error: 'Invalid recipient' })
    }

    // Verify student belongs to parent (if provided). Always enforced above for
    // an ILSA thread; here it also covers a staff thread that names a student.
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
        kind,
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
        kind,
      },
    })

    res.status(201).json({ id: conversation.id, created: true })
  } catch (error) {
    console.error('Error creating conversation:', error)
    res.status(500).json({ error: 'Failed to create conversation' })
  }
})

// Send message in conversation
// Where-clause matching a conversation the requester participates in (or is an
// admin for). Used to gate every per-conversation action. An added participant
// (Phase 1: a co-guardian the primary parent opted to share the thread with) is
// an authorized reader/sender via the `participants` relation.
function participantWhere(id: string, user: Express.User) {
  return {
    id,
    OR: [
      { parentId: user.id },
      { staffId: user.id },
      { participants: { some: { userId: user.id } } },
      // Admin school-wide override is limited to STAFF threads — an admin acts on
      // a parent↔ILSA thread ONLY via the audited oversight route (read-only),
      // never by posting/archiving/muting through the native inbox.
      ...(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ schoolId: user.schoolId, kind: 'STAFF' }] : []),
    ],
  }
}

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
      where: participantWhere(id, user),
      include: {
        parent: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        schoolContact: { select: { name: true } },
        participants: { select: { userId: true, mutedAt: true } },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    // Validate the reply target belongs to THIS conversation — otherwise a
    // participant could quote (and surface) a message from another, possibly
    // cross-tenant, conversation via the reply preview.
    if (replyToId) {
      const replyTarget = await prisma.conversationMessage.findFirst({
        where: { id: replyToId, conversationId: id },
        select: { id: true },
      })
      if (!replyTarget) return res.status(400).json({ error: 'Invalid reply target' })
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

    // Fan-out: notify EVERYONE in the thread except the sender — primary parent,
    // staff, and every added participant (co-guardians) — deduped by userId. The
    // sender may be the primary parent, the staff member, or an added guardian.
    const senderIsParent = user.id === conversation.parentId
    const senderIsStaff = user.id === conversation.staffId
    const senderDisplayName = senderIsStaff
      ? (conversation.schoolContact ? `${conversation.staff.name} (via ${conversation.schoolContact.name})` : conversation.staff.name)
      : senderIsParent
        ? conversation.parent.name
        : user.name // an added guardian replying

    // Each recipient carries their OWN mute state: primary flags for the primary
    // parent/staff, the participant row's mutedAt for added guardians.
    const recipients: Array<{ userId: string; muted: boolean }> = []
    if (conversation.parentId !== user.id) recipients.push({ userId: conversation.parentId, muted: conversation.mutedByParent })
    if (conversation.staffId !== user.id) recipients.push({ userId: conversation.staffId, muted: conversation.mutedByStaff })
    for (const p of conversation.participants ?? []) {
      if (p.userId !== user.id) recipients.push({ userId: p.userId, muted: p.mutedAt != null })
    }
    // Dedupe by userId (a user should only appear once as a recipient).
    const seenRecipients = new Set<string>()
    const dedupedRecipients = recipients.filter(r => {
      if (seenRecipients.has(r.userId)) return false
      seenRecipients.add(r.userId)
      return true
    })

    // Notification rows are always created regardless of mute.
    for (const r of dedupedRecipients) {
      await prisma.notification.create({
        data: {
          userId: r.userId,
          type: 'DIRECT_MESSAGE',
          title: `Message from ${senderDisplayName}`,
          body: content.trim().substring(0, 200),
          resourceType: 'CONVERSATION',
          resourceId: id,
          data: { conversationId: id, route: `/inbox/${id}` },
          schoolId: conversation.schoolId,
        },
      })
    }

    // Email teacher when parent starts a new exchange (first message ever, or no messages in 24h)
    if (senderIsParent) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recentMessages = await prisma.conversationMessage.count({
        where: {
          conversationId: id,
          id: { not: message.id }, // Exclude the message we just created
          createdAt: { gte: twentyFourHoursAgo },
        },
      })
      // Send email if no other messages in the last 24 hours
      if (recentMessages === 0) {
        const ADMIN_APP_URL = process.env.ADMIN_APP_URL || process.env.ADMIN_URL || 'http://localhost:3001'
        const inboxLink = `${ADMIN_APP_URL}/inbox`
        const staffEmail = await prisma.user.findUnique({
          where: { id: conversation.staffId },
          select: { email: true },
        })
        if (staffEmail?.email) {
          const { enqueueEmail } = await import('../services/outbox.js')
          const school = await prisma.school.findUnique({ where: { id: conversation.schoolId }, select: { name: true } })
          await enqueueEmail(conversation.schoolId, {
            to: staffEmail.email,
            subject: `New message from ${conversation.parent.name} — ${school?.name || 'School'}`,
            html: `<div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
              <h2 style="color: #2D2225; margin: 0 0 4px;">New Parent Message</h2>
              <p style="color: #7A6469; font-size: 14px; margin: 0 0 20px;">${school?.name || 'School'}</p>
              <div style="background: #FAF8F6; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                <p style="color: #7A6469; font-size: 13px; margin: 0 0 6px; font-weight: 600;">From: ${conversation.parent.name}</p>
                <p style="color: #2D2225; font-size: 15px; line-height: 1.5; margin: 0;">${content.trim()}</p>
              </div>
              <p style="color: #A8929A; font-size: 13px; margin: 0 0 16px; font-style: italic;">
                Please do not reply to this email. To respond, use the admin portal.
              </p>
              <div style="text-align: center;">
                <a href="${inboxLink}" style="display: inline-block; background-color: #C4506E; color: white; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14px;">
                  Reply in Admin Portal
                </a>
              </div>
            </div>`,
            text: `New message from ${conversation.parent.name}\n\n"${content.trim()}"\n\nPlease do not reply to this email. Reply in the admin portal: ${inboxLink}`,
          })
        }
      }
    }

    // Send FCM push to each recipient that hasn't muted this thread.
    for (const r of dedupedRecipients) {
      if (r.muted) continue
      const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId: r.userId },
        select: { token: true },
      })
      if (deviceTokens.length > 0) {
        const tokens = deviceTokens.map(dt => dt.token)
        // The recipient's OWN unread total, now including the message just
        // created - the number their device should badge with. Per recipient,
        // and undefined (badge omitted) if it can't be worked out.
        const badge = await getPushBadgeCount(r.userId)
        const result = await sendPushNotification(tokens, {
          title: `Message from ${senderDisplayName}`,
          body: content.trim().substring(0, 200),
          data: {
            type: 'DIRECT_MESSAGE',
            resourceType: 'CONVERSATION',
            resourceId: id,
            route: `/inbox/${id}`,
          },
          badge,
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
      where: { id, OR: [{ parentId: user.id }, { staffId: user.id }, { participants: { some: { userId: user.id } } }] },
      include: { participants: { where: { userId: user.id }, select: { id: true } } },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const isPrimaryParent = user.id === conversation.parentId
    const isStaffParty = user.id === conversation.staffId
    const myParticipant = conversation.participants[0]

    if (myParticipant && !isPrimaryParent && !isStaffParty) {
      // Added guardian archives their own view via their participant row.
      await prisma.conversationParticipant.update({
        where: { id: myParticipant.id },
        data: { archivedAt: new Date() },
      })
    } else {
      const field = isPrimaryParent ? 'archivedByParent' : 'archivedByStaff'
      await prisma.conversation.update({
        where: { id },
        data: { [field]: true },
      })
    }

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
      where: { id, OR: [{ parentId: user.id }, { staffId: user.id }, { participants: { some: { userId: user.id } } }] },
      include: { participants: { where: { userId: user.id }, select: { id: true } } },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const isPrimaryParent = user.id === conversation.parentId
    const isStaffParty = user.id === conversation.staffId
    const myParticipant = conversation.participants[0]

    if (myParticipant && !isPrimaryParent && !isStaffParty) {
      // Added guardian mutes/unmutes their own view via their participant row.
      await prisma.conversationParticipant.update({
        where: { id: myParticipant.id },
        data: { mutedAt: muted ? new Date() : null },
      })
    } else {
      const field = isPrimaryParent ? 'mutedByParent' : 'mutedByStaff'
      await prisma.conversation.update({
        where: { id },
        data: { [field]: muted },
      })
    }

    res.json({ success: true, muted })
  } catch (error) {
    console.error('Error muting conversation:', error)
    res.status(500).json({ error: 'Failed to mute conversation' })
  }
})

// ==========================================
// Co-guardian thread sharing (Phase 1)
// ==========================================
//
// A thread's PRIMARY parent (`parentId`) may OPT-IN to share ONE child-specific
// thread with another LINKED GUARDIAN of that same child. Strictly opt-in and
// safeguarding-sensitive: separated/divorced guardians must never see each
// other's threads unless deliberately shared. The added guardian can read,
// reply, mute, and leave; only the primary parent can add/remove others.

// Build the shared { student, addable, participants } response for a thread the
// requester is the PRIMARY parent of. `conversation` must already be verified as
// owned by the requester (parentId === requester).
async function buildGuardiansResponse(conversation: {
  id: string
  parentId: string
  studentId: string | null
  schoolId: string
  student: { id: string; firstName: string; lastName: string } | null
  participants: Array<{ userId: string; user: { name: string } }>
}) {
  const student = conversation.student
    ? { id: conversation.student.id, name: `${conversation.student.firstName} ${conversation.student.lastName}` }
    : null
  const participants = conversation.participants.map(p => ({ userId: p.userId, name: p.user.name }))

  let addable: Array<{ userId: string; name: string }> = []
  if (conversation.studentId) {
    const excluded = new Set<string>([conversation.parentId, ...participants.map(p => p.userId)])
    const links = await prisma.parentStudentLink.findMany({
      where: {
        studentId: conversation.studentId,
        user: { schoolId: conversation.schoolId, role: 'PARENT' },
      },
      select: { userId: true, user: { select: { name: true } } },
    })
    addable = links
      .filter(l => !excluded.has(l.userId))
      .map(l => ({ userId: l.userId, name: l.user.name }))
  }

  return { student, addable, participants }
}

// List the student, addable co-guardians, and currently-added participants.
router.get('/conversations/:id/guardians', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }
    const { id } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: { id, parentId: user.id },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        participants: { select: { userId: true, user: { select: { name: true } } } },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    res.json(await buildGuardiansResponse(conversation))
  } catch (error) {
    console.error('Error fetching conversation guardians:', error)
    res.status(500).json({ error: 'Failed to fetch guardians' })
  }
})

// Share the thread with another linked guardian of the thread's student.
router.post('/conversations/:id/guardians', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }
    const { id } = req.params
    const { userId } = req.body

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' })
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, parentId: user.id },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        participants: { select: { userId: true, user: { select: { name: true } } } },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    if (!conversation.studentId) {
      return res.status(400).json({ error: 'This conversation is not about a student and cannot be shared' })
    }

    if (userId === conversation.parentId) {
      return res.status(400).json({ error: 'Cannot add the primary parent' })
    }

    // Idempotent-ish: adding an existing participant is a no-op success.
    const already = conversation.participants.some(p => p.userId === userId)
    if (already) {
      return res.json(await buildGuardiansResponse(conversation))
    }

    // The target must be a linked guardian of this student, in the same school.
    const link = await prisma.parentStudentLink.findFirst({
      where: {
        userId,
        studentId: conversation.studentId,
        user: { schoolId: user.schoolId, role: 'PARENT' },
      },
      select: { id: true },
    })
    if (!link) {
      return res.status(400).json({ error: 'User is not a linked guardian of this student' })
    }

    await prisma.conversationParticipant.create({
      data: {
        conversationId: id,
        userId,
        role: 'PARENT',
        addedById: user.id,
      },
    })

    // Re-read participants for the fresh list.
    const refreshed = await prisma.conversation.findFirst({
      where: { id, parentId: user.id },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        participants: { select: { userId: true, user: { select: { name: true } } } },
      },
    })

    res.json(await buildGuardiansResponse(refreshed!))
  } catch (error) {
    console.error('Error adding conversation guardian:', error)
    res.status(500).json({ error: 'Failed to add guardian' })
  }
})

// Remove a shared guardian — allowed if the requester is the PRIMARY parent
// (removing someone) OR is that same participant (leaving).
router.delete('/conversations/:id/guardians/:userId', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }
    const { id, userId } = req.params

    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId: id, userId },
      select: { id: true, conversation: { select: { parentId: true } } },
    })

    // 404 (not 403) when the row doesn't exist or the requester is neither the
    // primary parent nor the participant themselves — never leak existence.
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' })
    }
    const isPrimaryParent = participant.conversation.parentId === user.id
    const isSelfLeaving = userId === user.id
    if (!isPrimaryParent && !isSelfLeaving) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    await prisma.conversationParticipant.delete({ where: { id: participant.id } })

    res.json({ success: true })
  } catch (error) {
    console.error('Error removing conversation guardian:', error)
    res.status(500).json({ error: 'Failed to remove guardian' })
  }
})

// ==========================================
// Staff CC (Phase 2)
// ==========================================
//
// A thread's PRIMARY parent (`parentId`) may add an ADDITIONAL staff member (a
// "CC") as a STAFF-role participant. The CC'd staff can read + reply, and the
// thread appears in BOTH their Connect staff inbox and their Desk inbox. The
// parent may only CC staff they are already allowed to contact — the exact
// bounded set surfaced by `GET /inbox/contacts/available` (a teacher of one of
// their children's classes, or a published school-contact assignee).

// The classIds of the parent's children — via ParentStudentLink first, falling
// back to the legacy Child relation (mirrors `/contacts/available`).
async function parentChildrenClassIds(parentUserId: string): Promise<string[]> {
  const links = await prisma.parentStudentLink.findMany({
    where: { userId: parentUserId },
    select: { student: { select: { classId: true } } },
  })
  const set = new Set<string>(links.map(l => l.student.classId))
  if (links.length === 0) {
    const children = await prisma.child.findMany({
      where: { parentId: parentUserId },
      select: { classId: true },
    })
    for (const c of children) set.add(c.classId)
  }
  return [...set]
}

// The bounded set of staff a parent may contact / CC: teachers assigned to one
// of their children's classes (StaffClassAssignment), the specialists who take
// those classes on the published timetable, PLUS the assignees of the school's
// published (non-archived) SchoolContacts. Deduped by userId, each with a
// display name. Mirrors the same three sources as `/contacts/available` — the
// two lists must stay identical, or a parent could see a contact they then
// can't CC (or vice versa).
async function contactableStaff(parentUserId: string, schoolId: string): Promise<Array<{ userId: string; name: string }>> {
  const classIds = await parentChildrenClassIds(parentUserId)
  const byId = new Map<string, string>()
  if (classIds.length > 0) {
    const assignments = await prisma.staffClassAssignment.findMany({
      where: { classId: { in: classIds } },
      select: { userId: true, user: { select: { name: true } } },
    })
    for (const a of assignments) byId.set(a.userId, a.user.name)

    // Specialist teachers, off the class timetable. Best-effort: a Hub blip
    // narrows the set back to class teachers rather than failing the request.
    try {
      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { hubSchoolId: true, timezone: true },
      })
      if (timetableLookupPossible(school?.hubSchoolId)) {
        const classRows = await prisma.class.findMany({
          where: { id: { in: classIds } },
          select: { id: true, hubClassId: true },
        })
        const specialists = await teachingStaffForClasses(
          schoolId,
          classRows.map(c => ({ classId: c.id, hubClassId: c.hubClassId })),
          { hubSchoolId: school?.hubSchoolId ?? null, today: todayInTimezone(school?.timezone ?? 'UTC') },
        )
        for (const list of specialists.values()) {
          for (const s of list) byId.set(s.userId, s.name)
        }
      }
    } catch (error) {
      console.error('Specialist-teacher lookup failed (contactable set unaffected):', error)
    }
  }
  const contacts = await prisma.schoolContact.findMany({
    where: { schoolId, archived: false },
    select: { assignedUserId: true, assignedUser: { select: { name: true } } },
  })
  for (const c of contacts) byId.set(c.assignedUserId, c.assignedUser.name)
  return [...byId.entries()].map(([userId, name]) => ({ userId, name }))
}

// Security gate: is `staffUserId` a staff member this parent is allowed to CC?
// The target must be a real same-school STAFF/ADMIN/SUPER_ADMIN user AND fall
// within the parent's `contactableStaff` set — never arbitrary staff.
async function isStaffContactableByParent(parentUserId: string, schoolId: string, staffUserId: string): Promise<boolean> {
  const staffUser = await prisma.user.findFirst({
    where: { id: staffUserId, schoolId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  })
  if (!staffUser) return false
  const set = await contactableStaff(parentUserId, schoolId)
  return set.some(s => s.userId === staffUserId)
}

// Build the { addable, participants } response for a thread the requester is the
// PRIMARY parent of. `participants` = current STAFF-role participants; `addable`
// = the parent's contactable staff MINUS the primary staffId MINUS anyone
// already participating.
async function buildStaffResponse(conversation: {
  parentId: string
  staffId: string
  schoolId: string
  participants: Array<{ userId: string; role: string; user: { name: string } }>
}) {
  const participants = conversation.participants
    .filter(p => p.role === 'STAFF')
    .map(p => ({ userId: p.userId, name: p.user.name }))
  const contactable = await contactableStaff(conversation.parentId, conversation.schoolId)
  const excluded = new Set<string>([conversation.staffId, ...conversation.participants.map(p => p.userId)])
  const addable = contactable.filter(s => !excluded.has(s.userId))
  return { addable, participants }
}

// List the STAFF CCs on the thread + the staff the parent could still add.
router.get('/conversations/:id/staff', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }
    const { id } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: { id, parentId: user.id },
      include: {
        participants: { select: { userId: true, role: true, user: { select: { name: true } } } },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    res.json(await buildStaffResponse(conversation))
  } catch (error) {
    console.error('Error fetching conversation staff:', error)
    res.status(500).json({ error: 'Failed to fetch staff' })
  }
})

// CC an additional staff member onto the thread (primary parent only).
router.post('/conversations/:id/staff', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }
    const { id } = req.params
    const { userId } = req.body

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' })
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, parentId: user.id },
      include: {
        participants: { select: { userId: true, role: true, user: { select: { name: true } } } },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    // The primary staff member is already on the thread.
    if (userId === conversation.staffId) {
      return res.status(400).json({ error: 'This staff member is already on the conversation' })
    }

    // Idempotent: adding an existing participant is a no-op success.
    const already = conversation.participants.some(p => p.userId === userId)
    if (already) {
      return res.json(await buildStaffResponse(conversation))
    }

    // Security gate — the parent may only CC staff they are allowed to contact.
    const contactable = await isStaffContactableByParent(user.id, user.schoolId, userId)
    if (!contactable) {
      return res.status(400).json({ error: 'This staff member cannot be added to this conversation' })
    }

    await prisma.conversationParticipant.create({
      data: {
        conversationId: id,
        userId,
        role: 'STAFF',
        addedById: user.id,
      },
    })

    const refreshed = await prisma.conversation.findFirst({
      where: { id, parentId: user.id },
      include: {
        participants: { select: { userId: true, role: true, user: { select: { name: true } } } },
      },
    })

    res.json(await buildStaffResponse(refreshed!))
  } catch (error) {
    console.error('Error adding conversation staff:', error)
    res.status(500).json({ error: 'Failed to add staff' })
  }
})

// Remove a STAFF CC (primary parent only). 404 (not 403) when there's no
// matching STAFF participant row or the requester isn't the primary parent —
// never leak existence.
router.delete('/conversations/:id/staff/:userId', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Parent access required' })
    }
    const { id, userId } = req.params

    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId: id, userId, role: 'STAFF' },
      select: { id: true, conversation: { select: { parentId: true } } },
    })

    if (!participant || participant.conversation.parentId !== user.id) {
      return res.status(404).json({ error: 'Participant not found' })
    }

    await prisma.conversationParticipant.delete({ where: { id: participant.id } })

    res.json({ success: true })
  } catch (error) {
    console.error('Error removing conversation staff:', error)
    res.status(500).json({ error: 'Failed to remove staff' })
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
          { participants: { some: { userId: user.id } } },
          // Admin school-wide override is limited to STAFF threads — a private
          // parent↔ILSA thread is reachable by an admin ONLY via the audited
          // oversight route, never the native inbox (ADR 0006, #2/#4).
          ...(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ schoolId: user.schoolId, kind: 'STAFF' }] : []),
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

    // The requester must participate in the conversation, not merely know its id.
    const convo = await prisma.conversation.findFirst({ where: participantWhere(id, user), select: { id: true } })
    if (!convo) return res.status(404).json({ error: 'Conversation not found' })

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
          { participants: { some: { userId: user.id } } },
          // Admin school-wide override is limited to STAFF threads — a private
          // parent↔ILSA thread is reachable by an admin ONLY via the audited
          // oversight route, never the native inbox (ADR 0006, #2/#4).
          ...(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? [{ schoolId: user.schoolId, kind: 'STAFF' }] : []),
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
  const convo = await prisma.conversation.findFirst({ where: participantWhere(id, req.user!), select: { id: true } })
  if (!convo) return res.status(404).json({ error: 'Conversation not found' })
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
    // `roleLabel` is the sub-line the app shows under the name: absent for a
    // class teacher (the app's default), the subjects taught for a specialist.
    const teacherMap = new Map<string, { id: string; name: string; avatarUrl: string | null; classes: Array<{ id: string; name: string }>; roleLabel?: string }>()
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

    // Specialist teachers — PE, music, Arabic, Islamic … take the class but
    // aren't its class teacher, so Hub never lists them in `teachers[]` and they
    // never reach StaffClassAssignment. Read them off the class's published
    // timetable instead (shared cache, see services/classTeachingStaff.ts) and
    // fold them into the same per-child group, labelled with what they teach.
    // Entirely best-effort: any failure leaves the contact list as it was.
    try {
      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { hubSchoolId: true, timezone: true },
      })
      if (timetableLookupPossible(school?.hubSchoolId) && classIds.length > 0) {
        const classRows = await prisma.class.findMany({
          where: { id: { in: classIds } },
          select: { id: true, name: true, hubClassId: true },
        })
        const specialistsByClass = await teachingStaffForClasses(
          user.schoolId,
          classRows.map(c => ({ classId: c.id, hubClassId: c.hubClassId })),
          {
            hubSchoolId: school?.hubSchoolId ?? null,
            today: todayInTimezone(school?.timezone ?? 'UTC'),
            excludeUserIds: new Set(teacherMap.keys()),
          },
        )
        for (const cls of classRows) {
          for (const s of specialistsByClass.get(cls.id) ?? []) {
            const existing = teacherMap.get(s.userId)
            if (existing) {
              // Teaches more than one of this parent's children.
              if (!existing.classes.some(c => c.id === cls.id)) {
                existing.classes.push({ id: cls.id, name: cls.name })
              }
              continue
            }
            teacherMap.set(s.userId, {
              id: s.userId,
              name: s.name,
              avatarUrl: s.avatarUrl,
              classes: [{ id: cls.id, name: cls.name }],
              // What they teach, in place of the "Class Teacher" label. Capped so
              // a teacher who takes six subjects doesn't overflow the row.
              roleLabel: s.subjects.slice(0, 3).join(' · ') || 'Specialist Teacher',
            })
          }
        }
      }
    } catch (error) {
      console.error('Specialist-teacher lookup failed (contacts unaffected):', error)
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

    // ILSA (Learning Support Assistant) contacts — an ILSA is 1:1 with a single
    // pupil and engaged by that pupil's parent, so a guardian sees ONLY the
    // ILSA(s) actively linked to their OWN child (ADR 0006, #3). Deactivated
    // links are excluded (revokes visibility). Labelled + shaped distinctly from
    // teachers so the app can render them as a separate, clearly-marked group.
    const childStudentIds = childrenInfo.map(c => c.studentId)
    const ilsaLinks = childStudentIds.length > 0
      ? await prisma.ilsaLink.findMany({
          where: { studentId: { in: childStudentIds }, active: true },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        })
      : []
    const ilsas = ilsaLinks.map(l => {
      const child = childrenInfo.find(c => c.studentId === l.studentId)
      return {
        id: l.user.id,
        name: l.user.name,
        avatarUrl: l.user.avatarUrl,
        // The label the parent app must show — visually distinct from teachers.
        roleLabel: 'Learning Support Assistant',
        studentId: l.studentId,
        studentName: child?.studentName ?? null,
      }
    })

    res.json({
      teachers: Array.from(teacherMap.values()),
      schoolContacts: schoolContacts.map(sc => ({
        id: sc.id,
        name: sc.name,
        description: sc.description,
        icon: sc.icon,
        assignedUserId: sc.assignedUserId,
        assignedUserName: sc.assignedUser.name,
        warnBeforeMessaging: sc.warnBeforeMessaging,
        warningMessage: sc.warningMessage,
      })),
      ilsas,
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

    // STAFF-typed threads only — a private parent↔ILSA thread never appears in any
    // staff/teacher/admin inbox (ADR 0006, #2). ANDed with the OR/admin branches.
    const where: Record<string, unknown> = { kind: 'STAFF' }

    if (isAdminUser) {
      // Admin: whole school, primary two-party read model, own archive flag.
      where.schoolId = user.schoolId
      where.archivedByStaff = false
    } else {
      // Non-admin staff: their OWN threads PLUS any thread they've been CC'd on
      // as a STAFF participant (their own participant archivedAt drives archive,
      // never the primary staff's archivedByStaff flag).
      where.OR = [
        { staffId: user.id, archivedByStaff: false },
        { participants: { some: { userId: user.id, role: 'STAFF', archivedAt: null } } },
      ]
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
        // The actor's own participant row (present when they are a CC, not the
        // primary staff) — carries their lastReadAt/mutedAt for the CC view.
        participants: { where: { userId: user.id }, select: { lastReadAt: true, mutedAt: true } },
        messages: {
          where: { senderId: { not: user.id }, deletedAt: null },
          select: { readAt: true, createdAt: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    res.json(conversations.map(c => {
      const myParticipant = c.participants[0]
      // A CC'd staff member (a participant who is NOT the primary staff) reads
      // via their participant row: unread = inbound newer than their lastReadAt
      // (null ⇒ all inbound), muted from their mutedAt. The primary staff (and
      // admins) keep the two-party ConversationMessage.readAt model unchanged.
      const useParticipant = !!myParticipant && c.staffId !== user.id
      const unreadCount = useParticipant
        ? c.messages.filter(m => (myParticipant.lastReadAt ? m.createdAt > myParticipant.lastReadAt : true)).length
        : c.messages.filter(m => m.readAt === null).length
      const muted = useParticipant ? myParticipant.mutedAt != null : c.mutedByStaff
      return {
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
        unreadCount,
        muted,
        // True when the actor is a CC'd staff participant rather than the primary.
        ccd: useParticipant || undefined,
        createdAt: c.createdAt.toISOString(),
      }
    }))
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

    // Shared with the push path (services/unreadCount.ts) so the number on the
    // app icon and the number in the app are computed the same way.
    const count = await getInboxUnreadCount({
      id: user.id,
      role: user.role,
      schoolId: user.schoolId,
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

    const check = checkUpload(uploaded.buffer, uploaded.mimetype, uploaded.originalname, ATTACHMENT_MIME_TYPES)
    if (!check.valid) {
      return res.status(400).json({ error: `File rejected: ${check.reason}` })
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
      warnBeforeMessaging: c.warnBeforeMessaging,
      warningMessage: c.warningMessage,
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
    const { name, description, icon, assignedUserId, order, warnBeforeMessaging, warningMessage } = req.body

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
        warnBeforeMessaging: warnBeforeMessaging === true,
        warningMessage: warningMessage?.trim() || null,
      },
    })

    res.status(201).json({
      id: contact.id,
      name: contact.name,
      description: contact.description,
      icon: contact.icon,
      assignedUserId: contact.assignedUserId,
      assignedUserName: staffUser.name,
      warnBeforeMessaging: contact.warnBeforeMessaging,
      warningMessage: contact.warningMessage,
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
    const { name, description, icon, assignedUserId, order, warnBeforeMessaging, warningMessage } = req.body

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
        ...(warnBeforeMessaging !== undefined && { warnBeforeMessaging: warnBeforeMessaging === true }),
        ...(warningMessage !== undefined && { warningMessage: warningMessage?.trim() || null }),
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
      warnBeforeMessaging: contact.warnBeforeMessaging,
      warningMessage: contact.warningMessage,
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
