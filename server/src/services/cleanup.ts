import prisma from './prisma.js'
import { sendReminderToParent } from './consultationEmails.js'
import { sendConsultationReminderNotification } from './consultationNotify.js'

/**
 * Clean up expired tokens from the database.
 * Deletes:
 *  - MagicLinkToken records older than 24 hours
 *  - RefreshToken records that have expired (older than 30 days)
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  try {
    // Clean up expired magic link tokens (older than 24 hours)
    const deletedMagicLinks = await prisma.magicLinkToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { createdAt: { lt: twentyFourHoursAgo } },
        ],
      },
    })

    // Clean up expired refresh tokens
    const deletedRefreshTokens = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    })

    if (deletedMagicLinks.count > 0 || deletedRefreshTokens.count > 0) {
      console.log(
        `[Cleanup] Deleted ${deletedMagicLinks.count} expired magic link tokens, ${deletedRefreshTokens.count} expired refresh tokens`
      )
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning up expired tokens:', error)
  }
}

/**
 * Send 24-hour reminder emails/push notifications for upcoming consultation bookings.
 * Only sends once per booking (tracked via reminderSentAt).
 */
export async function sendConsultationReminders(): Promise<void> {
  try {
    const now = new Date()
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const todayStr = now.toISOString().split('T')[0]
    const tomorrowStr = twentyFourHoursFromNow.toISOString().split('T')[0]

    // Find bookings where reminder hasn't been sent and the slot is within the next 24 hours
    const bookings = await prisma.consultationBooking.findMany({
      where: {
        reminderSentAt: null,
        slot: {
          date: { in: [todayStr, tomorrowStr] },
          isBreak: false,
        },
      },
      include: {
        parent: { select: { id: true, email: true, schoolId: true } },
        slot: {
          include: {
            consultationTeacher: {
              include: {
                teacher: { select: { name: true } },
                consultation: { include: { school: { select: { name: true } } } },
              },
            },
          },
        },
      },
    })

    let sentCount = 0

    for (const booking of bookings) {
      const slot = booking.slot
      const slotDate = slot.date || slot.consultationTeacher.consultation.date
      const appointmentTime = new Date(`${slotDate}T${slot.startTime}:00`)

      // Only send if appointment is within 24 hours but still in the future
      if (appointmentTime <= now || appointmentTime > twentyFourHoursFromNow) continue

      const teacher = slot.consultationTeacher.teacher
      const consultation = slot.consultationTeacher.consultation
      const location = slot.consultationTeacher.location || (slot.consultationTeacher.locationType === 'IN_PERSON' ? 'In Person' : slot.consultationTeacher.locationType)
      const schoolName = (consultation as any).school?.name || ''

      // Send email
      if (booking.parent.email) {
        sendReminderToParent(booking.parent.email, {
          teacherName: teacher.name,
          childName: booking.studentName,
          date: slotDate,
          time: `${slot.startTime} - ${slot.endTime}`,
          location: booking.meetingLink || location,
          schoolName,
        }).catch(e => console.error('[Reminder] Email failed:', e))
      }

      // Send push
      sendConsultationReminderNotification({
        parentId: booking.parentId,
        schoolId: booking.parent.schoolId,
        teacherName: teacher.name,
        childName: booking.studentName,
        date: slotDate,
        time: `${slot.startTime} - ${slot.endTime}`,
      }).catch(e => console.error('[Reminder] Push failed:', e))

      // Mark reminder as sent
      await prisma.consultationBooking.update({
        where: { id: booking.id },
        data: { reminderSentAt: now },
      })

      sentCount++
    }

    if (sentCount > 0) {
      console.log(`[Reminders] Sent ${sentCount} consultation reminders`)
    }
  } catch (error) {
    console.error('[Reminders] Error sending consultation reminders:', error)
  }
}
