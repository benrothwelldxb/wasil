import { Router } from 'express'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, loadUserWithRelations, type UserWithRelations } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { logAudit, computeChanges } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'
import { translateTexts } from '../services/translation.js'
import { generateICS } from '../services/ics.js'
import type { ICSEvent } from '../services/ics.js'

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
      source: event.hubCalendarEventId ? 'hub' : 'connect',
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
      source: event.hubCalendarEventId ? 'hub' : 'connect',
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
