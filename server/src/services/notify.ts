import { Request } from 'express'
import prisma from './prisma.js'

interface NotificationTarget {
  targetClass: string
  classId?: string
  yearGroupId?: string
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
    const { targetClass, classId, yearGroupId, schoolId } = target

    // Resolve target audience into parent user IDs
    let parentUserIds: string[] = []

    if (targetClass === 'Whole School') {
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
      parentUserIds = [...new Set(children.map(c => c.parentId))]
    } else if (classId) {
      // Parents with children in this specific class
      const children = await prisma.child.findMany({
        where: { classId },
        select: { parentId: true },
      })
      parentUserIds = [...new Set(children.map(c => c.parentId))]
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

    // TODO: read DeviceToken rows and dispatch push via FCM/APNs
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
}
