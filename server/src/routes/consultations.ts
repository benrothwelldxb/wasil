import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { getGoogleAuthUrl, exchangeGoogleCode, createGoogleMeetEvent, isGoogleCalendarConfigured } from '../services/googleMeet.js'
import { sendBookingConfirmationToParent, sendBookingNotificationToTeacher, sendCancellationToParent, sendCancellationToTeacher } from '../services/consultationEmails.js'
import { sendConsultationBookingNotification, sendConsultationCancellationNotification } from '../services/consultationNotify.js'

const router = Router()

// Helper: generate time slots between startTime and endTime
function generateSlots(
  startTime: string,
  endTime: string,
  slotDuration: number,
  breakDuration: number
): Array<{ startTime: string; endTime: string; isBreak: boolean }> {
  const slots: Array<{ startTime: string; endTime: string; isBreak: boolean }> = []

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)

  let currentMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  while (currentMinutes + slotDuration <= endMinutes) {
    const slotStart = `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`
    currentMinutes += slotDuration
    const slotEnd = `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`

    slots.push({ startTime: slotStart, endTime: slotEnd, isBreak: false })

    // Add break after each slot if breakDuration > 0
    if (breakDuration > 0 && currentMinutes + breakDuration <= endMinutes) {
      const breakStart = slotEnd
      currentMinutes += breakDuration
      const breakEnd = `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`
      slots.push({ startTime: breakStart, endTime: breakEnd, isBreak: true })
    }
  }

  return slots
}

// Helper: calculate all dates between startDate and endDate (inclusive)
function getDateRange(startDate: string, endDate?: string | null, skipWeekends = true): string[] {
  const dates: string[] = []
  const start = new Date(startDate + 'T00:00:00')
  const end = endDate ? new Date(endDate + 'T00:00:00') : start
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (!skipWeekends || (day !== 0 && day !== 6)) {
      dates.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1)
  }
  return dates
}

// Helper: convert HH:MM to minutes for overlap checking
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Helper: check if two time ranges overlap
function slotsOverlap(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }): boolean {
  const aStart = timeToMinutes(a.startTime)
  const aEnd = timeToMinutes(a.endTime)
  const bStart = timeToMinutes(b.startTime)
  const bEnd = timeToMinutes(b.endTime)
  return aStart < bEnd && bStart < aEnd
}

// ==========================================
// Parent endpoints (must be before /:id to avoid route conflicts)
// ==========================================

// List published/open consultations visible to parent
router.get('/parent', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const consultations = await prisma.consultationEvent.findMany({
      where: {
        schoolId: user.schoolId,
        status: { in: ['PUBLISHED', 'BOOKING_OPEN', 'BOOKING_CLOSED'] },
      },
      include: {
        teachers: {
          include: {
            teacher: { select: { id: true, name: true } },
            slots: {
              include: {
                booking: {
                  select: {
                    id: true,
                    parentId: true,
                    studentName: true,
                    notes: true,
                    meetingLink: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
      orderBy: { date: 'asc' },
    })

    res.json(consultations.map(c => ({
      ...c,
      teachers: c.teachers.map(t => ({
        id: t.id,
        consultationId: t.consultationId,
        teacherId: t.teacherId,
        teacherName: t.teacher.name,
        location: t.location,
        locationType: t.locationType,
        startTime: t.startTime,
        endTime: t.endTime,
        slots: t.slots.map(s => ({
          id: s.id,
          consultationTeacherId: s.consultationTeacherId,
          startTime: s.startTime,
          endTime: s.endTime,
          date: s.date,
          isBreak: s.isBreak,
          isCustom: s.isCustom,
          booking: s.booking ? {
            id: s.booking.id,
            parentId: s.booking.parentId,
            studentName: s.booking.studentName,
            notes: s.booking.notes,
            meetingLink: s.booking.meetingLink,
            createdAt: s.booking.createdAt.toISOString(),
          } : null,
        })),
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error listing parent consultations:', error)
    res.status(500).json({ error: 'Failed to list consultations' })
  }
})

// Get consultation details for parent
router.get('/parent/:id', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const consultation = await prisma.consultationEvent.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        status: { in: ['PUBLISHED', 'BOOKING_OPEN', 'BOOKING_CLOSED'] },
      },
      include: {
        teachers: {
          include: {
            teacher: { select: { id: true, name: true, role: true, position: true } },
            slots: {
              include: {
                booking: {
                  select: {
                    id: true,
                    parentId: true,
                    studentId: true,
                    studentName: true,
                    notes: true,
                    meetingLink: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    // Get teacher-class assignments for all teachers in this consultation
    const teacherIds = consultation.teachers.map(t => t.teacherId)
    const classAssignments = await prisma.staffClassAssignment.findMany({
      where: { userId: { in: teacherIds } },
      include: { class: { select: { id: true, name: true } } },
    })

    // Build a map: teacherId -> [className, ...]
    const teacherClassMap: Record<string, string[]> = {}
    classAssignments.forEach(a => {
      if (!teacherClassMap[a.userId]) teacherClassMap[a.userId] = []
      teacherClassMap[a.userId].push(a.class.name)
    })

    res.json({
      ...consultation,
      teachers: consultation.teachers.map(t => ({
        id: t.id,
        consultationId: t.consultationId,
        teacherId: t.teacherId,
        teacherName: t.teacher.name,
        teacherRole: (t.teacher as any).role || 'STAFF',
        teacherPosition: (t.teacher as any).position || null,
        assignedClasses: teacherClassMap[t.teacherId] || [],
        location: t.location,
        locationType: t.locationType,
        startTime: t.startTime,
        endTime: t.endTime,
        slots: t.slots.map(s => ({
          id: s.id,
          consultationTeacherId: s.consultationTeacherId,
          startTime: s.startTime,
          endTime: s.endTime,
          date: s.date,
          isBreak: s.isBreak,
          isCustom: s.isCustom,
          booking: s.booking ? {
            id: s.booking.id,
            parentId: s.booking.parentId,
            studentId: s.booking.studentId,
            studentName: s.booking.studentName,
            notes: s.booking.notes,
            meetingLink: s.booking.meetingLink,
            createdAt: s.booking.createdAt.toISOString(),
          } : null,
        })),
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: consultation.createdAt.toISOString(),
      updatedAt: consultation.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching consultation for parent:', error)
    res.status(500).json({ error: 'Failed to fetch consultation' })
  }
})

// Book a slot
router.post('/parent/book', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { slotId, studentId, studentName, notes } = req.body

    // Verify slot exists and is available
    const slot = await prisma.consultationSlot.findUnique({
      where: { id: slotId },
      include: {
        booking: true,
        consultationTeacher: {
          include: {
            teacher: { select: { id: true, name: true, email: true } },
            consultation: { include: { school: { select: { name: true } } } },
          },
        },
      },
    })

    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' })
    }

    if (slot.consultationTeacher.consultation.schoolId !== user.schoolId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (slot.consultationTeacher.consultation.status !== 'BOOKING_OPEN') {
      return res.status(400).json({ error: 'Booking is not open for this consultation' })
    }

    if (slot.isBreak) {
      return res.status(400).json({ error: 'Cannot book a break slot' })
    }

    if (slot.booking) {
      return res.status(400).json({ error: 'Slot is already booked' })
    }

    // Check if parent already has a booking with this teacher
    const existingBooking = await prisma.consultationBooking.findFirst({
      where: {
        parentId: user.id,
        slot: {
          consultationTeacherId: slot.consultationTeacherId,
        },
      },
    })

    if (existingBooking) {
      return res.status(400).json({ error: 'You already have a booking with this teacher. Please cancel your existing booking first.' })
    }

    // Create the booking
    let meetingLink: string | null = null

    // If teacher's locationType is GOOGLE_MEET, try to create a Meet event
    if (slot.consultationTeacher.locationType === 'GOOGLE_MEET') {
      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { googleCalendarRefreshToken: true },
      })

      if (school?.googleCalendarRefreshToken) {
        const consultationDate = slot.date || slot.consultationTeacher.consultation.date
        const startISO = `${consultationDate}T${slot.startTime}:00`
        const endISO = `${consultationDate}T${slot.endTime}:00`

        const meetResult = await createGoogleMeetEvent({
          refreshToken: school.googleCalendarRefreshToken,
          summary: `${slot.consultationTeacher.teacher.name} - ${studentName} Consultation`,
          description: `Parent consultation booking via Wasil`,
          startTime: startISO,
          endTime: endISO,
          attendees: user.email ? [user.email] : undefined,
        })

        if (meetResult) {
          meetingLink = meetResult.meetLink
        }
      }
    }

    const booking = await prisma.consultationBooking.create({
      data: {
        slotId,
        parentId: user.id,
        studentId,
        studentName,
        notes: notes || null,
        meetingLink,
      },
    })

    // Fire-and-forget notifications
    const teacher = slot.consultationTeacher.teacher
    const consultation = slot.consultationTeacher.consultation
    const consultationDate = slot.date || consultation.date
    const slotTime = `${slot.startTime} - ${slot.endTime}`
    const location = slot.consultationTeacher.location || (slot.consultationTeacher.locationType === 'IN_PERSON' ? 'In Person' : slot.consultationTeacher.locationType)
    const schoolName = (consultation as any).school?.name || ''

    const emailDetails = {
      teacherName: teacher.name,
      childName: studentName,
      date: consultationDate,
      time: slotTime,
      location: meetingLink || location,
      schoolName,
    }

    if (user.email) {
      sendBookingConfirmationToParent(user.email, emailDetails).catch(e => console.error('[Consultation] Email to parent failed:', e))
    }
    if (teacher.email) {
      sendBookingNotificationToTeacher(teacher.email, { ...emailDetails, parentName: user.name || 'Parent' }).catch(e => console.error('[Consultation] Email to teacher failed:', e))
    }

    sendConsultationBookingNotification({
      parentId: user.id,
      teacherId: teacher.id,
      schoolId: user.schoolId,
      teacherName: teacher.name,
      parentName: user.name || 'Parent',
      childName: studentName,
      date: consultationDate,
      time: slotTime,
    }).catch(e => console.error('[Consultation] Push notification failed:', e))

    res.status(201).json({
      ...booking,
      createdAt: booking.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error booking slot:', error)
    res.status(500).json({ error: 'Failed to book slot' })
  }
})

// Cancel a booking
router.delete('/parent/bookings/:bookingId', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { bookingId } = req.params

    const booking = await prisma.consultationBooking.findUnique({
      where: { id: bookingId },
      include: {
        slot: {
          include: {
            consultationTeacher: {
              include: {
                teacher: { select: { id: true, name: true, email: true } },
                consultation: { include: { school: { select: { name: true } } } },
              },
            },
          },
        },
      },
    })

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' })
    }

    if (booking.parentId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const consultation = booking.slot.consultationTeacher.consultation

    // Cannot cancel completed consultations
    if (consultation.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot cancel booking — consultation is completed' })
    }

    // Cannot cancel within 2 hours of appointment
    const slotDate = booking.slot.date || consultation.date
    const appointmentTime = new Date(`${slotDate}T${booking.slot.startTime}:00`)
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000)
    if (appointmentTime <= twoHoursFromNow) {
      return res.status(400).json({ error: 'Cannot cancel booking — appointment is less than 2 hours away' })
    }

    await prisma.consultationBooking.delete({ where: { id: bookingId } })

    // Fire-and-forget notifications
    const teacher = booking.slot.consultationTeacher.teacher
    const slotTime = `${booking.slot.startTime} - ${booking.slot.endTime}`
    const location = booking.slot.consultationTeacher.location || (booking.slot.consultationTeacher.locationType === 'IN_PERSON' ? 'In Person' : booking.slot.consultationTeacher.locationType)
    const schoolName = (consultation as any).school?.name || ''

    const emailDetails = {
      teacherName: teacher.name,
      childName: booking.studentName,
      date: slotDate,
      time: slotTime,
      location: booking.meetingLink || location,
      schoolName,
    }

    if (user.email) {
      sendCancellationToParent(user.email, emailDetails).catch(e => console.error('[Consultation] Cancellation email to parent failed:', e))
    }
    if (teacher.email) {
      sendCancellationToTeacher(teacher.email, { ...emailDetails, parentName: user.name || 'Parent' }).catch(e => console.error('[Consultation] Cancellation email to teacher failed:', e))
    }

    sendConsultationCancellationNotification({
      parentId: user.id,
      teacherId: teacher.id,
      schoolId: user.schoolId,
      teacherName: teacher.name,
      parentName: user.name || 'Parent',
      childName: booking.studentName,
      date: slotDate,
      time: slotTime,
    }).catch(e => console.error('[Consultation] Cancellation push notification failed:', e))

    res.json({ message: 'Booking cancelled successfully' })
  } catch (error) {
    console.error('Error cancelling booking:', error)
    res.status(500).json({ error: 'Failed to cancel booking' })
  }
})

// ==========================================
// Admin endpoints
// ==========================================

// Google Calendar auth URL (admin)
router.get('/google-auth-url', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const configured = isGoogleCalendarConfigured()

    if (!configured) {
      return res.json({ url: null, configured: false })
    }

    const url = getGoogleAuthUrl(user.schoolId)
    res.json({ url, configured: true })
  } catch (error) {
    console.error('Error getting Google auth URL:', error)
    res.status(500).json({ error: 'Failed to get Google auth URL' })
  }
})

// Create a consultation event
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, description, date, endDate, slotDuration, breakDuration, targetClass } = req.body

    const event = await prisma.consultationEvent.create({
      data: {
        schoolId: user.schoolId,
        title,
        description: description || null,
        date,
        endDate: endDate || null,
        slotDuration: slotDuration || 10,
        breakDuration: breakDuration || 0,
        targetClass: targetClass || null,
      },
    })

    res.status(201).json(event)
  } catch (error) {
    console.error('Error creating consultation:', error)
    res.status(500).json({ error: 'Failed to create consultation' })
  }
})

// List all consultations for the school (admin)
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const consultations = await prisma.consultationEvent.findMany({
      where: { schoolId: user.schoolId },
      include: {
        teachers: {
          include: {
            teacher: { select: { id: true, name: true } },
            slots: {
              include: {
                booking: true,
              },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    })

    res.json(consultations.map(c => ({
      ...c,
      teachers: c.teachers.map(t => ({
        id: t.id,
        consultationId: t.consultationId,
        teacherId: t.teacherId,
        teacherName: t.teacher.name,
        location: t.location,
        locationType: t.locationType,
        startTime: t.startTime,
        endTime: t.endTime,
        slots: t.slots,
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error listing consultations:', error)
    res.status(500).json({ error: 'Failed to list consultations' })
  }
})

// Get consultation with teachers and slots (admin)
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        teachers: {
          include: {
            teacher: { select: { id: true, name: true } },
            slots: {
              include: {
                booking: {
                  include: {
                    parent: { select: { id: true, name: true, email: true } },
                  },
                },
              },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    res.json({
      ...consultation,
      teachers: consultation.teachers.map(t => ({
        id: t.id,
        consultationId: t.consultationId,
        teacherId: t.teacherId,
        teacherName: t.teacher.name,
        location: t.location,
        locationType: t.locationType,
        startTime: t.startTime,
        endTime: t.endTime,
        slots: t.slots.map(s => ({
          ...s,
          booking: s.booking ? {
            ...s.booking,
            parentName: s.booking.parent.name,
            createdAt: s.booking.createdAt.toISOString(),
          } : null,
        })),
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: consultation.createdAt.toISOString(),
      updatedAt: consultation.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching consultation:', error)
    res.status(500).json({ error: 'Failed to fetch consultation' })
  }
})

// Update consultation
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, description, date, endDate, status, slotDuration, breakDuration, targetClass } = req.body

    const existing = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    const updated = await prisma.consultationEvent.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description || null }),
        ...(date !== undefined && { date }),
        ...(endDate !== undefined && { endDate: endDate || null }),
        ...(status !== undefined && { status }),
        ...(slotDuration !== undefined && { slotDuration }),
        ...(breakDuration !== undefined && { breakDuration }),
        ...(targetClass !== undefined && { targetClass: targetClass || null }),
      },
    })

    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating consultation:', error)
    res.status(500).json({ error: 'Failed to update consultation' })
  }
})

// Delete consultation (only if DRAFT)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only delete consultations in DRAFT status' })
    }

    await prisma.consultationEvent.delete({ where: { id } })
    res.json({ message: 'Consultation deleted successfully' })
  } catch (error) {
    console.error('Error deleting consultation:', error)
    res.status(500).json({ error: 'Failed to delete consultation' })
  }
})

// Add a teacher with their availability (auto-generates slots)
router.post('/:id/teachers', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { teacherId, location, locationType, startTime, endTime } = req.body

    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    // Check teacher exists and is staff
    const teacher = await prisma.user.findFirst({
      where: {
        id: teacherId,
        schoolId: user.schoolId,
        role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },
      },
    })

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    // Create teacher record with auto-generated slots (per day for multi-day events)
    const dates = getDateRange(consultation.date, consultation.endDate)
    const baseSlots = generateSlots(startTime, endTime, consultation.slotDuration, consultation.breakDuration)
    const allSlots: Array<{ startTime: string; endTime: string; isBreak: boolean; date: string }> = []
    for (const date of dates) {
      baseSlots.forEach(s => allSlots.push({ ...s, date }))
    }

    const consultationTeacher = await prisma.consultationTeacher.create({
      data: {
        consultationId: id,
        teacherId,
        location: location || null,
        locationType: locationType || 'IN_PERSON',
        startTime,
        endTime,
        slots: {
          create: allSlots.map(s => ({
            startTime: s.startTime,
            endTime: s.endTime,
            isBreak: s.isBreak,
            date: s.date,
          })),
        },
      },
      include: {
        teacher: { select: { id: true, name: true } },
        slots: {
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        },
      },
    })

    res.status(201).json({
      id: consultationTeacher.id,
      consultationId: consultationTeacher.consultationId,
      teacherId: consultationTeacher.teacherId,
      teacherName: consultationTeacher.teacher.name,
      location: consultationTeacher.location,
      locationType: consultationTeacher.locationType,
      startTime: consultationTeacher.startTime,
      endTime: consultationTeacher.endTime,
      slots: consultationTeacher.slots,
      createdAt: consultationTeacher.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error adding teacher:', error)
    res.status(500).json({ error: 'Failed to add teacher' })
  }
})

// Remove a teacher
router.delete('/:id/teachers/:ctId', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, ctId } = req.params

    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    await prisma.consultationTeacher.delete({ where: { id: ctId } })
    res.json({ message: 'Teacher removed successfully' })
  } catch (error) {
    console.error('Error removing teacher:', error)
    res.status(500).json({ error: 'Failed to remove teacher' })
  }
})

// Add a custom slot to a teacher
router.post('/:id/teachers/:ctId/slots', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, ctId } = req.params
    const { startTime, endTime, date } = req.body

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime are required' })
    }

    // Validate consultation belongs to school
    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    // Validate teacher belongs to this consultation
    const ct = await prisma.consultationTeacher.findFirst({
      where: { id: ctId, consultationId: id },
      include: { slots: true },
    })

    if (!ct) {
      return res.status(404).json({ error: 'Teacher not found in this consultation' })
    }

    // Determine the date for the custom slot (default to consultation date)
    const slotDate = date || consultation.date

    // Check for overlapping slots (only on the same date)
    const newSlot = { startTime, endTime }
    const overlapping = ct.slots.find(s => {
      // Only check overlap on same date
      const sDate = s.date || consultation.date
      if (sDate !== slotDate) return false
      return slotsOverlap(s, newSlot)
    })
    if (overlapping) {
      return res.status(400).json({
        error: `Slot overlaps with existing slot ${overlapping.startTime}-${overlapping.endTime}`,
      })
    }

    const slot = await prisma.consultationSlot.create({
      data: {
        consultationTeacherId: ctId,
        startTime,
        endTime,
        date: slotDate,
        isBreak: false,
        isCustom: true,
      },
    })

    res.status(201).json(slot)
  } catch (error) {
    console.error('Error adding custom slot:', error)
    res.status(500).json({ error: 'Failed to add custom slot' })
  }
})

// Delete a specific slot (only if not booked)
router.delete('/:id/teachers/:ctId/slots/:slotId', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, ctId, slotId } = req.params

    // Validate consultation belongs to school
    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    // Get the slot and check it belongs to this teacher/consultation
    const slot = await prisma.consultationSlot.findFirst({
      where: {
        id: slotId,
        consultationTeacherId: ctId,
      },
      include: { booking: true },
    })

    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' })
    }

    if (slot.booking) {
      return res.status(400).json({ error: 'Cannot delete a slot that has a booking' })
    }

    await prisma.consultationSlot.delete({ where: { id: slotId } })
    res.json({ message: 'Slot deleted successfully' })
  } catch (error) {
    console.error('Error deleting slot:', error)
    res.status(500).json({ error: 'Failed to delete slot' })
  }
})

// View all bookings (admin overview)
router.get('/:id/bookings', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        teachers: {
          include: {
            teacher: { select: { id: true, name: true } },
            slots: {
              where: { isBreak: false },
              include: {
                booking: {
                  include: {
                    parent: { select: { id: true, name: true, email: true } },
                  },
                },
              },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    const bookings = consultation.teachers.flatMap(t =>
      t.slots
        .filter(s => s.booking)
        .map(s => ({
          id: s.booking!.id,
          slotId: s.id,
          parentId: s.booking!.parentId,
          parentName: s.booking!.parent.name,
          parentEmail: s.booking!.parent.email,
          studentId: s.booking!.studentId,
          studentName: s.booking!.studentName,
          notes: s.booking!.notes,
          meetingLink: s.booking!.meetingLink,
          teacherId: t.teacherId,
          teacherName: t.teacher.name,
          teacherLocation: t.location,
          slotStartTime: s.startTime,
          slotEndTime: s.endTime,
          slotDate: s.date,
          createdAt: s.booking!.createdAt.toISOString(),
        }))
    )

    const totalSlots = consultation.teachers.reduce(
      (sum, t) => sum + t.slots.length,
      0
    )

    res.json({
      bookings,
      stats: {
        totalSlots,
        bookedSlots: bookings.length,
      },
    })
  } catch (error) {
    console.error('Error fetching bookings:', error)
    res.status(500).json({ error: 'Failed to fetch bookings' })
  }
})

export default router
