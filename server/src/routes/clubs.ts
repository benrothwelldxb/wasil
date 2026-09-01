import { Router } from 'express'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated, loadUserWithRelations } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { notifyClubBookingCreated } from '../services/clubNotify.js'
import { parseYearGroupIds, effectiveTimes } from '../services/ecaActivity.js'

// Term statuses a parent may see. A club on a DRAFT or COMPLETED term is not
// bookable, the same rule the ECA selection flow applies.
const PARENT_VISIBLE_TERM_STATUSES = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ALLOCATION_COMPLETE', 'ACTIVE'] as const

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
      yearGroupId: l.student.class?.yearGroupId || null,
    }))

    const activities = await prisma.ecaActivity.findMany({
      where: {
        schoolId: user.schoolId,
        providerId: { not: null },
        isActive: true,
        isCancelled: false,
        // A club reaches parents only once its provider publishes it, and only
        // while its term is one parents can see. Both gates are what the admin
        // and provider screens already promise.
        isPublished: true,
        ecaTerm: { status: { in: [...PARENT_VISIBLE_TERM_STATUSES] } },
      },
      include: {
        provider: { select: { name: true, logoUrl: true } },
        // The company actually running the club. Parents see this brand; the
        // provider above is the partner who organises the booking.
        operator: { select: { name: true, logoUrl: true } },
        ecaTerm: {
          select: {
            defaultBeforeSchoolStart: true, defaultBeforeSchoolEnd: true,
            defaultAfterSchoolStart: true, defaultAfterSchoolEnd: true,
          },
        },
        _count: { select: { providerBookings: { where: { cancelledAt: null } } } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { name: 'asc' }],
    })

    // Year-group names for the "Year 3, Year 4 only" label on a restricted club.
    const yearGroups = await prisma.yearGroup.findMany({
      where: { schoolId: user.schoolId },
      select: { id: true, name: true, order: true },
      orderBy: { order: 'asc' },
    })
    const yearGroupName = new Map(yearGroups.map(y => [y.id, y.name]))

    const bookings = await prisma.ecaProviderBooking.findMany({
      where: { parentUserId: user.id, cancelledAt: null },
      include: { ecaActivity: { select: { id: true, name: true, paymentUrl: true, cost: true, costDescription: true } } },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      students,
      clubs: activities.map(a => {
        const eligibleYearGroupIds = parseYearGroupIds(a.eligibleYearGroupIds)
        // An empty list means open to everyone — the same reading the ECA
        // selection flow and the allocator already use.
        const restricted = eligibleYearGroupIds.length > 0
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          // Who the club is sold as. A club the partner runs themselves has no
          // operator and falls back to the partner — which is every existing
          // row, so nothing changes until someone fills it in.
          //
          // The fallback is all-or-nothing per company, never per field: an
          // operator that has not uploaded a logo yet shows no logo, because
          // reaching past it to the partner's would put Infinite's mark beside
          // another company's name.
          operatorName: a.operator?.name ?? a.provider?.name ?? null,
          operatorLogoUrl: a.operator ? a.operator.logoUrl : a.provider?.logoUrl ?? null,
          // Credited under the club as "Booked through …", and only when that
          // is actually a different company from the one running it.
          bookedThrough: a.operator ? a.provider?.name ?? null : null,
          providerName: a.provider?.name || null,
          dayOfWeek: a.dayOfWeek,
          timeSlot: a.timeSlot,
          ...effectiveTimes(a, a.ecaTerm),
          eligibleYearGroupIds,
          eligibleYearGroupNames: eligibleYearGroupIds
            .map(id => yearGroupName.get(id))
            .filter((n): n is string => !!n),
          // Which of this parent's children may be booked in. A child with no
          // year group on their class is treated as eligible rather than being
          // silently locked out.
          eligibleStudentIds: students
            .filter(st => !restricted || !st.yearGroupId || eligibleYearGroupIds.includes(st.yearGroupId))
            .map(st => st.id),
          location: a.location,
          cost: a.cost,
          costDescription: a.costDescription,
          maxCapacity: a.maxCapacity,
          spotsBooked: a._count.providerBookings,
          spotsLeft: a.maxCapacity != null ? Math.max(0, a.maxCapacity - a._count.providerBookings) : null,
        }
      }),
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

    // The activity must be a provider club in the parent's school, published,
    // and on a term parents can see — the same gates the listing applies, so a
    // stale page can't book into a club that has since been withdrawn.
    const activity = await prisma.ecaActivity.findFirst({
      where: {
        id: activityId,
        schoolId: user.schoolId,
        providerId: { not: null },
        isActive: true,
        isCancelled: false,
        isPublished: true,
        ecaTerm: { status: { in: [...PARENT_VISIBLE_TERM_STATUSES] } },
      },
      select: {
        id: true, name: true, providerId: true, schoolId: true, maxCapacity: true, paymentUrl: true,
        eligibleYearGroupIds: true,
      },
    })
    if (!activity) return res.status(404).json({ error: 'Club not found' })

    // Year-group eligibility. Enforced here and not only in the UI, since the
    // child picker is the only thing that would otherwise stop it.
    const eligibleYearGroupIds = parseYearGroupIds(activity.eligibleYearGroupIds)
    if (eligibleYearGroupIds.length > 0) {
      const link = (user.studentLinks || []).find(l => l.studentId === studentId)
      const yearGroupId = link?.student.class?.yearGroupId || null
      if (yearGroupId && !eligibleYearGroupIds.includes(yearGroupId)) {
        return res.status(403).json({ error: 'This club is not open to that year group' })
      }
    }

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
