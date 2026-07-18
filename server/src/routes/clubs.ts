import { Router } from 'express'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated, loadUserWithRelations } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { notifyClubBookingCreated } from '../services/clubNotify.js'

// Parent-facing browsing + booking of paid, provider-run clubs.
const router = Router()

const bookSchema = z.object({ studentId: z.string().min(1) })

function serializeBooking(b: {
  id: string; paymentStatus: string; cancelledAt: Date | null; studentId: string
  ecaActivity: { id: string; name: string; paymentUrl: string | null; cost: number | null; costDescription: string | null }
  createdAt: Date
}) {
  return {
    id: b.id,
    activityId: b.ecaActivity.id,
    activityName: b.ecaActivity.name,
    studentId: b.studentId,
    paymentStatus: b.paymentStatus,
    paymentUrl: b.ecaActivity.paymentUrl,
    cost: b.ecaActivity.cost,
    costDescription: b.ecaActivity.costDescription,
    cancelled: !!b.cancelledAt,
    createdAt: b.createdAt.toISOString(),
  }
}

// ─── Browse bookable clubs + the parent's own bookings ───────────────────────
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const students = (user.studentLinks || []).map(l => ({
      id: l.studentId,
      name: `${l.student.firstName} ${l.student.lastName}`,
      className: l.student.class?.name || null,
    }))

    const activities = await prisma.ecaActivity.findMany({
      where: { schoolId: user.schoolId, providerId: { not: null }, isActive: true, isCancelled: false },
      include: {
        provider: { select: { name: true } },
        _count: { select: { providerBookings: { where: { cancelledAt: null } } } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { name: 'asc' }],
    })

    const bookings = await prisma.ecaProviderBooking.findMany({
      where: { parentUserId: user.id, cancelledAt: null },
      include: { ecaActivity: { select: { id: true, name: true, paymentUrl: true, cost: true, costDescription: true } } },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      students,
      clubs: activities.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        providerName: a.provider?.name || null,
        dayOfWeek: a.dayOfWeek,
        timeSlot: a.timeSlot,
        location: a.location,
        cost: a.cost,
        costDescription: a.costDescription,
        maxCapacity: a.maxCapacity,
        spotsBooked: a._count.providerBookings,
        spotsLeft: a.maxCapacity != null ? Math.max(0, a.maxCapacity - a._count.providerBookings) : null,
      })),
      bookings: bookings.map(serializeBooking),
    })
  } catch (error) {
    console.error('Error listing clubs:', error)
    res.status(500).json({ error: 'Failed to load clubs' })
  }
})

// ─── Book a place for a child ────────────────────────────────────────────────
router.post('/:activityId/book', isAuthenticated, validate(bookSchema), async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const { activityId } = req.params
    const { studentId } = req.body

    // The child must belong to this parent.
    const ownsStudent = (user.studentLinks || []).some(l => l.studentId === studentId)
    if (!ownsStudent) return res.status(403).json({ error: 'That child is not on your account' })

    // The activity must be a provider club in the parent's school.
    const activity = await prisma.ecaActivity.findFirst({
      where: { id: activityId, schoolId: user.schoolId, providerId: { not: null }, isActive: true, isCancelled: false },
      select: { id: true, name: true, providerId: true, schoolId: true, maxCapacity: true, paymentUrl: true },
    })
    if (!activity) return res.status(404).json({ error: 'Club not found' })

    // Capacity check against current live bookings.
    if (activity.maxCapacity != null) {
      const booked = await prisma.ecaProviderBooking.count({ where: { ecaActivityId: activity.id, cancelledAt: null } })
      if (booked >= activity.maxCapacity) return res.status(409).json({ error: 'This club is full' })
    }

    const existing = await prisma.ecaProviderBooking.findUnique({
      where: { ecaActivityId_studentId: { ecaActivityId: activity.id, studentId } },
    })
    if (existing && !existing.cancelledAt) {
      return res.status(409).json({ error: 'This child is already booked into this club' })
    }

    const booking = existing
      ? await prisma.ecaProviderBooking.update({
          where: { id: existing.id },
          data: { cancelledAt: null, parentUserId: user.id, paymentStatus: 'UNPAID' },
          include: { ecaActivity: { select: { id: true, name: true, paymentUrl: true, cost: true, costDescription: true } } },
        })
      : await prisma.ecaProviderBooking.create({
          data: { ecaActivityId: activity.id, studentId, parentUserId: user.id, schoolId: activity.schoolId },
          include: { ecaActivity: { select: { id: true, name: true, paymentUrl: true, cost: true, costDescription: true } } },
        })

    // Confirmation to the parent + a heads-up email to the provider (via outbox).
    const link = (user.studentLinks || []).find(l => l.studentId === studentId)
    const studentName = link ? `${link.student.firstName} ${link.student.lastName}` : 'A student'
    if (activity.providerId) {
      void notifyClubBookingCreated({
        activityId: activity.id,
        activityName: activity.name,
        studentName,
        parentUserId: user.id,
        schoolId: activity.schoolId,
        providerId: activity.providerId,
      })
    }

    res.status(201).json(serializeBooking(booking))
  } catch (error) {
    console.error('Error booking club:', error)
    res.status(500).json({ error: 'Failed to book club' })
  }
})

// ─── Cancel a booking ────────────────────────────────────────────────────────
router.delete('/bookings/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await prisma.ecaProviderBooking.updateMany({
      where: { id: req.params.id, parentUserId: req.user!.id, cancelledAt: null },
      data: { cancelledAt: new Date() },
    })
    if (result.count === 0) return res.status(404).json({ error: 'Booking not found' })
    res.json({ message: 'Booking cancelled' })
  } catch (error) {
    console.error('Error cancelling booking:', error)
    res.status(500).json({ error: 'Failed to cancel booking' })
  }
})

export default router
