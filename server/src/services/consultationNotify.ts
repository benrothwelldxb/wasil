import prisma from './prisma.js'
import { sendPushNotification, removeInvalidTokens } from './firebase.js'

const NOTIFICATION_TYPE = 'CONSULTATION'

async function sendToUsers(
  userIds: string[],
  schoolId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (userIds.length === 0) return

  try {
    // Check notification preferences
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, consultations: false },
      select: { userId: true },
    })
    const disabledIds = new Set(prefs.map(p => p.userId))
    const enabledIds = userIds.filter(id => !disabledIds.has(id))

    if (enabledIds.length === 0) return

    // Create in-app notifications
    await prisma.notification.createMany({
      data: enabledIds.map(userId => ({
        userId,
        type: NOTIFICATION_TYPE,
        title,
        body,
        resourceType: 'CONSULTATION',
        data: data ? JSON.parse(JSON.stringify(data)) : undefined,
        schoolId,
      })),
    })

    // Send push notifications
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: { in: enabledIds } },
      select: { token: true },
    })

    if (deviceTokens.length > 0) {
      const tokens = deviceTokens.map(dt => dt.token)
      const result = await sendPushNotification(tokens, {
        title,
        body,
        data: { type: NOTIFICATION_TYPE, ...data },
      })

      if (result.failedTokens.length > 0) {
        await removeInvalidTokens(result.failedTokens)
      }
    }
  } catch (error) {
    console.error('[ConsultationNotify] Failed to send notification:', error)
  }
}

export async function sendConsultationBookingNotification(params: {
  parentId: string
  teacherId: string
  schoolId: string
  teacherName: string
  parentName: string
  childName: string
  date: string
  time: string
}): Promise<void> {
  const { parentId, teacherId, schoolId, teacherName, parentName, childName, date, time } = params

  // Notify parent
  sendToUsers(
    [parentId],
    schoolId,
    'Consultation Booked',
    `Your appointment with ${teacherName} on ${date} at ${time} for ${childName} is confirmed.`,
  )

  // Notify teacher
  sendToUsers(
    [teacherId],
    schoolId,
    'New Consultation Booking',
    `${parentName} has booked a ${time} appointment for ${childName}.`,
  )
}

export async function sendConsultationCancellationNotification(params: {
  parentId: string
  teacherId: string
  schoolId: string
  teacherName: string
  parentName: string
  childName: string
  date: string
  time: string
}): Promise<void> {
  const { parentId, teacherId, schoolId, teacherName, parentName, childName, date, time } = params

  // Notify parent
  sendToUsers(
    [parentId],
    schoolId,
    'Consultation Cancelled',
    `Your ${time} appointment with ${teacherName} for ${childName} has been cancelled.`,
  )

  // Notify teacher
  sendToUsers(
    [teacherId],
    schoolId,
    'Consultation Cancelled',
    `${parentName} has cancelled their ${time} appointment for ${childName}. The slot is now available.`,
  )

  // Notify school admins
  const admins = await prisma.user.findMany({
    where: { schoolId, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  })
  if (admins.length > 0) {
    sendToUsers(
      admins.map(a => a.id),
      schoolId,
      'Consultation Cancelled',
      `${parentName} cancelled their ${time} consultation with ${teacherName} for ${childName}.`,
    )
  }
}

export async function sendConsultationReminderNotification(params: {
  parentId: string
  schoolId: string
  teacherName: string
  childName: string
  date: string
  time: string
}): Promise<void> {
  const { parentId, schoolId, teacherName, childName, time } = params

  sendToUsers(
    [parentId],
    schoolId,
    'Consultation Tomorrow',
    `Reminder: Your ${time} appointment with ${teacherName} for ${childName} is tomorrow.`,
  )
}
