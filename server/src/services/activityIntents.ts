import prisma from './prisma.js'
import { enqueuePush } from './outbox.js'

/**
 * Delivery of Wasil Active's communication intents to parents.
 *
 * Active is the system of record for extra-curricular activities — programmes,
 * staffing, choices, allocation, attendance. Connect consumes the outcome and
 * tells the family. Nothing here models any of Active's domain; `payload` is
 * carried opaquely and only read for the fields that go into the copy.
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
  'fixture.availability_requested',
  'fixture.team_selected',
  'fixture.team_removed',
  'fixture.cancelled',
  'fixture.back_on',
  'fixture.update',
  'fixture.availability_reminder',
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
  'fixture.availability_requested': 'ECA_FIXTURE_AVAILABILITY',
  'fixture.team_selected': 'ECA_FIXTURE_TEAM',
  'fixture.team_removed': 'ECA_FIXTURE_TEAM',
  'fixture.cancelled': 'ECA_FIXTURE_STATUS',
  'fixture.back_on': 'ECA_FIXTURE_STATUS',
  // Same preference as a cancellation: it is news about whether and how the
  // afternoon happens.
  'fixture.update': 'ECA_FIXTURE_STATUS',
  // The same question again, so the same preference as asking it.
  'fixture.availability_reminder': 'ECA_FIXTURE_AVAILABILITY',
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
 * "Wednesday 11 November", from a YYYY-MM-DD at the school.
 *
 * Built from the string's own parts. Active sends the school's calendar day, and
 * reading it as an instant and formatting it in another zone is how a parent
 * gets told the wrong day.
 */
function fixtureDate(date: string | null): string | null {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const at = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  const weekday = at.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
  const dayMonth = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  return `${weekday} ${dayMonth}`
}

/**
 * What a parent is told about a fixture.
 *
 * Times are wall clock at the school and already formatted by Active, so they go
 * into the sentence as they are. Anything missing is left out, and the sentence
 * has to still read properly without it.
 */
function composeFixtureCopy(
  eventType: Extract<ActivityIntentEventType, `fixture.${string}`>,
  payload: Record<string, unknown>,
  childName: string
): { title: string; body: string } {
  const fixture = stringField(payload, 'fixtureName') ?? 'a fixture'
  const date = fixtureDate(stringField(payload, 'date'))
  const on = date ? ` on ${date}` : ''
  // Word for word, like the cancellation reason: the teacher wrote it for parents.
  const noteField = stringField(payload, 'familyNote')
  const note = noteField ? ` ${noteField}` : ''

  if (eventType === 'fixture.availability_requested') {
    return {
      title: `Can ${childName} play?`,
      body: `${fixture}${on}.${note} Open This Week in Connect to reply.`,
    }
  }

  // The question again, for a family that has not answered. Sent by a teacher
  // pressing "remind", never on a timer of Connect's.
  if (eventType === 'fixture.availability_reminder') {
    return {
      title: `Reminder: can ${childName} play?`,
      body: `${fixture}${on}.${note} We have not had your reply yet. Open This Week in Connect to answer.`,
    }
  }

  // Something changed on the day, written by the teacher for parents. Their
  // words are the message; the standing note is not repeated under it.
  if (eventType === 'fixture.update') {
    const message = stringField(payload, 'message')
    return {
      title: `Update on ${childName}'s fixture`,
      body: message ? `${fixture}${on}: ${message}` : `There is an update about ${fixture}${on}.`,
    }
  }

  if (eventType === 'fixture.team_removed') {
    return {
      title: 'Team change',
      body: `${childName} is no longer in the team for ${fixture}${on}.`,
    }
  }

  // The reason goes in word for word: the teacher wrote it for parents to read.
  if (eventType === 'fixture.cancelled') {
    const reason = stringField(payload, 'reason')
    return {
      title: `${childName}'s fixture is cancelled`,
      body: `${fixture}${on} is cancelled.${reason ? ` ${reason}` : ''}`,
    }
  }

  const substitute = stringField(payload, 'role') === 'substitute'
  const changed = stringField(payload, 'previousRole') !== null
  const practical: string[] = []
  const out = stringField(payload, 'meetAt') ?? stringField(payload, 'departsAt')
  const back = stringField(payload, 'returnsAt')
  if (out && back) practical.push(`Out of lessons from ${out}, back by ${back}.`)
  else if (out) practical.push(`Out of lessons from ${out}.`)
  else if (back) practical.push(`Back by ${back}.`)
  const kit = stringField(payload, 'kit')
  if (kit) practical.push(`Kit: ${kit}.`)
  const transport = stringField(payload, 'transport')
  if (transport) practical.push(`Transport: ${transport}.`)
  const extra = `${practical.length ? ` ${practical.join(' ')}` : ''}${note}`

  if (eventType === 'fixture.back_on') {
    return {
      title: `${childName}'s fixture is back on`,
      body: `${fixture}${on} is going ahead after all.${extra}`,
    }
  }

  if (changed) {
    return {
      title: 'Team change',
      body: substitute
        ? `${childName} is now a substitute for ${fixture}${on}.${extra}`
        : `${childName} is now playing in ${fixture}${on}.${extra}`,
    }
  }
  return substitute
    ? { title: `${childName} is a substitute`, body: `${childName} is a substitute for ${fixture}${on}.${extra}` }
    : { title: `${childName} is in the team`, body: `${childName} is playing in ${fixture}${on}.${extra}` }
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
  if (
    eventType === 'fixture.availability_requested' ||
    eventType === 'fixture.team_selected' ||
    eventType === 'fixture.team_removed' ||
    eventType === 'fixture.cancelled' ||
    eventType === 'fixture.back_on' ||
    eventType === 'fixture.update' ||
    eventType === 'fixture.availability_reminder'
  ) {
    return composeFixtureCopy(eventType, payload, childName)
  }

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
      select: { id: true, activeScheduleEnabled: true },
    })
    if (!school) return await undeliverable('unknown_school')

    // A question with nowhere to answer it is worse than no question: the reply
    // buttons live on This Week. Recorded with a reason so Active can tell the
    // teacher, rather than a parent being asked and left unable to say.
    if (
      (intent.eventType === 'fixture.availability_requested' ||
        intent.eventType === 'fixture.availability_reminder') &&
      !school.activeScheduleEnabled
    ) {
      return await undeliverable('this_week_off', { schoolId: school.id })
    }

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
    const fixtureId = stringField(intent.payload, 'fixtureId')
    const isFixture = intent.eventType.startsWith('fixture.')
    const resourceType = isFixture ? 'ACTIVE_FIXTURE' : 'ECA_ACTIVITY'
    // Where a tap on the notification opens. Every fixture message is about
    // something This Week shows, and the availability question can only be
    // answered there or on the home page.
    const route = isFixture ? '/this-week' : null
    const resourceId = isFixture ? fixtureId : activityId

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
          resourceType,
          resourceId,
          data: { ...intent.payload, studentId: student.id, eventType: intent.eventType, ...(route ? { route } : {}) },
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
              resourceType,
              ...(activityId ? { resourceId: activityId, activityId } : {}),
              ...(isFixture && fixtureId ? { resourceId: fixtureId, fixtureId } : {}),
              studentId: student.id,
              ...(route ? { route } : {}),
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
