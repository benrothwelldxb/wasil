import { Router } from 'express'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, isStaff, loadUserWithRelations, type UserWithRelations } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { logAudit, computeChanges } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'
import { translateTexts } from '../services/translation.js'
import { generateICS } from '../services/ics.js'
import type { ICSEvent } from '../services/ics.js'
import { submitProposal } from '../services/hubCalendar.js'
import { zonedTimeToUtc } from '../services/dateTime.js'

const router = Router()

function buildGoogleCalendarUrl(event: { title: string; description?: string | null; date: Date; time?: string | null; location?: string | null }): string {
  const title = encodeURIComponent(event.title)
  const details = encodeURIComponent(event.description || '')
  const location = encodeURIComponent(event.location || '')
  const dateStr = event.date.toISOString().split('T')[0].replace(/-/g, '')
  if (event.time) {
    const startTime = event.time.replace(':', '') + '00'
    return `https://calendar.google.com/calendar/event?action=TEMPLATE&text=${title}&dates=${dateStr}T${startTime}/${dateStr}T${startTime}&details=${details}&location=${location}`
  }
  // All-day event
  const nextDay = new Date(event.date)
  nextDay.setDate(nextDay.getDate() + 1)
  const endStr = nextDay.toISOString().split('T')[0].replace(/-/g, '')
  return `https://calendar.google.com/calendar/event?action=TEMPLATE&text=${title}&dates=${dateStr}/${endStr}&details=${details}&location=${location}`
}

const eventTargetSchema = z.object({
  classId: z.string().optional(),
  yearGroupId: z.string().optional(),
})

const createEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  date: z.string().min(1),
  time: z.string().optional(),
  location: z.string().optional(),
  targetClass: z.string().min(1),
  classId: z.string().optional(),
  yearGroupId: z.string().optional(),
  groupId: z.string().optional(),
  // Multi-target: zero or more targeted classes / year-groups. Empty array (or
  // omitted with a whole-school targetClass) = whole-school. When exactly one
  // target is given, the legacy scalar classId/yearGroupId are populated too so
  // old single-target callers keep working.
  targets: z.array(eventTargetSchema).optional(),
  requiresRsvp: z.boolean().optional(),
  recurrence: z.string().optional(),
  recurrenceEnd: z.string().optional(),
  customIntervalDays: z.number().optional(),
})

// Resolve request targeting into EventTarget rows + the legacy scalar fields.
// - With a `targets` array: filter to non-empty rows; a single row also fills
//   the scalar classId/yearGroupId (multi-target leaves them null).
// - Without a `targets` array (legacy caller): derive one row from the scalar
//   classId/yearGroupId, preserving the exact legacy scalar values.
function resolveTargeting(body: {
  targets?: { classId?: string; yearGroupId?: string }[]
  classId?: string
  yearGroupId?: string
}): {
  rows: { classId: string | null; yearGroupId: string | null }[]
  scalarClassId: string | null
  scalarYearGroupId: string | null
} {
  if (Array.isArray(body.targets)) {
    const rows = body.targets
      .map(t => ({ classId: t.classId || null, yearGroupId: t.yearGroupId || null }))
      .filter(t => t.classId || t.yearGroupId)
    const single = rows.length === 1 ? rows[0] : null
    return {
      rows,
      scalarClassId: single?.classId ?? null,
      scalarYearGroupId: single?.yearGroupId ?? null,
    }
  }
  const classId = body.classId || null
  const yearGroupId = body.yearGroupId || null
  const rows: { classId: string | null; yearGroupId: string | null }[] = []
  if (classId) rows.push({ classId, yearGroupId: null })
  else if (yearGroupId) rows.push({ classId: null, yearGroupId })
  return { rows, scalarClassId: classId, scalarYearGroupId: yearGroupId }
}

// The parent-visibility OR clause. Whole-school (label 'Whole School'/'all'),
// OR an EventTarget row matching a child's class/year-group, OR the legacy
// scalar classId/yearGroupId still matching (safety for un-backfilled rows),
// OR a scalar groupId match (Hub has no groups — targeting stays scalar).
function buildVisibilityOR(
  allClassIds: string[],
  childYearGroupIds: string[],
  childGroupIds: string[],
): any[] {
  const or: any[] = [
    { targetClass: 'Whole School' },
    { targetClass: 'all' },
  ]
  if (allClassIds.length > 0) {
    or.push({ targets: { some: { classId: { in: allClassIds } } } })
    or.push({ classId: { in: allClassIds } })
  }
  if (childYearGroupIds.length > 0) {
    or.push({ targets: { some: { yearGroupId: { in: childYearGroupIds } } } })
    or.push({ yearGroupId: { in: childYearGroupIds } })
  }
  if (childGroupIds.length > 0) {
    or.push({ groupId: { in: childGroupIds } })
  }
  return or
}

// Serialize EventTarget rows for API responses.
function serializeTargets(
  targets?: { classId: string | null; yearGroupId: string | null }[] | null,
): { classId: string | null; yearGroupId: string | null }[] {
  return (targets ?? []).map(t => ({ classId: t.classId, yearGroupId: t.yearGroupId }))
}

// Where an event came from, for the client badge. A PENDING teacher proposal
// (no hubCalendarEventId yet) is 'proposal'; a mirrored Hub event is 'hub';
// everything else is a Connect-authored event.
function deriveSource(event: {
  proposalStatus?: string | null
  hubCalendarEventId?: string | null
}): 'proposal' | 'hub' | 'connect' {
  if (event.proposalStatus === 'PENDING') return 'proposal'
  if (event.hubCalendarEventId) return 'hub'
  return 'connect'
}

function generateRecurringDates(startDate: string, recurrence: string, endDate: string, customDays?: number): string[] {
  const dates: string[] = [startDate]
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  let current = new Date(start)

  while (true) {
    if (recurrence === 'weekly') current.setDate(current.getDate() + 7)
    else if (recurrence === 'fortnightly') current.setDate(current.getDate() + 14)
    else if (recurrence === 'monthly') current.setMonth(current.getMonth() + 1)
    else if (recurrence === 'custom' && customDays) current.setDate(current.getDate() + customDays)
    else break

    if (current > end) break
    dates.push(current.toISOString().split('T')[0])
  }

  return dates
}

const updateEventSchema = createEventSchema.partial()

// Helper to get filtered events for a user
async function getEventsForUser(user: UserWithRelations) {
  const childClassIds = user.children?.map(c => c.classId) || []
  const studentClassIds = (user.studentLinks?.map(l => l.student?.classId).filter((id): id is string => !!id)) || []
  const allClassIds = [...new Set([...childClassIds, ...studentClassIds])]
  const studentIds = user.studentLinks?.map(l => l.studentId) || []

  const childClasses = allClassIds.length > 0
    ? await prisma.class.findMany({
        where: { id: { in: allClassIds } },
        select: { yearGroupId: true },
      })
    : []
  const childYearGroupIds = [...new Set(childClasses.map(c => c.yearGroupId).filter(Boolean))] as string[]

  const childGroupLinks = studentIds.length > 0
    ? await prisma.studentGroupLink.findMany({
        where: { studentId: { in: studentIds } },
        select: { groupId: true },
      })
    : []
  const childGroupIds = [...new Set(childGroupLinks.map(l => l.groupId))]

  return prisma.event.findMany({
    where: {
      schoolId: user.schoolId,
      OR: buildVisibilityOR(allClassIds, childYearGroupIds, childGroupIds),
    },
    orderBy: { date: 'asc' },
  })
}

// Export all events as ICS calendar file
router.get('/calendar.ics', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const events = await getEventsForUser(user)

    const icsEvents: ICSEvent[] = events.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date.toISOString().split('T')[0],
      startTime: event.time,
      location: event.location,
      allDay: !event.time,
    }))

    const ics = generateICS(icsEvents, 'School Events')

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="school-events.ics"')
    res.send(ics)
  } catch (error) {
    console.error('Error generating events ICS:', error)
    res.status(500).json({ error: 'Failed to generate calendar file' })
  }
})

// Export single event as ICS
router.get('/:id/calendar.ics', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const event = await prisma.event.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const icsEvents: ICSEvent[] = [{
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date.toISOString().split('T')[0],
      startTime: event.time,
      location: event.location,
      allDay: !event.time,
    }]

    const ics = generateICS(icsEvents, event.title)

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`)
    res.send(ics)
  } catch (error) {
    console.error('Error generating event ICS:', error)
    res.status(500).json({ error: 'Failed to generate calendar file' })
  }
})

// Get events (filtered by user's children's classes and groups)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!

    // Use shared helper for filtering, then add RSVP include
    const childClassIds = user.children?.map(c => c.classId) || []
    const studentClassIds = (user.studentLinks?.map(l => l.student?.classId).filter((id): id is string => !!id)) || []
    const allClassIds = [...new Set([...childClassIds, ...studentClassIds])]
    const studentIds = user.studentLinks?.map(l => l.studentId) || []

    const childClasses = allClassIds.length > 0
      ? await prisma.class.findMany({
          where: { id: { in: allClassIds } },
          select: { yearGroupId: true },
        })
      : []
    const childYearGroupIds = [...new Set(childClasses.map(c => c.yearGroupId).filter(Boolean))] as string[]

    const childGroupLinks = studentIds.length > 0
      ? await prisma.studentGroupLink.findMany({
          where: { studentId: { in: studentIds } },
          select: { groupId: true },
        })
      : []
    const childGroupIds = [...new Set(childGroupLinks.map(l => l.groupId))]

    const events = await prisma.event.findMany({
      where: {
        schoolId: user.schoolId,
        // Teacher proposals are NEVER shown to parents while they carry a
        // proposalStatus (PENDING or REJECTED). They appear only once approved,
        // when Hub's sync clears proposalStatus (→ null). Ordinary events and
        // approved proposals both have null, so this admits exactly them.
        proposalStatus: null,
        OR: buildVisibilityOR(allClassIds, childYearGroupIds, childGroupIds),
      },
      include: {
        rsvps: {
          where: { userId: user.id },
        },
        targets: { select: { classId: true, yearGroupId: true } },
      },
      orderBy: { date: 'asc' },
    })

    // Translate events if user has non-English language preference
    const targetLang = user.preferredLanguage || 'en'
    const translationMap = new Map<string, string>()

    if (targetLang !== 'en') {
      const textsToTranslate: string[] = []
      events.forEach(event => {
        textsToTranslate.push(event.title)
        if (event.description) textsToTranslate.push(event.description)
      })

      const translations = await translateTexts(textsToTranslate, targetLang)

      let translationIndex = 0
      events.forEach(event => {
        translationMap.set(event.title, translations[translationIndex++])
        if (event.description) translationMap.set(event.description, translations[translationIndex++])
      })
    }

    const getTranslated = (text: string) => translationMap.get(text) || text

    res.json(events.map(event => ({
      id: event.id,
      title: getTranslated(event.title),
      description: event.description ? getTranslated(event.description) : null,
      date: event.date.toISOString().split('T')[0],
      time: event.time,
      location: event.location,
      targetClass: event.targetClass,
      classId: event.classId,
      yearGroupId: event.yearGroupId,
      groupId: event.groupId,
      targets: serializeTargets(event.targets),
      hubCalendarEventId: event.hubCalendarEventId,
      proposalStatus: event.proposalStatus ?? null,
      source: deriveSource(event),
      schoolId: event.schoolId,
      requiresRsvp: event.requiresRsvp,
      parentEventId: event.parentEventId,
      recurrenceType: event.recurrenceType,
      userRsvp: event.rsvps[0]?.status || null,
      googleCalendarUrl: buildGoogleCalendarUrl(event),
      createdAt: event.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching events:', error)
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

// Get all events with RSVPs (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const events = await prisma.event.findMany({
      where: { schoolId: user.schoolId },
      include: {
        rsvps: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        targets: { select: { classId: true, yearGroupId: true } },
      },
      orderBy: { date: 'asc' },
    })

    res.json(events.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date.toISOString().split('T')[0],
      time: event.time,
      location: event.location,
      targetClass: event.targetClass,
      classId: event.classId,
      yearGroupId: event.yearGroupId,
      groupId: event.groupId,
      targets: serializeTargets(event.targets),
      hubCalendarEventId: event.hubCalendarEventId,
      proposalStatus: event.proposalStatus ?? null,
      submittedByUserId: event.submittedByUserId ?? null,
      source: deriveSource(event),
      schoolId: event.schoolId,
      requiresRsvp: event.requiresRsvp,
      parentEventId: event.parentEventId,
      recurrenceType: event.recurrenceType,
      rsvps: event.rsvps.map(r => ({
        id: r.id,
        status: r.status,
        userName: r.user.name,
        userEmail: r.user.email,
        createdAt: r.createdAt.toISOString(),
      })),
      googleCalendarUrl: buildGoogleCalendarUrl(event),
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching all events:', error)
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

// ---------------------------------------------------------------------------
// Teacher event proposals (Stage 4 / Phase B)
//
// A STAFF member proposes an event for their class. Connect submits it to Hub
// (propose-only, scope `calendar:submit`) and stores a local PENDING Event with
// EventTarget rows but NO hubCalendarEventId — so it renders to parents via the
// normal visibility query as "Pending approval". When a super-admin approves it
// in Hub, the confirmed CalendarEvent syncs back and hubCalendarSync *adopts*
// this row (sets hubCalendarEventId, clears proposalStatus). Hub sends no
// rejection signal and the proposal can't be recalled once submitted.
// ---------------------------------------------------------------------------

const proposalTargetSchema = z.object({
  classId: z.string().optional(),
  yearGroupId: z.string().optional(),
})

const createProposalSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  date: z.string().min(1), // YYYY-MM-DD (school-local calendar date)
  startTime: z.string().optional(), // HH:MM
  endTime: z.string().optional(), // HH:MM
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  category: z.string().optional(),
  note: z.string().optional(),
  targets: z.array(proposalTargetSchema),
})

// Serialize a proposal-Event for the proposal endpoints. `state` folds the
// lifecycle into one field the UI can badge on: 'ON_CALENDAR' once the approval
// has synced in (hubCalendarEventId set), else the raw proposalStatus.
function serializeProposalEvent(
  event: {
    id: string
    title: string
    description: string | null
    date: Date
    time: string | null
    location: string | null
    targetClass: string
    classId: string | null
    yearGroupId: string | null
    schoolId: string
    hubProposalId: string | null
    proposalStatus: string | null
    proposalReviewNote: string | null
    submittedByUserId: string | null
    hubCalendarEventId: string | null
    createdAt: Date
  },
  targets: { classId: string | null; yearGroupId: string | null }[],
) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date.toISOString().split('T')[0],
    time: event.time,
    location: event.location,
    targetClass: event.targetClass,
    classId: event.classId,
    yearGroupId: event.yearGroupId,
    targets: serializeTargets(targets),
    schoolId: event.schoolId,
    hubProposalId: event.hubProposalId,
    proposalStatus: event.proposalStatus,
    proposalReviewNote: event.proposalReviewNote,
    submittedByUserId: event.submittedByUserId,
    hubCalendarEventId: event.hubCalendarEventId,
    source: deriveSource(event),
    state: event.hubCalendarEventId ? 'ON_CALENDAR' : (event.proposalStatus ?? null),
    createdAt: event.createdAt.toISOString(),
  }
}

// Build Hub UTC-ISO starts_at/ends_at from a school-local date + times.
// An all-day (or time-less) event spans local 00:00 → next-day 00:00.
function buildProposalBounds(
  date: string,
  startTime: string | undefined,
  endTime: string | undefined,
  allDay: boolean,
  timezone: string,
): { startsAt: string; endsAt: string } {
  if (allDay) {
    const next = new Date(`${date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    const nextStr = next.toISOString().split('T')[0]
    return {
      startsAt: zonedTimeToUtc(date, '00:00', timezone).toISOString(),
      endsAt: zonedTimeToUtc(nextStr, '00:00', timezone).toISOString(),
    }
  }
  const start = zonedTimeToUtc(date, startTime!, timezone)
  // No end time → a zero-length instant at the start (Hub still requires ends_at).
  const end = zonedTimeToUtc(date, endTime || startTime!, timezone)
  return { startsAt: start.toISOString(), endsAt: end.toISOString() }
}

// Submit a proposal — STAFF/ADMIN/SUPER_ADMIN (isStaff rejects PARENT).
router.post('/proposals', isStaff, validate(createProposalSchema), async (req, res) => {
  try {
    const user = req.user!
    const { title, description, date, startTime, endTime, allDay, location, category, note, targets } = req.body as {
      title: string
      description?: string
      date: string
      startTime?: string
      endTime?: string
      allDay?: boolean
      location?: string
      category?: string
      note?: string
      targets: { classId?: string; yearGroupId?: string }[]
    }

    // Targets must be non-empty and class/year-group only (no whole-school).
    const rawTargets = (targets || [])
      .map(t => ({ classId: t.classId || null, yearGroupId: t.yearGroupId || null }))
      .filter(t => t.classId || t.yearGroupId)
    if (rawTargets.length === 0) {
      return res.status(422).json({ error: 'A proposal must target at least one class or year group (whole-school proposals are not allowed).' })
    }

    const classIds = rawTargets.filter(t => t.classId).map(t => t.classId!) as string[]
    const yearGroupIds = rawTargets.filter(t => !t.classId && t.yearGroupId).map(t => t.yearGroupId!) as string[]

    const [classRows, yearGroupRows, school] = await Promise.all([
      classIds.length
        ? prisma.class.findMany({ where: { id: { in: classIds }, schoolId: user.schoolId }, select: { id: true, name: true, hubClassId: true } })
        : Promise.resolve([]),
      yearGroupIds.length
        ? prisma.yearGroup.findMany({ where: { id: { in: yearGroupIds }, schoolId: user.schoolId }, select: { id: true, name: true, hubYearGroupId: true } })
        : Promise.resolve([]),
      prisma.school.findUnique({ where: { id: user.schoolId }, select: { hubSchoolId: true, timezone: true } }),
    ])

    if (!school?.hubSchoolId) {
      return res.status(422).json({ error: 'This school is not linked to Wasil Hub, so proposals cannot be submitted.' })
    }

    const classById = new Map(classRows.map(c => [c.id, c]))
    const yearGroupById = new Map(yearGroupRows.map(y => [y.id, y]))

    // Resolve each Connect target to its Hub id. Reject (422) if any target is
    // unknown to this school or has no Hub id.
    const hubClassIds: string[] = []
    const hubYearGroupIds: string[] = []
    const labels: string[] = []
    const targetRows: { classId: string | null; yearGroupId: string | null }[] = []
    for (const t of rawTargets) {
      if (t.classId) {
        const c = classById.get(t.classId)
        if (!c) return res.status(422).json({ error: `Unknown class: ${t.classId}` })
        if (!c.hubClassId) return res.status(422).json({ error: `Class "${c.name}" is not linked to Wasil Hub and cannot be proposed for.` })
        hubClassIds.push(c.hubClassId)
        labels.push(c.name)
        targetRows.push({ classId: c.id, yearGroupId: null })
      } else if (t.yearGroupId) {
        const y = yearGroupById.get(t.yearGroupId)
        if (!y) return res.status(422).json({ error: `Unknown year group: ${t.yearGroupId}` })
        if (!y.hubYearGroupId) return res.status(422).json({ error: `Year group "${y.name}" is not linked to Wasil Hub and cannot be proposed for.` })
        hubYearGroupIds.push(y.hubYearGroupId)
        labels.push(y.name)
        targetRows.push({ classId: null, yearGroupId: y.id })
      }
    }

    const timezone = school.timezone || 'UTC'
    const isAllDay = !!allDay || !startTime
    const { startsAt, endsAt } = buildProposalBounds(date, startTime, endTime, isAllDay, timezone)

    // Submit to Hub FIRST. If it fails, don't create the local row.
    let proposal
    try {
      proposal = await submitProposal({
        school_id: school.hubSchoolId,
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: isAllDay,
        category: category || undefined,
        location: location || undefined,
        class_ids: hubClassIds.length ? hubClassIds : undefined,
        year_group_ids: hubYearGroupIds.length ? hubYearGroupIds : undefined,
        submitter_name: user.name,
        submitter_email: user.email,
        note: note || undefined,
      })
    } catch (error) {
      console.error('Error submitting event proposal to Hub:', error)
      return res.status(502).json({ error: 'Could not submit the proposal to Wasil Hub. Please try again.' })
    }

    // Single target still populates the legacy scalar columns; multi-target
    // leaves them null and relies on EventTarget rows.
    const single = targetRows.length === 1 ? targetRows[0] : null
    const label = labels.join(', ') || 'Selected classes'

    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title,
          description: description || null,
          date: new Date(date),
          time: isAllDay ? null : (startTime || null),
          location: location || null,
          targetClass: label,
          classId: single?.classId ?? null,
          yearGroupId: single?.yearGroupId ?? null,
          schoolId: user.schoolId,
          hubProposalId: proposal.proposal_id,
          proposalStatus: 'PENDING',
          submittedByUserId: user.id,
        },
      })
      await tx.eventTarget.createMany({ data: targetRows.map(r => ({ eventId: created.id, ...r })) })
      return created
    })

    logAudit({ req, action: 'CREATE', resourceType: 'EVENT', resourceId: event.id, metadata: { title: event.title, proposal: true, hubProposalId: proposal.proposal_id } })

    res.status(201).json(serializeProposalEvent(event, targetRows))
  } catch (error) {
    console.error('Error creating event proposal:', error)
    res.status(500).json({ error: 'Failed to create event proposal' })
  }
})

// List this school's proposals (STAFF+). Newest first. Includes proposals that
// have already landed on the calendar (hubCalendarEventId set) so the UI can
// show their resolved state. The UI can filter to "mine" by submittedByUserId.
router.get('/proposals', isStaff, async (req, res) => {
  try {
    const user = req.user!
    const events = await prisma.event.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [{ hubProposalId: { not: null } }, { proposalStatus: { not: null } }],
      },
      include: { targets: { select: { classId: true, yearGroupId: true } } },
      orderBy: { createdAt: 'desc' },
    })

    res.json(events.map(event => serializeProposalEvent(event, event.targets)))
  } catch (error) {
    console.error('Error listing event proposals:', error)
    res.status(500).json({ error: 'Failed to list event proposals' })
  }
})

// Withdraw/dismiss a proposal that hasn't landed on the calendar (submitter or
// admin) — a still-PENDING one, or a REJECTED one the teacher wants to clear.
// Deletes the local row only. Hub is propose-only, so a Hub-side proposal can't
// be recalled; if a withdrawn-but-still-pending one is later approved it simply
// syncs in as a normal event. An approved proposal (on the calendar) → 409.
router.delete('/proposals/:id', isStaff, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.event.findFirst({ where: { id, schoolId: user.schoolId } })
    if (!existing) {
      return res.status(404).json({ error: 'Proposal not found' })
    }
    if (existing.proposalStatus !== 'PENDING' && existing.proposalStatus !== 'REJECTED') {
      return res.status(409).json({ error: 'This proposal has already been approved and is on the calendar; it can no longer be withdrawn.' })
    }

    const isAdminRole = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    if (existing.submittedByUserId !== user.id && !isAdminRole) {
      return res.status(403).json({ error: 'Only the submitter or an admin can withdraw this proposal.' })
    }

    // EventTarget rows cascade on delete (onDelete: Cascade).
    await prisma.event.delete({ where: { id } })

    logAudit({ req, action: 'DELETE', resourceType: 'EVENT', resourceId: id, metadata: { title: existing.title, proposal: true } })

    res.json({ message: 'Proposal withdrawn' })
  } catch (error) {
    console.error('Error withdrawing event proposal:', error)
    res.status(500).json({ error: 'Failed to withdraw event proposal' })
  }
})

// Create event (admin only)
router.post('/', isAdmin, validate(createEventSchema), async (req, res) => {
  try {
    const user = req.user!
    const { title, description, date, time, location, targetClass, classId, yearGroupId, groupId, targets, requiresRsvp, recurrence, recurrenceEnd, customIntervalDays } = req.body

    // Resolve multi-target rows + the legacy scalar fields (single-target).
    const targeting = resolveTargeting({ targets, classId, yearGroupId })

    const sharedData = {
      title,
      description: description || null,
      time: time || null,
      location: location || null,
      targetClass,
      classId: targeting.scalarClassId,
      yearGroupId: targeting.scalarYearGroupId,
      groupId: groupId || null,
      schoolId: user.schoolId,
      requiresRsvp: requiresRsvp || false,
    }

    if (recurrence && recurrence !== 'none' && recurrenceEnd) {
      // Recurring event: generate dates and create parent + children
      const dates = generateRecurringDates(date, recurrence, recurrenceEnd, customIntervalDays)

      // Create parent + children + shared EventTarget rows atomically. Every
      // generated occurrence gets the same targets.
      const parentEvent = await prisma.$transaction(async (tx) => {
        const parent = await tx.event.create({
          data: {
            ...sharedData,
            date: new Date(dates[0]),
            recurrenceType: recurrence,
          },
        })

        if (dates.length > 1) {
          await tx.event.createMany({
            data: dates.slice(1).map(d => ({
              ...sharedData,
              date: new Date(d),
              parentEventId: parent.id,
              recurrenceType: recurrence,
            })),
          })
        }

        if (targeting.rows.length > 0) {
          const occurrences = await tx.event.findMany({
            where: { OR: [{ id: parent.id }, { parentEventId: parent.id }] },
            select: { id: true },
          })
          await tx.eventTarget.createMany({
            data: occurrences.flatMap(o => targeting.rows.map(r => ({ eventId: o.id, ...r }))),
          })
        }
        return parent
      })

      logAudit({ req, action: 'CREATE', resourceType: 'EVENT', resourceId: parentEvent.id, metadata: { title: parentEvent.title, recurrence, recurringCount: dates.length } })
      sendNotification({ req, type: 'EVENT', title: parentEvent.title, body: parentEvent.description || 'New recurring event', resourceType: 'EVENT', resourceId: parentEvent.id, target: { targetClass, classId: classId || undefined, yearGroupId: yearGroupId || undefined, groupId: groupId || undefined, schoolId: user.schoolId } })

      res.status(201).json({
        id: parentEvent.id,
        title: parentEvent.title,
        description: parentEvent.description,
        date: parentEvent.date.toISOString().split('T')[0],
        time: parentEvent.time,
        location: parentEvent.location,
        targetClass: parentEvent.targetClass,
        classId: parentEvent.classId,
        yearGroupId: parentEvent.yearGroupId,
        groupId: parentEvent.groupId,
        targets: serializeTargets(targeting.rows),
        hubCalendarEventId: parentEvent.hubCalendarEventId,
        source: 'connect',
        schoolId: parentEvent.schoolId,
        requiresRsvp: parentEvent.requiresRsvp,
        recurrenceType: parentEvent.recurrenceType,
        recurringCount: dates.length,
        googleCalendarUrl: buildGoogleCalendarUrl(parentEvent),
        createdAt: parentEvent.createdAt.toISOString(),
      })
    } else {
      // Single event + its EventTarget rows, created atomically.
      const event = await prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            ...sharedData,
            date: new Date(date),
          },
        })
        if (targeting.rows.length > 0) {
          await tx.eventTarget.createMany({
            data: targeting.rows.map(r => ({ eventId: created.id, ...r })),
          })
        }
        return created
      })

      logAudit({ req, action: 'CREATE', resourceType: 'EVENT', resourceId: event.id, metadata: { title: event.title } })
      sendNotification({ req, type: 'EVENT', title: event.title, body: event.description || 'New event', resourceType: 'EVENT', resourceId: event.id, target: { targetClass, classId: classId || undefined, yearGroupId: yearGroupId || undefined, groupId: groupId || undefined, schoolId: user.schoolId } })

      res.status(201).json({
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date.toISOString().split('T')[0],
        time: event.time,
        location: event.location,
        targetClass: event.targetClass,
        classId: event.classId,
        yearGroupId: event.yearGroupId,
        groupId: event.groupId,
        targets: serializeTargets(targeting.rows),
        hubCalendarEventId: event.hubCalendarEventId,
        source: 'connect',
        schoolId: event.schoolId,
        requiresRsvp: event.requiresRsvp,
        googleCalendarUrl: buildGoogleCalendarUrl(event),
        createdAt: event.createdAt.toISOString(),
      })
    }
  } catch (error) {
    console.error('Error creating event:', error)
    res.status(500).json({ error: 'Failed to create event' })
  }
})

// Submit RSVP
router.post('/:id/rsvp', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { status } = req.body

    const rsvp = await prisma.eventRsvp.upsert({
      where: {
        eventId_userId: {
          eventId: id,
          userId: user.id,
        },
      },
      update: { status },
      create: {
        eventId: id,
        userId: user.id,
        status,
      },
    })

    res.json({
      id: rsvp.id,
      eventId: rsvp.eventId,
      userId: rsvp.userId,
      status: rsvp.status,
      createdAt: rsvp.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error submitting RSVP:', error)
    res.status(500).json({ error: 'Failed to submit RSVP' })
  }
})

// Update event (admin only)
router.put('/:id', isAdmin, validate(updateEventSchema), async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, description, date, time, location, targetClass, classId, yearGroupId, groupId, targets, requiresRsvp } = req.body

    // Verify event belongs to user's school
    const existing = await prisma.event.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' })
    }

    // Read-only guard: Hub-owned events (mirrored from Hub's calendar) can't be
    // edited in Connect — edit them in Hub, they re-sync here.
    if (existing.hubCalendarEventId) {
      return res.status(409).json({ error: 'This event is managed in Wasil Hub and cannot be edited in Connect. Edit it in Hub instead.' })
    }

    // Pending-proposal guard: a proposal awaiting Hub approval can't be edited
    // in place — withdraw it via DELETE /proposals/:id and submit a new one.
    if (existing.proposalStatus === 'PENDING') {
      return res.status(409).json({ error: 'This event is a pending proposal awaiting Hub approval. Withdraw it from the proposals list instead of editing it here.' })
    }

    // Resolve multi-target rows + legacy scalars, then update + replace targets.
    const targeting = resolveTargeting({ targets, classId, yearGroupId })

    const event = await prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id },
        data: {
          title,
          description: description || null,
          date: new Date(date),
          time: time || null,
          location: location || null,
          targetClass,
          classId: targeting.scalarClassId,
          yearGroupId: targeting.scalarYearGroupId,
          groupId: groupId !== undefined ? (groupId || null) : existing.groupId,
          requiresRsvp: requiresRsvp ?? existing.requiresRsvp,
        },
      })
      await tx.eventTarget.deleteMany({ where: { eventId: id } })
      if (targeting.rows.length > 0) {
        await tx.eventTarget.createMany({
          data: targeting.rows.map(r => ({ eventId: id, ...r })),
        })
      }
      return updated
    })

    res.json({
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date.toISOString().split('T')[0],
      time: event.time,
      location: event.location,
      targetClass: event.targetClass,
      classId: event.classId,
      yearGroupId: event.yearGroupId,
      groupId: event.groupId,
      targets: serializeTargets(targeting.rows),
      hubCalendarEventId: event.hubCalendarEventId,
      source: event.hubCalendarEventId ? 'hub' : 'connect',
      schoolId: event.schoolId,
      requiresRsvp: event.requiresRsvp,
      googleCalendarUrl: buildGoogleCalendarUrl(event),
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    })

    const changes = computeChanges(existing as any, event as any, ['title', 'description', 'date', 'time', 'location', 'targetClass', 'requiresRsvp'])
    logAudit({ req, action: 'UPDATE', resourceType: 'EVENT', resourceId: event.id, metadata: { title: event.title }, changes })
  } catch (error) {
    console.error('Error updating event:', error)
    res.status(500).json({ error: 'Failed to update event' })
  }
})

// Delete event (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify event belongs to user's school
    const existing = await prisma.event.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' })
    }

    // Read-only guard: Hub-owned events can't be deleted in Connect.
    if (existing.hubCalendarEventId) {
      return res.status(409).json({ error: 'This event is managed in Wasil Hub and cannot be deleted in Connect. Remove it in Hub instead.' })
    }

    // Pending-proposal guard: use the proposal withdraw endpoint instead.
    if (existing.proposalStatus === 'PENDING') {
      return res.status(409).json({ error: 'This event is a pending proposal awaiting Hub approval. Withdraw it from the proposals list instead of deleting it here.' })
    }

    if (req.query.series === 'true' && existing.recurrenceType) {
      // Delete all instances in the series
      await prisma.event.deleteMany({
        where: {
          OR: [
            { id: existing.id },
            { parentEventId: existing.id },
            // If this is a child event, also delete siblings and parent
            ...(existing.parentEventId ? [
              { id: existing.parentEventId },
              { parentEventId: existing.parentEventId },
            ] : []),
          ],
          schoolId: user.schoolId,
        },
      })
    } else {
      await prisma.event.delete({
        where: { id },
      })
    }

    logAudit({ req, action: 'DELETE', resourceType: 'EVENT', resourceId: id, metadata: { title: existing.title, series: req.query.series === 'true' } })

    res.json({ message: 'Event deleted successfully' })
  } catch (error) {
    console.error('Error deleting event:', error)
    res.status(500).json({ error: 'Failed to delete event' })
  }
})

export default router
