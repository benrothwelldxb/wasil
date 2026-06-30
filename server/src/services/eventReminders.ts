import prisma from './prisma.js'
import { enqueuePush } from './outbox.js'
import { withJobLock } from './jobLock.js'
import logger from './logger.js'

/**
 * Send a "tomorrow" reminder to every parent who RSVP'd "attending" to an
 * event that's between 22 and 26 hours away. Runs hourly via cron.
 *
 * Dedupe: per (eventId, parentId) using a JobRun row, so the same RSVP can
 * only be reminded once even if the cron ticks multiple times inside the
 * window or across replicas.
 */
export async function sendEventRsvpReminders(): Promise<void> {
  try {
    const now = new Date()
    const start = new Date(now.getTime() + 22 * 60 * 60 * 1000)
    const end = new Date(now.getTime() + 26 * 60 * 60 * 1000)

    const events = await prisma.event.findMany({
      where: {
        requiresRsvp: true,
        date: { gte: start, lte: end },
      },
      include: {
        rsvps: {
          where: { status: 'attending' },
          select: { userId: true },
        },
      },
    })

    if (events.length === 0) return

    let sent = 0
    for (const event of events) {
      for (const rsvp of event.rsvps) {
        // Per (event, user) idempotency. The job lock here is "did we
        // already send this reminder?" — periodKey is the (eventId, userId)
        // pair so the same RSVP only fires once.
        const result = await withJobLock(
          'event-reminder',
          `${event.id}:${rsvp.userId}`,
          async () => {
            const tokens = await prisma.deviceToken.findMany({
              where: { userId: rsvp.userId },
              select: { token: true },
            })

            // Always write the in-app notification — even without a device
            // token, the parent should see the reminder in their notifications
            // list when they next open the app.
            await prisma.notification.create({
              data: {
                userId: rsvp.userId,
                type: 'EVENT_REMINDER',
                title: 'Event tomorrow',
                body: `${event.title}${event.time ? ` at ${event.time}` : ''}${event.location ? ` — ${event.location}` : ''}`,
                resourceType: 'EVENT',
                resourceId: event.id,
                schoolId: event.schoolId,
              },
            })

            if (tokens.length > 0) {
              await enqueuePush(event.schoolId, {
                tokens: tokens.map(t => t.token),
                title: 'Event tomorrow',
                body: `${event.title}${event.time ? ` at ${event.time}` : ''}`,
                data: { type: 'EVENT_REMINDER', resourceType: 'EVENT', resourceId: event.id },
              })
            }
            sent++
          },
        )
        // result.ran === false means another worker took this one (or we
        // already sent it) — that's fine.
        void result
      }
    }

    if (sent > 0) {
      logger.info({ sent }, 'event RSVP reminders sent')
    }
  } catch (error) {
    logger.error({ err: error }, 'event RSVP reminders failed')
  }
}
