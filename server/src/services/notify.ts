import { Request } from 'express'
import prisma from './prisma.js'
import { sendPushNotification, removeInvalidTokens } from './firebase.js'

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
