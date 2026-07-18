import prisma from './prisma.js'
import { enqueuePush, enqueueEmail } from './outbox.js'
import logger from './logger.js'

/**
 * Notifications for provider-club bookings. Both parent (push + in-app) and
 * provider (email) deliveries go through the reliable-delivery outbox, so a
 * transient FCM/Resend blip retries instead of silently dropping. These are
 * transactional, parent-initiated events, so they aren't preference-gated.
 */

async function notifyParent(params: {
  parentUserId: string
  schoolId: string
  title: string
  body: string
  activityId: string
}): Promise<void> {
  const { parentUserId, schoolId, title, body, activityId } = params

  await prisma.notification.create({
    data: { userId: parentUserId, type: 'CLUB_BOOKING', title, body, resourceType: 'CLUB', resourceId: activityId, schoolId },
  })

  const tokens = await prisma.deviceToken.findMany({ where: { userId: parentUserId }, select: { token: true } })
  if (tokens.length > 0) {
    await enqueuePush(schoolId, {
      tokens: tokens.map(t => t.token),
      title,
      body,
      data: { type: 'CLUB_BOOKING', resourceType: 'CLUB', resourceId: activityId },
    })
  }
}

export async function notifyClubBookingCreated(params: {
  activityId: string
  activityName: string
  studentName: string
  parentUserId: string
  schoolId: string
  providerId: string
}): Promise<void> {
  const { activityId, activityName, studentName, parentUserId, schoolId, providerId } = params
  try {
    await notifyParent({
      parentUserId,
      schoolId,
      title: 'Club booked',
      body: `${studentName} is booked into ${activityName}. Complete payment to secure the place.`,
      activityId,
    })

    // Email the provider's portal users about the new booking.
    const users = await prisma.providerUser.findMany({ where: { providerId }, select: { email: true } })
    if (users.length > 0) {
      const subject = `New booking — ${activityName}`
      const text = `${studentName} has booked a place in ${activityName}. See your bookings in the provider portal.`
      const html = `<!DOCTYPE html><html><body style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 12px;">New booking</h2>
        <p style="color: #334155; font-size: 14px; line-height: 1.55; margin: 0;"><strong>${studentName}</strong> has booked a place in <strong>${activityName}</strong>.</p>
        <p style="color: #94a3b8; font-size: 12px; margin: 20px 0 0;">Open the provider portal to view bookings.</p>
      </body></html>`
      for (const u of users) {
        await enqueueEmail(schoolId, { to: u.email, subject, html, text })
      }
    }
  } catch (error) {
    logger.error({ err: error, activityId }, 'notifyClubBookingCreated failed')
  }
}

export async function notifyClubBookingPaid(params: {
  activityId: string
  activityName: string
  studentName: string
  parentUserId: string
  schoolId: string
}): Promise<void> {
  const { activityId, activityName, studentName, parentUserId, schoolId } = params
  try {
    await notifyParent({
      parentUserId,
      schoolId,
      title: 'Payment confirmed',
      body: `Payment received for ${studentName}'s place in ${activityName}.`,
      activityId,
    })
  } catch (error) {
    logger.error({ err: error, activityId }, 'notifyClubBookingPaid failed')
  }
}
