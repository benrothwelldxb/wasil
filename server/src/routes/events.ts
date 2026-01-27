import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get events (filtered by user's children's classes)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const childClassIds = user.children?.map(c => c.classId) || []

    const events = await prisma.event.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
        ],
      },
      include: {
        rsvps: {
          where: { userId: user.id },
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
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, description, date, time, location, targetClass, classId, requiresRsvp } = req.body

    const event = await prisma.event.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        time: time || null,
        location: location || null,
        targetClass,
        classId: classId || null,
        schoolId: user.schoolId,
        requiresRsvp: requiresRsvp || false,
      },
    })

    res.status(201).json({
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date.toISOString().split('T')[0],
      time: event.time,
      location: event.location,
      targetClass: event.targetClass,
      classId: event.classId,
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
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, description, date, time, location, targetClass, classId, requiresRsvp } = req.body

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
      schoolId: event.schoolId,
      requiresRsvp: event.requiresRsvp,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    })
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

    res.json({ message: 'Event deleted successfully' })
  } catch (error) {
    console.error('Error deleting event:', error)
    res.status(500).json({ error: 'Failed to delete event' })
  }
})

export default router
