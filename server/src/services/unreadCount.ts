import prisma from './prisma.js'

/**
 * Inbox unread counts, in ONE place.
 *
 * Two read models coexist and both have to be counted:
 *   - the PRIMARY parent/staff on a conversation, whose reads are recorded on
 *     the message itself (`readAt`), and
 *   - an added co-guardian or CC'd staff member, who has no per-message row and
 *     whose reads are recorded on their participant row (`lastReadAt`).
 *
 * Extracted from GET /api/inbox/unread-count so the push path can send the very
 * same number to the device as the app itself would show — otherwise the icon
 * badge and the in-app pill drift apart.
 */

export interface UnreadCountActor {
  id: string
  role: string
  schoolId: string
}

export async function getInboxUnreadCount(actor: UnreadCountActor): Promise<number> {
  const isParent = actor.role === 'PARENT'
  const isAdminUser = actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN'

  const conversations = await prisma.conversation.findMany({
    where: {
      ...(isParent
        ? { parentId: actor.id, archivedByParent: false }
        : isAdminUser
          ? { schoolId: actor.schoolId, archivedByStaff: false }
          : { staffId: actor.id, archivedByStaff: false }
      ),
    },
    select: { id: true },
  })

  let count = 0
  if (conversations.length > 0) {
    count = await prisma.conversationMessage.count({
      where: {
        conversationId: { in: conversations.map(c => c.id) },
        senderId: { not: actor.id },
        readAt: null,
        deletedAt: null,
      },
    })
  }

  // Add threads shared with this user as an added guardian. Their unread is
  // driven by the participant row's lastReadAt (null ⇒ all inbound count),
  // excluding their own messages and deleted messages.
  const participantRows = await prisma.conversationParticipant.findMany({
    where: { userId: actor.id, archivedAt: null },
    select: { conversationId: true, lastReadAt: true },
  })
  for (const p of participantRows) {
    count += await prisma.conversationMessage.count({
      where: {
        conversationId: p.conversationId,
        senderId: { not: actor.id },
        deletedAt: null,
        ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
      },
    })
  }

  return count
}

/**
 * The badge number to put on a push aimed at `userId`, resolving the recipient's
 * role/school itself (the push fan-out only carries user ids).
 *
 * Deliberately fail-safe: a badge is a cosmetic extra on a notification that
 * matters, so ANY problem here (unknown user, database hiccup) returns undefined
 * — which omits the badge and leaves whatever count the device already shows —
 * rather than throwing and losing the message.
 */
export async function getPushBadgeCount(userId: string): Promise<number | undefined> {
  try {
    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, schoolId: true },
    })
    if (!recipient) return undefined

    const count = await getInboxUnreadCount({
      id: recipient.id,
      role: String(recipient.role),
      schoolId: recipient.schoolId,
    })
    return Number.isFinite(count) ? count : undefined
  } catch (error) {
    console.error('Failed to compute push badge count for user', userId, error)
    return undefined
  }
}
