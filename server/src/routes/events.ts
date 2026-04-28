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
  requiresRsvp: z.boolean().optional(),
})

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
      OR: [
        { targetClass: 'Whole School' },
        { targetClass: 'all' },
        { classId: { in: allClassIds } },
        ...(childYearGroupIds.length > 0 ? [{ yearGroupId: { in: childYearGroupIds } }] : []),
        ...(childGroupIds.length > 0 ? [{ groupId: { in: childGroupIds } }] : []),
      ],
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
        OR: [
          { targetClass: 'Whole School' },
          { targetClass: 'all' },
          { classId: { in: allClassIds } },
          ...(childYearGroupIds.length > 0 ? [{ yearGroupId: { in: childYearGroupIds } }] : []),
          ...(childGroupIds.length > 0 ? [{ groupId: { in: childGroupIds } }] : []),
        ],
      },
      include: {
        rsvps: {
          where: { userId: user.id },
        },
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
      schoolId: event.schoolId,
      requiresRsvp: event.requiresRsvp,
      userRsvp: event.rsvps[0]?.status || null,
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
      schoolId: event.schoolId,
      requiresRsvp: event.requiresRsvp,
      rsvps: event.rsvps.map(r => ({
        id: r.id,
        status: r.status,
        userName: r.user.name,
        userEmail: r.user.email,
        createdAt: r.createdAt.toISOString(),
      })),
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
    const { title, description, date, time, location, targetClass, classId, yearGroupId, groupId, requiresRsvp } = req.body

    const event = await prisma.event.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        time: time || null,
        location: location || null,
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
        groupId: groupId || null,
        schoolId: user.schoolId,
        requiresRsvp: requiresRsvp || false,
      },
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
      schoolId: event.schoolId,
      requiresRsvp: event.requiresRsvp,
      createdAt: event.createdAt.toISOString(),
    })
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
    const { title, description, date, time, location, targetClass, classId, yearGroupId, groupId, requiresRsvp } = req.body

    // Verify event belongs to user's school
    const existing = await prisma.event.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const event = await prisma.event.update({
      where: { id },
      data: {
        title,
        description: description || null,
        date: new Date(date),
        time: time || null,
        location: location || null,
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
        groupId: groupId !== undefined ? (groupId || null) : existing.groupId,
        requiresRsvp: requiresRsvp ?? existing.requiresRsvp,
      },
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
      schoolId: event.schoolId,
      requiresRsvp: event.requiresRsvp,
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

    await prisma.event.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'EVENT', resourceId: id, metadata: { title: existing.title } })

    res.json({ message: 'Event deleted successfully' })
  } catch (error) {
    console.error('Error deleting event:', error)
    res.status(500).json({ error: 'Failed to delete event' })
  }
})

export default router
