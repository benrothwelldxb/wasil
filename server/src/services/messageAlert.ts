import prisma from './prisma.js'
import logger from './logger.js'
import { describeAttachments } from './attachmentSummary.js'
import { sendPushNotification, removeInvalidTokens } from './firebase.js'
import { getPushBadgeCount } from './unreadCount.js'

/**
 * The alert a parent's message raises, held back until they stop typing.
 *
 * Parents write the way people text: "Hi" ⏎, then the actual message. Sent at
 * once, that is a buzz on the teacher's phone and an email, both saying "Hi",
 * then a second buzz with the substance a few seconds later. The first one
 * is pure interruption — it tells the teacher a message is coming and nothing
 * about what it is — and the email for a new exchange only ever goes for the
 * FIRST message, so the email the teacher actually received said "Hi" and
 * nothing else.
 *
 * So a parent's message no longer alerts anyone when it is sent. It queues an
 * outbox row due DEBOUNCE after it; when that row runs:
 *   • if the same parent wrote again within DEBOUNCE (and nobody else spoke in
 *     between), it does nothing — the later message's row will cover it;
 *   • otherwise it is the end of a burst, and ONE push (and, for a new
 *     exchange, one email) goes out carrying every message in the burst.
 *
 * The message itself is never held back: it is in the thread, the thread list
 * and the bell immediately. Only the interruption waits. Staff messages to
 * parents are not delayed — this is about the parent's typing habit, and a
 * school's message is usually composed in one go.
 *
 * The cost is that a teacher's phone buzzes up to ~90s after the parent's last
 * message (DEBOUNCE plus the outbox's 30s tick), never sooner. Nothing urgent
 * comes through the inbox — absences and emergencies have their own routes.
 */
export const PARENT_ALERT_DEBOUNCE_MS = 60_000

/** How many earlier messages a burst can reach back over. A ceiling, not a rule. */
const BURST_LOOKBACK = 20

export interface MessageAlertPayload {
  conversationId: string
  messageId: string
}

type TxClient = Pick<typeof prisma, 'outboxEntry'>

export async function enqueueParentMessageAlert(
  schoolId: string,
  payload: MessageAlertPayload,
  sentAt: Date,
  client: TxClient = prisma,
): Promise<void> {
  await client.outboxEntry.create({
    data: {
      schoolId,
      kind: 'MESSAGE_ALERT',
      payload: payload as unknown as object,
      runAfter: new Date(sentAt.getTime() + PARENT_ALERT_DEBOUNCE_MS),
    },
  })
}

type BurstRow = {
  id: string
  senderId: string
  content: string
  createdAt: Date
  deletedAt: Date | null
  attachments: Array<{ fileType: string }>
}

/**
 * The run of messages this one ends: walking back through the thread, the same
 * sender, each within DEBOUNCE of the one after it, stopping at anyone else.
 * Oldest first. Withdrawn messages keep the chain joined (their rows were
 * skipped on the strength of what came next) but contribute no words.
 */
export function burstEndingAt(newestFirst: BurstRow[]): BurstRow[] {
  const [last, ...earlier] = newestFirst
  if (!last) return []
  const burst = [last]
  for (const prev of earlier) {
    const after = burst[burst.length - 1]
    if (prev.senderId !== last.senderId) break
    if (after.createdAt.getTime() - prev.createdAt.getTime() > PARENT_ALERT_DEBOUNCE_MS) break
    burst.push(prev)
  }
  return burst.reverse()
}

function lineFor(m: BurstRow): string {
  return m.content.trim() || describeAttachments(m.attachments)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function dispatchParentMessageAlert(p: MessageAlertPayload): Promise<void> {
  const message = await prisma.conversationMessage.findUnique({
    where: { id: p.messageId },
    select: { id: true, senderId: true, createdAt: true, conversationId: true },
  })
  if (!message || message.conversationId !== p.conversationId) return

  // Did the same parent carry on? Then this is not the end of the burst, and
  // the later message's row will send the alert for both.
  const next = await prisma.conversationMessage.findFirst({
    where: { conversationId: p.conversationId, createdAt: { gt: message.createdAt } },
    orderBy: { createdAt: 'asc' },
    select: { senderId: true, createdAt: true },
  })
  if (
    next &&
    next.senderId === message.senderId &&
    next.createdAt.getTime() - message.createdAt.getTime() <= PARENT_ALERT_DEBOUNCE_MS
  ) {
    return
  }

  const recent = await prisma.conversationMessage.findMany({
    where: { conversationId: p.conversationId, createdAt: { lte: message.createdAt } },
    orderBy: { createdAt: 'desc' },
    take: BURST_LOOKBACK,
    select: {
      id: true, senderId: true, content: true, createdAt: true, deletedAt: true,
      attachments: { select: { fileType: true } },
    },
  })
  const burst = burstEndingAt(recent)
  const live = burst.filter(m => !m.deletedAt)
  // Everything they wrote was withdrawn before anyone was told. Tell nobody.
  if (live.length === 0) return

  const conversation = await prisma.conversation.findUnique({
    where: { id: p.conversationId },
    include: {
      parent: { select: { id: true, name: true } },
      staff: { select: { id: true, name: true, email: true } },
      participants: { select: { userId: true, mutedAt: true, user: { select: { name: true } } } },
      school: { select: { name: true } },
    },
  })
  if (!conversation) return

  const senderId = message.senderId
  const senderIsPrimaryParent = senderId === conversation.parentId
  const senderName = senderIsPrimaryParent
    ? conversation.parent.name
    : conversation.participants.find(x => x.userId === senderId)?.user.name ?? conversation.parent.name

  // Same fan-out as the send route: everyone on the thread but the sender,
  // each with their own mute — read NOW, so a mute set in the last minute holds.
  const recipients: Array<{ userId: string; muted: boolean }> = []
  if (conversation.parentId !== senderId) recipients.push({ userId: conversation.parentId, muted: conversation.mutedByParent })
  if (conversation.staffId !== senderId) recipients.push({ userId: conversation.staffId, muted: conversation.mutedByStaff })
  for (const x of conversation.participants) {
    if (x.userId !== senderId) recipients.push({ userId: x.userId, muted: x.mutedAt != null })
  }
  const seen = new Set<string>()
  const deduped = recipients.filter(r => !seen.has(r.userId) && !!seen.add(r.userId))

  const lines = live.map(lineFor)
  const title = `Message from ${senderName}`
  const body = lines.join('\n').substring(0, 200)

  for (const r of deduped) {
    if (r.muted) continue
    try {
      const tokens = (await prisma.deviceToken.findMany({ where: { userId: r.userId }, select: { token: true } }))
        .map(t => t.token)
      if (tokens.length === 0) continue
      const badge = await getPushBadgeCount(r.userId)
      const result = await sendPushNotification(tokens, {
        title,
        body,
        data: {
          type: 'DIRECT_MESSAGE',
          resourceType: 'CONVERSATION',
          resourceId: conversation.id,
          route: `/inbox/${conversation.id}`,
        },
        badge,
      })
      if (result.failedTokens.length > 0) await removeInvalidTokens(result.failedTokens)
    } catch (err) {
      // One recipient's failure must not stop the others, and must not throw
      // the row back for a retry that would buzz everyone who already got it.
      logger.warn({ err, conversationId: conversation.id, userId: r.userId }, 'message alert: push failed')
    }
  }

  // The teacher's email for a NEW exchange: the primary parent writing after a
  // quiet day. Judged on when the burst STARTED — otherwise "Hi" would count as
  // the previous message and the email for its follow-up would never go.
  if (!senderIsPrimaryParent || !conversation.staff.email) return
  const burstStart = burst[0].createdAt
  const earlier = await prisma.conversationMessage.count({
    where: {
      conversationId: conversation.id,
      createdAt: { gte: new Date(burstStart.getTime() - 24 * 60 * 60 * 1000), lt: burstStart },
    },
  })
  if (earlier > 0) return

  const schoolName = conversation.school?.name || 'School'
  const ADMIN_APP_URL = process.env.ADMIN_APP_URL || process.env.ADMIN_URL || 'http://localhost:3001'
  const inboxLink = `${ADMIN_APP_URL}/inbox`
  const parentName = conversation.parent.name
  const htmlLines = lines.map(l => escapeHtml(l)).join('<br>')
  const { enqueueEmail } = await import('./outbox.js')
  await enqueueEmail(conversation.schoolId, {
    to: conversation.staff.email,
    subject: `New message from ${parentName} — ${schoolName}`,
    html: `<div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
              <h2 style="color: #2D2225; margin: 0 0 4px;">New Parent Message</h2>
              <p style="color: #7A6469; font-size: 14px; margin: 0 0 20px;">${escapeHtml(schoolName)}</p>
              <div style="background: #FAF8F6; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                <p style="color: #7A6469; font-size: 13px; margin: 0 0 6px; font-weight: 600;">From: ${escapeHtml(parentName)}</p>
                <p style="color: #2D2225; font-size: 15px; line-height: 1.5; margin: 0;">${htmlLines}</p>
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
    text: `New message from ${parentName}\n\n"${lines.join('\n')}"\n\nPlease do not reply to this email. Reply in the admin portal: ${inboxLink}`,
  })
}
