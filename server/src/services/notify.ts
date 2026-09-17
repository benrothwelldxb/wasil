import { Request } from 'express'
import prisma from './prisma.js'
import { refreshServiceGroup } from './serviceGroups.js'
import { enqueuePush, enqueueEmail } from './outbox.js'

// Notification types that warrant an email fallback when the parent has been
// inactive in the app. Chatty / repetitive types are deliberately excluded —
// we don't want to email someone every time a schedule item changes.
const EMAIL_FALLBACK_TYPES = new Set([
  'MESSAGE',
  'WEEKLY_MESSAGE',
  'EMERGENCY_ALERT',
  'FORM',
  'EVENT',
  'PULSE_SURVEY',
  'ECA_REGISTRATION_OPEN',
  'ECA_ALLOCATION_RESULTS',
  'CONSULTATION',
])

// How long without a login before we treat a parent as "inactive" and start
// emailing important notifications too.
const INACTIVE_THRESHOLD_DAYS = 7

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
  /** The guardians of these specific children — the audience for something that
   *  is true of a named set of pupils rather than of a class or a year, e.g.
   *  the children on one bus. Resolves to parents like every other branch. */
  studentIds?: string[]
  /** An audience already resolved by the caller, used when one announcement
   *  fans out to several targets: a post to three classes is three rows in the
   *  feed but ONE thing that happened, and a parent with children in two of
   *  them should be told once rather than have their phone buzz twice. Still
   *  parents only — the ids are filtered to PARENT-role users at this school. */
  parentUserIds?: string[]
  schoolId: string
}

interface SendNotificationParams {
  /** Unused — kept because every request-path caller passes it. Optional so a
   *  background job (which has no request) can notify too. */
  req?: Request
  type: string
  title: string
  body: string
  resourceType?: string
  resourceId?: string
  data?: Record<string, unknown>
  target: NotificationTarget
}

interface SendStaffNotificationParams {
  schoolId: string
  type: string
  title: string
  body: string
  resourceType?: string
  resourceId?: string
  data?: Record<string, unknown>
  /** Which staff to reach. Defaults to the school office (ADMIN/SUPER_ADMIN). */
  roles?: string[]
  /** Narrow to named individuals — e.g. the staff @mentioned in a weekly
   *  update. Still intersected with `roles`, so this cannot widen the audience
   *  or reach a parent; an empty array after filtering sends nothing. */
  userIds?: string[]
}

/**
 * Notify STAFF — never parents.
 *
 * `sendNotification` above resolves an audience of PARENTS and nothing else:
 * every branch of its target resolution ends in parent user ids. A caller that
 * wanted "the school office" and reached for `targetClass: 'Whole School'`
 * therefore broadcast to every parent in the school. That is exactly how a
 * parent came to receive another family's absence request, naming both the
 * submitting parent and their child.
 *
 * So staff notifications get their own function with no target vocabulary to
 * misuse: an explicit role list, resolved against this school only. Parents are
 * unreachable from here by construction — `PARENT` and `ILSA` are refused even
 * if passed in.
 */
export async function sendStaffNotification({
  schoolId,
  type,
  title,
  body,
  resourceType,
  resourceId,
  data,
  roles = ['ADMIN', 'SUPER_ADMIN'],
  userIds,
}: SendStaffNotificationParams): Promise<void> {
  try {
    // Hard floor: a parent or an ILSA can never be an audience here, whatever
    // the caller asks for.
    const staffRoles = roles.filter((r) => r === 'STAFF' || r === 'ADMIN' || r === 'SUPER_ADMIN')
    if (staffRoles.length === 0) return

    // A named-individual send with nobody named is a no-op, never a broadcast.
    if (userIds && userIds.length === 0) return

    const staff = await prisma.user.findMany({
      where: {
        schoolId,
        role: { in: staffRoles as never },
        ...(userIds ? { id: { in: userIds } } : {}),
      },
      select: { id: true },
    })
    const staffIds = staff.map((u) => u.id)
    if (staffIds.length === 0) return

    await prisma.notification.createMany({
      data: staffIds.map((userId) => ({
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

    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: { in: staffIds } },
      select: { token: true },
    })
    if (deviceTokens.length > 0) {
      await enqueuePush(schoolId, {
        tokens: deviceTokens.map((dt) => dt.token),
        title,
        body,
        data: {
          type,
          ...(resourceType && { resourceType }),
          ...(resourceId && { resourceId }),
          ...(data &&
            Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))),
        },
      })
    }
  } catch (error) {
    console.error('Failed to send staff notification:', error)
  }
}

/**
 * Notify PARENTS. Every target below resolves to parent user ids — there is no
 * staff branch and never was, so `targetClass: 'Whole School'` means "every
 * parent in the school", NOT "everyone". For a staff audience use
 * `sendStaffNotification`.
 */
/**
 * Which parents an audience resolves to.
 *
 * Extracted from sendNotification so anything else addressing the same audience
 * — an Admin Notice's email signal, for instance — reaches exactly the same
 * people. Two implementations of "who is in Year 3" would drift, and the one
 * that drifted would be the one nobody noticed.
 */
/**
 * Drop the parents whose children have ALL left.
 *
 * Only used for the whole-school audience, where there is no class or year to
 * filter on and the query is "every parent in the school" — which keeps
 * delivering a school's messages to families who left it.
 *
 * The rule is deliberately narrow, and the same one the activation funnel uses:
 * a parent is dropped only if they have links AND every one is to a leaver. A
 * parent with NO link at all stays in — that is a linking gap, not a departure,
 * and wrongly silencing a current family is a worse failure than wrongly
 * including a departed one.
 */
async function withoutFamiliesWhoHaveLeft(parentIds: string[]): Promise<string[]> {
  if (parentIds.length === 0) return parentIds
  const links = await prisma.parentStudentLink.findMany({
    where: { userId: { in: parentIds } },
    select: { userId: true, student: { select: { leftAt: true } } },
  })
  const linked = new Set<string>()
  const hasCurrentChild = new Set<string>()
  for (const l of links) {
    linked.add(l.userId)
    if (!l.student.leftAt) hasCurrentChild.add(l.userId)
  }
  return parentIds.filter(id => !linked.has(id) || hasCurrentChild.has(id))
}

export async function resolveAudienceParentIds(target: NotificationTarget): Promise<string[]> {
  const { targetClass, classId, yearGroupId, groupId, studentIds, parentUserIds: explicitParentIds, schoolId } = target
  let parentUserIds: string[] = []

  if (explicitParentIds) {
    // Checked first and short-circuits on empty, for the same reason as
    // studentIds: an explicit list of nobody sends to nobody rather than
    // falling through to a wider branch.
    if (explicitParentIds.length === 0) return []
    // Re-filtered rather than trusted. The caller resolved these from targets
    // in this school a moment ago, but the guarantee that this function only
    // ever reaches parents should not depend on a caller getting it right.
    const parents = await prisma.user.findMany({
      where: { id: { in: explicitParentIds }, schoolId, role: 'PARENT' },
      select: { id: true },
    })
    parentUserIds = parents.map(p => p.id)
  } else if (studentIds) {
    // Checked FIRST and short-circuits on empty: an explicit list of nobody
    // must send to nobody, never fall through to a wider branch. The whole
    // point of this audience is that it is narrow.
    if (studentIds.length === 0) return []
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId, leftAt: null },
      select: { parentLinks: { select: { userId: true } } },
    })
    parentUserIds = [...new Set(students.flatMap(s => s.parentLinks.map(pl => pl.userId)))]
  } else if (groupId) {
    // A group derived from a school service is recomputed HERE, at the moment
    // its audience is resolved, rather than maintained as registrations change
    // in nine places across three files. This is the send: whoever is in the
    // service now is who the message reaches, and the group cannot be more
    // stale than the message that reads it.
    //
    // A no-op for an ordinary group.
    await refreshServiceGroup(groupId)

    const members = await prisma.studentGroupLink.findMany({
      where: { groupId },
      select: { student: { select: { parentLinks: { select: { userId: true } } } } },
    })
    parentUserIds = [...new Set(members.flatMap(m => m.student.parentLinks.map(pl => pl.userId)))]
  } else if (targetClass === 'Whole School') {
    const parents = await prisma.user.findMany({
      where: { schoolId, role: 'PARENT' },
      select: { id: true },
    })
    parentUserIds = await withoutFamiliesWhoHaveLeft(parents.map(p => p.id))
  } else if (yearGroupId) {
    // Modern Student/ParentStudentLink tables (ADR 0004); the legacy Child
    // table is no longer consulted.
    const students = await prisma.student.findMany({
      // A pupil who has left is not in this year group, so their family is not
      // in this audience. Without it, a family who left in September went on
      // receiving every year-group message for the rest of the year.
      where: { schoolId, class: { yearGroupId }, leftAt: null },
      select: { parentLinks: { select: { userId: true } } },
    })
    parentUserIds = [...new Set(students.flatMap(s => s.parentLinks.map(pl => pl.userId)))]
  } else if (classId) {
    const students = await prisma.student.findMany({
      where: { classId, leftAt: null },
      select: { parentLinks: { select: { userId: true } } },
    })
    parentUserIds = [...new Set(students.flatMap(s => s.parentLinks.map(pl => pl.userId)))]
  }

  return parentUserIds
}

export async function sendNotification({ req, type, title, body, resourceType, resourceId, data, target }: SendNotificationParams): Promise<void> {
  try {
    const { schoolId } = target

    let parentUserIds = await resolveAudienceParentIds(target)
    if (parentUserIds.length === 0) return

    // Map notification type to preference key
    const PREF_MAP: Record<string, string> = {
      MESSAGE: 'posts',
      WEEKLY_MESSAGE: 'weeklyUpdates',
      DIRECT_MESSAGE: 'directMessages',
      EMERGENCY_ALERT: 'emergencyAlerts',
      FORM: 'forms',
      EVENT: 'events',
      EVENT_REMINDER: 'events',
      PULSE_SURVEY: 'pulseSurveys',
      ECA_REGISTRATION_OPEN: 'ecaUpdates',
      ECA_REGISTRATION_CLOSING: 'ecaUpdates',
      ECA_ALLOCATION_RESULTS: 'ecaUpdates',
      ECA_INVITATION: 'ecaUpdates',
      CONSULTATION: 'consultations',
      SCHOOL_SERVICE: 'schoolServices',
      SCHEDULE_CHANGE: 'scheduleReminders',
    }

    const prefKey = PREF_MAP[type]

    // Filter out users who have disabled this notification type
    if (prefKey) {
      const prefs = await prisma.notificationPreference.findMany({
        where: {
          userId: { in: parentUserIds },
          [prefKey]: false,
        },
        select: { userId: true },
      })
      const disabledUserIds = new Set(prefs.map(p => p.userId))
      if (disabledUserIds.size > 0) {
        parentUserIds = parentUserIds.filter(id => !disabledUserIds.has(id))
      }
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

    // Enqueue the push delivery — worker drains and retries on failure
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: { in: parentUserIds } },
      select: { token: true },
    })

    if (deviceTokens.length > 0) {
      await enqueuePush(schoolId, {
        tokens: deviceTokens.map(dt => dt.token),
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
    }

    // Email fallback: for important notification types, send an email to
    // any parent who hasn't opened the app in a week. Push alone is unreliable
    // if the parent has disabled OS-level notifications or hasn't installed
    // the app.
    if (EMAIL_FALLBACK_TYPES.has(type)) {
      const inactiveCutoff = new Date(Date.now() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)
      const inactiveParents = await prisma.user.findMany({
        where: {
          id: { in: parentUserIds },
          // Test Parents have fake mailboxes — deliver push + in-app to them
          // (done above), but NEVER email them. Only the email fallback is gated;
          // the notification/push fan-out still reaches the test parent.
          isTest: false,
          email: { not: '' },
          OR: [
            { lastLoginAt: null },
            { lastLoginAt: { lt: inactiveCutoff } },
          ],
        },
        select: { email: true },
      })
      if (inactiveParents.length > 0) {
        const school = await prisma.school.findUnique({
          where: { id: schoolId },
          select: { name: true },
        })
        const subject = `[${school?.name ?? 'School'}] ${title}`
        const html = `<!DOCTYPE html><html><body style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <p style="color: #475569; font-size: 12px; margin: 0 0 6px;">${school?.name ?? ''}</p>
          <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 14px;">${title}</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.55; margin: 0 0 16px; white-space: pre-line;">${body}</p>
          <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0;">You're receiving this email because we noticed you haven't opened the app in a while. Open the app to manage how you're contacted.</p>
        </body></html>`
        const text = `${school?.name ?? ''}\n${title}\n\n${body}\n\nYou're receiving this email because we noticed you haven't opened the app in a while.`
        for (const parent of inactiveParents) {
          await enqueueEmail(schoolId, { to: parent.email, subject, html, text })
        }
      }
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

  // Enqueue push delivery — worker drains and retries
  const deviceTokens = await prisma.deviceToken.findMany({
    where: { userId: { in: parentUserIds } },
    select: { token: true },
  })

  if (deviceTokens.length > 0) {
    await enqueuePush(schoolId, {
      tokens: deviceTokens.map(dt => dt.token),
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
  }
}
