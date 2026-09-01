import prisma from './prisma.js'
import { sendNotification } from './notify.js'
import logger from './logger.js'

/**
 * Announce scheduled messages when their time arrives.
 *
 * The other half of the fix in the two create routes. They now decline to
 * notify about a post dated in the future — correct on its own, but on its own
 * it would mean a scheduled post simply appearing one morning with nobody told,
 * which is worse than the old premature alert for anything that matters. This
 * is what makes the silence temporary.
 *
 * Claim-then-send, not send-then-mark: `notifiedAt` is stamped by a conditional
 * updateMany that only matches a row still unclaimed, so two replicas ticking at
 * the same moment cannot both win it. The cost of that ordering is that a crash
 * between claim and send loses one announcement; the alternative loses nothing
 * but can announce the same post to a whole school twice, and a duplicate
 * broadcast to every parent is the worse failure.
 */

/** Kept small: the sweep runs every minute, and a school does not schedule
 *  hundreds of posts for the same instant. A backlog drains over later ticks. */
const BATCH = 50

export async function publishDueScheduledMessages(): Promise<void> {
  const now = new Date()

  const due = await prisma.message.findMany({
    where: {
      notifiedAt: null,
      scheduledAt: { not: null, lte: now },
    },
    select: {
      id: true,
      title: true,
      content: true,
      targetClass: true,
      classId: true,
      yearGroupId: true,
      groupId: true,
      schoolId: true,
    },
    orderBy: { scheduledAt: 'asc' },
    take: BATCH,
  })

  if (due.length === 0) return

  for (const message of due) {
    // Claim it. count === 0 means another replica already has it.
    const claim = await prisma.message.updateMany({
      where: { id: message.id, notifiedAt: null },
      data: { notifiedAt: new Date() },
    })
    if (claim.count === 0) continue

    try {
      await sendNotification({
        type: 'MESSAGE',
        title: message.title,
        body: message.content.substring(0, 200),
        resourceType: 'MESSAGE',
        resourceId: message.id,
        target: {
          targetClass: message.targetClass,
          classId: message.classId || undefined,
          yearGroupId: message.yearGroupId || undefined,
          groupId: message.groupId || undefined,
          schoolId: message.schoolId,
        },
      })
      logger.info({ messageId: message.id }, 'scheduled message announced')
    } catch (err) {
      // The claim stands, so this will not be retried — log loudly rather than
      // silently re-announcing to a whole school on the next tick.
      logger.error({ err, messageId: message.id }, 'scheduled message claimed but not announced')
    }
  }
}
