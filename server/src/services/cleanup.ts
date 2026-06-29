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
                teacher: { select: { id: true, name: true, email: true } },
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

      // Send email to parent
      if (booking.parent.email) {
        await sendReminderToParent(booking.parent.email, {
          schoolId: booking.parent.schoolId,
          teacherName: teacher.name,
          childName: booking.studentName,
          date: slotDate,
          time: `${slot.startTime} - ${slot.endTime}`,
          location: booking.meetingLink || location,
          schoolName,
        })
      }

      // Send reminder to teacher
      if (teacher.email) {
        const { sendReminderToTeacher } = await import('./consultationEmails.js')
        await sendReminderToTeacher(teacher.email, {
          schoolId: booking.parent.schoolId,
          parentName: booking.studentName,
          childName: booking.studentName,
          date: slotDate,
          time: `${slot.startTime} - ${slot.endTime}`,
          location: booking.meetingLink || location,
          schoolName,
        })
      }

      // Send push to parent
      sendConsultationReminderNotification({
        parentId: booking.parentId,
        schoolId: booking.parent.schoolId,
        teacherName: teacher.name,
        childName: booking.studentName,
        date: slotDate,
        time: `${slot.startTime} - ${slot.endTime}`,
      }).catch(e => console.error('[Reminder] Parent push failed:', e))

      // Send push to teacher
      sendConsultationReminderNotification({
        parentId: teacher.id,
        schoolId: booking.parent.schoolId,
        teacherName: teacher.name,
        childName: booking.studentName,
        date: slotDate,
        time: `${slot.startTime} - ${slot.endTime}`,
      }).catch(e => console.error('[Reminder] Teacher push failed:', e))

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

/**
 * Send evening reminders about tomorrow's schedule.
 * Runs hourly but only sends once per day (checks if current hour is 18:00 UTC+4 = 14:00 UTC).
 * Groups activities by parent and sends one notification per parent.
 */
let lastScheduleReminderDate: string | null = null

export async function sendScheduleReminders(): Promise<void> {
  try {
    // Only run at ~6pm Gulf time (UTC+4 = 14:00 UTC)
    const now = new Date()
    const gulfHour = (now.getUTCHours() + 4) % 24
    if (gulfHour < 17 || gulfHour > 19) return // Only between 5-7pm Gulf time

    // Only send once per day
    const todayStr = now.toISOString().split('T')[0]
    if (lastScheduleReminderDate === todayStr) return
    lastScheduleReminderDate = todayStr

    // Get tomorrow's day of week (0=Sun, 1=Mon, ..., 6=Sat)
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowDay = tomorrow.getDay()

    // Skip if tomorrow is weekend (Sat=6, Sun=0) — adjust for UAE if needed (Fri=5, Sat=6)
    if (tomorrowDay === 0 || tomorrowDay === 6) return

    // Get all active recurring schedule items for tomorrow
    const scheduleItems = await prisma.scheduleItem.findMany({
      where: {
        isRecurring: true,
        dayOfWeek: tomorrowDay,
        active: true,
      },
      include: {
        class: { select: { id: true, name: true } },
        yearGroup: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
    })

    if (scheduleItems.length === 0) return

    // Group items by school
    const bySchool = new Map<string, typeof scheduleItems>()
    for (const item of scheduleItems) {
      const list = bySchool.get(item.schoolId) || []
      list.push(item)
      bySchool.set(item.schoolId, list)
    }

    let totalSent = 0

    for (const [schoolId, items] of bySchool) {
      // Get all parents with their children's class info
      const parents = await prisma.user.findMany({
        where: { schoolId, role: 'PARENT' },
        select: {
          id: true,
          name: true,
          children: { select: { name: true, classId: true } },
          studentLinks: {
            select: {
              student: { select: { firstName: true, lastName: true, classId: true, class: { select: { yearGroupId: true } } } },
            },
          },
        },
      })

      // Check which parents have schedule reminders disabled
      const disabledPrefs = await prisma.notificationPreference.findMany({
        where: { userId: { in: parents.map(p => p.id) }, scheduleReminders: false },
        select: { userId: true },
      })
      const disabledSet = new Set(disabledPrefs.map(p => p.userId))

      for (const parent of parents) {
        if (disabledSet.has(parent.id)) continue

        // Get this parent's children's class IDs and year group IDs
        const childClassIds = new Set<string>()
        const childYearGroupIds = new Set<string>()
        const childNames: string[] = []

        for (const child of parent.children) {
          childClassIds.add(child.classId)
          childNames.push(child.name)
        }
        for (const link of parent.studentLinks) {
          childClassIds.add(link.student.classId)
          if (link.student.class.yearGroupId) childYearGroupIds.add(link.student.class.yearGroupId)
          childNames.push(`${link.student.firstName} ${link.student.lastName}`)
        }

        if (childClassIds.size === 0) continue

        // Find relevant items for this parent's children
        const relevantItems = items.filter(item => {
          if (item.targetClass === 'Whole School') return true
          if (item.classId && childClassIds.has(item.classId)) return true
          if (item.yearGroupId && childYearGroupIds.has(item.yearGroupId)) return true
          return false
        })

        if (relevantItems.length === 0) continue

        // Build notification body
        const activityList = relevantItems
          .map(item => `${item.icon || '📋'} ${item.label}`)
          .join(', ')

        const firstName = (parent.name || '').split(' ')[0] || 'Parent'
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][tomorrowDay]

        // Create notification record
        await prisma.notification.create({
          data: {
            userId: parent.id,
            type: 'SCHEDULE_REMINDER',
            title: `Tomorrow's Schedule — ${dayName}`,
            body: activityList,
            resourceType: 'SCHEDULE',
            resourceId: schoolId,
            data: { route: '/' },
            schoolId,
          },
        })

        // Send push notification
        const tokens = await prisma.deviceToken.findMany({
          where: { userId: parent.id },
          select: { token: true },
        })

        if (tokens.length > 0) {
          const { sendPushNotification, removeInvalidTokens } = await import('./firebase.js')
          const result = await sendPushNotification(
            tokens.map(t => t.token),
            {
              title: `📅 Tomorrow's Schedule`,
              body: activityList,
              data: { type: 'SCHEDULE_REMINDER', route: '/' },
            }
          )
          if (result.failedTokens.length > 0) {
            removeInvalidTokens(result.failedTokens).catch(() => {})
          }
        }

        totalSent++
      }
    }

    if (totalSent > 0) {
      console.log(`[Schedule Reminders] Sent ${totalSent} tomorrow's schedule notifications`)
    }
  } catch (error) {
    console.error('[Schedule Reminders] Error:', error)
  }
}
