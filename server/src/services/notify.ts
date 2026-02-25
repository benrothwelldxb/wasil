import { Request } from 'express'
import prisma from './prisma.js'
import { sendPushNotification, removeInvalidTokens } from './firebase.js'

// ECA Notification Types
export const ECA_NOTIFICATION_TYPES = {
  REGISTRATION_OPEN: 'ECA_REGISTRATION_OPEN',
  REGISTRATION_CLOSING: 'ECA_REGISTRATION_CLOSING',
  ALLOCATION_RESULTS: 'ECA_ALLOCATION_RESULTS',
  INVITATION: 'ECA_INVITATION',
} as const

interface NotificationTarget {
  targetClass: string
  classId?: string
  yearGroupId?: string
  groupId?: string
  schoolId: string
}

interface SendNotificationParams {
  req: Request
  type: string
  title: string
  body: string
  resourceType?: string
  resourceId?: string
  data?: Record<string, unknown>
  target: NotificationTarget
}

export async function sendNotification({ req, type, title, body, resourceType, resourceId, data, target }: SendNotificationParams): Promise<void> {
  try {
    const { targetClass, classId, yearGroupId, groupId, schoolId } = target

    // Resolve target audience into parent user IDs
    let parentUserIds: string[] = []

    if (groupId) {
      // Parents of students in this group
      const members = await prisma.studentGroupLink.findMany({
        where: { groupId },
        select: {
          student: {
            select: {
              parentLinks: { select: { userId: true } },
            },
          },
        },
      })
      parentUserIds = [...new Set(members.flatMap(m => m.student.parentLinks.map(pl => pl.userId)))]
    } else if (targetClass === 'Whole School') {
      // All parents in the school
      const parents = await prisma.user.findMany({
        where: { schoolId, role: 'PARENT' },
        select: { id: true },
      })
      parentUserIds = parents.map(p => p.id)
    } else if (yearGroupId) {
      // Parents with children in classes belonging to this year group
      const children = await prisma.child.findMany({
        where: {
          class: { yearGroupId, schoolId },
        },
        select: { parentId: true },
      })
      parentUserIds = Array.from(new Set(children.map(c => c.parentId)))
    } else if (classId) {
      // Parents with children in this specific class
      const children = await prisma.child.findMany({
        where: { classId },
        select: { parentId: true },
      })
      parentUserIds = Array.from(new Set(children.map(c => c.parentId)))
    }

    if (parentUserIds.length === 0) return

    // Bulk-create Notification rows
    await prisma.notification.createMany({
      data: parentUserIds.map(userId => ({
        userId,
        type,
        title,
        body,
        resourceType: resourceType || null,
        resourceId: resourceId || null,
        data: data ? JSON.parse(JSON.stringify(data)) : undefined,
        schoolId,
      })),
    })

    // Dispatch push notifications via FCM
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: { in: parentUserIds } },
      select: { token: true },
    })

    if (deviceTokens.length > 0) {
      const tokens = deviceTokens.map(dt => dt.token)
      const result = await sendPushNotification(tokens, {
        title,
        body,
        data: {
          type,
          ...(resourceType && { resourceType }),
          ...(resourceId && { resourceId }),
          ...(data && Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          )),
        },
      })

      if (result.failedTokens.length > 0) {
        await removeInvalidTokens(result.failedTokens)
      }

      console.log(`Push sent: ${result.successCount} success, ${result.failureCount} failed`)
    }
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
}

// ECA-specific notification helpers

interface EcaRegistrationOpenParams {
  req: Request
  termId: string
  termName: string
  registrationCloses: Date
  schoolId: string
}

export async function sendEcaRegistrationOpenNotification({
  req,
  termId,
  termName,
  registrationCloses,
  schoolId,
}: EcaRegistrationOpenParams): Promise<void> {
  const closesStr = registrationCloses.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
  })
  await sendNotification({
    req,
    type: ECA_NOTIFICATION_TYPES.REGISTRATION_OPEN,
    title: 'ECA Registration Open',
    body: `Registration for ${termName} activities is now open. Sign up by ${closesStr}!`,
    resourceType: 'ECA_TERM',
    resourceId: termId,
    data: { termId, termName },
    target: { targetClass: 'Whole School', schoolId },
  })
}

interface EcaRegistrationClosingParams {
  req: Request
  termId: string
  termName: string
  schoolId: string
}

export async function sendEcaRegistrationClosingNotification({
  req,
  termId,
  termName,
  schoolId,
}: EcaRegistrationClosingParams): Promise<void> {
  await sendNotification({
    req,
    type: ECA_NOTIFICATION_TYPES.REGISTRATION_CLOSING,
    title: 'ECA Registration Closing Soon',
    body: `Last chance to register for ${termName} activities! Registration closes in 24 hours.`,
    resourceType: 'ECA_TERM',
    resourceId: termId,
    data: { termId, termName },
    target: { targetClass: 'Whole School', schoolId },
  })
}

interface EcaAllocationResultsParams {
  req: Request
  termId: string
  termName: string
  schoolId: string
}

export async function sendEcaAllocationResultsNotification({
  req,
  termId,
  termName,
  schoolId,
}: EcaAllocationResultsParams): Promise<void> {
  await sendNotification({
    req,
    type: ECA_NOTIFICATION_TYPES.ALLOCATION_RESULTS,
    title: 'ECA Allocations Published',
    body: `Activity allocations for ${termName} have been published. Check your child's activities now!`,
    resourceType: 'ECA_TERM',
    resourceId: termId,
    data: { termId, termName },
    target: { targetClass: 'Whole School', schoolId },
  })
}

interface EcaInvitationParams {
  req: Request
  activityId: string
  activityName: string
  studentId: string
  isTryout: boolean
  schoolId: string
}

export async function sendEcaInvitationNotification({
  req,
  activityId,
  activityName,
  studentId,
  isTryout,
  schoolId,
}: EcaInvitationParams): Promise<void> {
  // Get the student's parent(s)
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      parentLinks: { select: { userId: true } },
    },
  })

  if (!student || student.parentLinks.length === 0) return

  const parentUserIds = student.parentLinks.map(pl => pl.userId)
  const notificationType = isTryout ? 'try-out' : 'invitation'

  // Create notifications directly for these parents
  await prisma.notification.createMany({
    data: parentUserIds.map(userId => ({
      userId,
      type: ECA_NOTIFICATION_TYPES.INVITATION,
      title: `ECA ${isTryout ? 'Try-out' : 'Invitation'}`,
      body: `${student.firstName} has received a${isTryout ? ' try-out' : 'n invitation'} for ${activityName}. Please respond in the Activities section.`,
      resourceType: 'ECA_ACTIVITY',
      resourceId: activityId,
      data: { activityId, activityName, studentId, isTryout },
      schoolId,
    })),
  })

  // Send push notifications
  const deviceTokens = await prisma.deviceToken.findMany({
    where: { userId: { in: parentUserIds } },
    select: { token: true },
  })

  if (deviceTokens.length > 0) {
    const tokens = deviceTokens.map(dt => dt.token)
    const result = await sendPushNotification(tokens, {
      title: `ECA ${isTryout ? 'Try-out' : 'Invitation'}`,
      body: `${student.firstName} has received a${isTryout ? ' try-out' : 'n invitation'} for ${activityName}.`,
      data: {
        type: ECA_NOTIFICATION_TYPES.INVITATION,
        resourceType: 'ECA_ACTIVITY',
        resourceId: activityId,
        activityId,
        studentId,
      },
    })

    if (result.failedTokens.length > 0) {
      await removeInvalidTokens(result.failedTokens)
    }
  }
}
