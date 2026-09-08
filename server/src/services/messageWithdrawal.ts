import prisma from './prisma.js'

/**
 * Withdrawing a message, in one place.
 *
 * Connect's inbox and the partner API both offer it, and it is three writes
 * that must happen together: the soft delete, the thread preview falling back,
 * and the notification body being rewritten. A second implementation that did
 * the first and forgot the third would leave the recipient's bell holding text
 * the sender was told had been taken back — which is exactly the bug we fixed,
 * reintroduced somewhere nobody would think to look.
 *
 * So the routes decide who is asking; this decides what happens.
 */
export const WITHDRAW_WINDOW_MS = 15 * 60 * 1000

/** The wording a recipient sees in the thread, and now in their notification. */
export const WITHDRAWN_BODY = 'This message was deleted'

export type WithdrawFailure = 'not_found' | 'not_sender' | 'too_late'

export type WithdrawResult =
  | { ok: true; message: { id: string; conversationId: string; createdAt: Date; deletedAt: Date } }
  // Separate reasons because they are different sentences to the person who
  // asked: "that isn't yours to withdraw" and "you've missed the window" need
  // different answers, and a single 403 makes the caller guess.
  | { ok: false; reason: WithdrawFailure }

export async function withdrawMessage(params: {
  conversationId: string
  messageId: string
  actorId: string
}): Promise<WithdrawResult> {
  const { conversationId, messageId, actorId } = params

  const message = await prisma.conversationMessage.findFirst({
    where: { id: messageId, conversationId },
  })
  if (!message) return { ok: false, reason: 'not_found' }
  if (message.senderId !== actorId) return { ok: false, reason: 'not_sender' }
  if (message.createdAt < new Date(Date.now() - WITHDRAW_WINDOW_MS)) {
    return { ok: false, reason: 'too_late' }
  }

  const deletedAt = new Date()
  await prisma.conversationMessage.update({
    where: { id: messageId },
    data: { deletedAt, deletedBy: actorId },
  })

  // Out of the thread PREVIEW too. Conversation.lastMessageText is denormalised
  // at send time, so without this the withdrawn words carried on showing in
  // every inbox list — the parent app's and Desk's — beside a thread that now
  // says the message was withdrawn. Falls back to the most recent message still
  // standing, or empties if there is none.
  //
  // lastMessageAt is deliberately NOT rewound: it orders the inbox, and a
  // thread should not drop down the list because its last line was withdrawn.
  const newest = await prisma.conversationMessage.findFirst({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  })
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageText: newest?.content.trim().substring(0, 200) ?? null },
  })

  // And out of the NOTIFICATION, which carried the first 200 characters of the
  // message. Rewritten rather than deleted: a ping followed by no trace is its
  // own confusion, and "something arrived and was taken back" is the same fact
  // the thread shows.
  //
  // Addressed by the message id stamped into `data` at send time. Nothing older
  // carries it, and nothing older can reach here either — withdrawal is refused
  // after fifteen minutes.
  await prisma.notification.updateMany({
    where: {
      resourceType: 'CONVERSATION',
      resourceId: conversationId,
      data: { path: ['messageId'], equals: messageId },
    },
    data: { body: WITHDRAWN_BODY },
  })

  return {
    ok: true,
    message: { id: message.id, conversationId, createdAt: message.createdAt, deletedAt },
  }
}
