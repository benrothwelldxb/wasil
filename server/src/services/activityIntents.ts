import prisma from './prisma.js'
import { enqueuePush } from './outbox.js'

/**
 * Delivery of Wasil Active's communication intents to parents.
 *
 * Active is the system of record for extra-curricular activities — programmes,
 * staffing, choices, allocation, attendance. Connect consumes the outcome and
 * tells the family. Nothing here models any of Active's domain; `payload` is
 * carried opaquely and only read for the couple of fields that go into the copy.
 *
 * The delivery path is the one Connect already uses for a per-child ECA
 * notification (see sendEcaInvitationNotification in notify.ts): a Notification
 * row per parent, then a single push enqueued to the outbox that already retries.
 */

/** Event types we know how to say something to a parent about. Active has more,
 *  and may send them later; anything not listed is rejected 422 (permanent) so
 *  Active stops rather than retrying something we will never understand. */
export const ACTIVITY_INTENT_EVENT_TYPES = [
  'activity.assignment_confirmed',
  'activity.assignment_waitlisted',
] as const

export type ActivityIntentEventType = (typeof ACTIVITY_INTENT_EVENT_TYPES)[number]

export function isKnownEventType(value: string): value is ActivityIntentEventType {
  return (ACTIVITY_INTENT_EVENT_TYPES as readonly string[]).includes(value)
}

/** Notification `type` values, following the ECA_* convention already in
 *  notify.ts. Both map to the `ecaUpdates` preference, like every other ECA
 *  notification Connect sends. */
const NOTIFICATION_TYPE: Record<ActivityIntentEventType, string> = {
  'activity.assignment_confirmed': 'ECA_ASSIGNMENT_CONFIRMED',
  'activity.assignment_waitlisted': 'ECA_ASSIGNMENT_WAITLISTED',
}

export interface ActivityIntent {
  eventType: ActivityIntentEventType
  hubSchoolId: string
  hubPupilId: string | null
  payload: Record<string, unknown>
  idempotencyKey: string
  occurredAt: Date
}

/** Always 2xx-shaped: either we delivered, or we accepted and recorded that
 *  there was nobody to tell. A caller-fixable problem throws before we get here
 *  (validation) and an unexpected one throws out of `recordIntent` as a 500,
 *  which Active treats as retryable. */
export interface IntentResult {
  id: string
  status: 'DELIVERED' | 'UNDELIVERABLE'
  reason?: string
  recipients: number
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberField(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The words a parent actually reads.
 *
 * `activityName` is read defensively rather than required: Active's payload is
 * opaque by contract and its own conformance test sends an assignment with no
 * name on it, so a missing one has to degrade into a sentence that still makes
 * sense instead of failing the whole intent.
 */
export function composeCopy(
  eventType: ActivityIntentEventType,
  payload: Record<string, unknown>,
  childName: string
): { title: string; body: string } {
  const activity = stringField(payload, 'activityName') ?? 'an activity'

  if (eventType === 'activity.assignment_confirmed') {
    const rank = numberField(payload, 'preferenceRank')
    // Rank 1 is a first choice; saying so is the difference between a placement
    // notice and good news. Any other rank is left unsaid rather than spelled
    // out — "their third choice" is not a thing to tell a parent.
    const firstChoice = rank === 1 ? ' Their first choice.' : ''
    return {
      title: 'Activity place confirmed',
      body: `${childName} has a place in ${activity}.${firstChoice}`,
    }
  }

  const position = numberField(payload, 'waitlistPosition')
  return {
    title: 'Activity waiting list',
    body:
      position !== null
        ? `${childName} is number ${position} on the waiting list for ${activity}.`
        : `${childName} is on the waiting list for ${activity}.`,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  )
}

/**
 * Record an intent and, if there is somebody to tell, tell them.
 *
 * Idempotent on `idempotencyKey`: a key we have already seen returns the
 * ORIGINAL result and sends nothing. The write of the receipt and the write of
 * the notifications share one transaction, so a failure part-way through leaves
 * the key unclaimed and Active's retry can do the whole thing again — the
 * alternative (claim first, deliver after) would turn one failed delivery into a
 * permanently silent one.
 */
export async function recordIntent(intent: ActivityIntent): Promise<IntentResult> {
  const existing = await prisma.partnerIntent.findUnique({
    where: { idempotencyKey: intent.idempotencyKey },
    select: { id: true, status: true, reason: true, recipients: true },
  })
  if (existing) {
    return {
      id: existing.id,
      status: existing.status === 'DELIVERED' ? 'DELIVERED' : 'UNDELIVERABLE',
      reason: existing.reason ?? undefined,
      recipients: existing.recipients,
    }
  }

  const base = {
    idempotencyKey: intent.idempotencyKey,
    eventType: intent.eventType,
    hubSchoolId: intent.hubSchoolId,
    hubPupilId: intent.hubPupilId,
    payload: intent.payload as object,
    occurredAt: intent.occurredAt,
  }

  // Everything below that resolves to "nobody to tell" is ACCEPTED, not
  // rejected. Active is explicit that an unknown pupil must never be a 404, and
  // a retry would not help: Connect's roster comes from Hub, so a pupil we have
  // not synced yet will still be missing on the next attempt. Recording it is
  // what makes the gap visible instead of silent.
  const undeliverable = async (reason: string, extra: { schoolId?: string; studentId?: string } = {}) => {
    const row = await prisma.partnerIntent.create({
      data: { ...base, ...extra, status: 'UNDELIVERABLE', reason, recipients: 0 },
      select: { id: true },
    })
    return { id: row.id, status: 'UNDELIVERABLE' as const, reason, recipients: 0 }
  }

  try {
    const school = await prisma.school.findUnique({
      where: { hubSchoolId: intent.hubSchoolId },
      select: { id: true },
    })
    if (!school) return await undeliverable('unknown_school')

    if (!intent.hubPupilId) return await undeliverable('no_pupil', { schoolId: school.id })

    const student = await prisma.student.findUnique({
      where: { hubPupilId: intent.hubPupilId },
      select: { id: true, firstName: true, schoolId: true, parentLinks: { select: { userId: true } } },
    })
    if (!student || student.schoolId !== school.id) {
      return await undeliverable('unknown_pupil', { schoolId: school.id })
    }

    // A child can have more than one linked guardian and they all get told.
    const linkedIds = [...new Set(student.parentLinks.map(l => l.userId))]
    const parents = linkedIds.length
      ? await prisma.user.findMany({
          where: { id: { in: linkedIds }, schoolId: school.id, role: 'PARENT' },
          select: { id: true },
        })
      : []
    let parentIds = parents.map(p => p.id)
    if (parentIds.length === 0) {
      return await undeliverable('no_linked_parent', { schoolId: school.id, studentId: student.id })
    }

    // Honour the ECA notification preference, as every other ECA notification
    // does (notify.ts maps the ECA_* types to `ecaUpdates`).
    const optedOut = await prisma.notificationPreference.findMany({
      where: { userId: { in: parentIds }, ecaUpdates: false },
      select: { userId: true },
    })
    if (optedOut.length > 0) {
      const off = new Set(optedOut.map(p => p.userId))
      parentIds = parentIds.filter(id => !off.has(id))
    }
    if (parentIds.length === 0) {
      return await undeliverable('all_recipients_opted_out', {
        schoolId: school.id,
        studentId: student.id,
      })
    }

    const { title, body } = composeCopy(intent.eventType, intent.payload, student.firstName)
    const activityId = stringField(intent.payload, 'activityId')

    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: { in: parentIds } },
      select: { token: true },
    })

    const created = await prisma.$transaction(async tx => {
      const row = await tx.partnerIntent.create({
        data: {
          ...base,
          schoolId: school.id,
          studentId: student.id,
          status: 'DELIVERED',
          recipients: parentIds.length,
        },
        select: { id: true },
      })

      await tx.notification.createMany({
        data: parentIds.map(userId => ({
          userId,
          type: NOTIFICATION_TYPE[intent.eventType],
          title,
          body,
          resourceType: 'ECA_ACTIVITY',
          resourceId: activityId,
          data: { ...intent.payload, studentId: student.id, eventType: intent.eventType },
          schoolId: school.id,
        })),
      })

      if (deviceTokens.length > 0) {
        await enqueuePush(
          school.id,
          {
            tokens: deviceTokens.map(dt => dt.token),
            title,
            body,
            data: {
              type: NOTIFICATION_TYPE[intent.eventType],
              resourceType: 'ECA_ACTIVITY',
              ...(activityId ? { resourceId: activityId, activityId } : {}),
              studentId: student.id,
            },
          },
          tx
        )
      }

      return row
    })

    return { id: created.id, status: 'DELIVERED', recipients: parentIds.length }
  } catch (error) {
    // Two requests carrying the same key can race past the read above. The
    // loser reads the winner's row and reports it, which is the same answer it
    // would have given had it arrived a moment later.
    if (isUniqueViolation(error)) {
      const winner = await prisma.partnerIntent.findUnique({
        where: { idempotencyKey: intent.idempotencyKey },
        select: { id: true, status: true, reason: true, recipients: true },
      })
      if (winner) {
        return {
          id: winner.id,
          status: winner.status === 'DELIVERED' ? 'DELIVERED' : 'UNDELIVERABLE',
          reason: winner.reason ?? undefined,
          recipients: winner.recipients,
        }
      }
    }
    throw error
  }
}
