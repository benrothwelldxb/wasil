import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { getGoogleAuthUrl, exchangeGoogleCode, createGoogleMeetEvent, deleteGoogleMeetEvent, isGoogleCalendarConfigured, GOOGLE_CALENDAR_REDIRECT_URI } from '../services/googleMeet.js'
import { sendBookingConfirmationToParent, sendBookingNotificationToTeacher, sendCancellationToParent, sendCancellationToTeacher } from '../services/consultationEmails.js'
import { sendConsultationBookingNotification, sendConsultationCancellationNotification } from '../services/consultationNotify.js'
import { serializeBookingForParent } from '../services/consultationSerializers.js'
import { parseWallClockForSchool, describeWhenForSchool } from '../services/dateTime.js'
import { currentStaffWhere } from '../services/currentStaff.js'

const router = Router()

/** "15:30" or nothing. Anything unparseable is dropped rather than stored, so a
 *  bad value can't generate a teacher's whole slot grid at the wrong times. */
function asTime(v: unknown): string | null {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : null
}

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
                    locationType: true,
                    meetingLink: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
            },
            availabilityWindows: {
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
          booking: serializeBookingForParent(s.booking, user.id),
        })),
        availabilityWindows: t.availabilityWindows,
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
                    locationType: true,
                    meetingLink: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
            },
            availabilityWindows: {
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

    // Whether a Google Meet appointment can actually be created.
    //
    // A teacher set to PARENT_CHOICE offers Meet, but the link comes from the
    // school's connected Google Calendar. If nobody has connected one, offering
    // the choice produces an appointment with no way to attend it — so the app
    // is told, and does not offer what will not work.
    const schoolGoogle = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { googleCalendarRefreshToken: true },
    })
    const googleMeetAvailable = !!schoolGoogle?.googleCalendarRefreshToken

    // When this family may start, where the evening opens in waves. Resolved
    // here rather than shipping the windows and letting the app work it out:
    // the earliest-child rule is the kind of thing two implementations would
    // disagree about, and the disagreement would be a parent told they can
    // book when they cannot.
    const notYet = await bookingOpensAtForFamily(consultation.id, user.id)

    res.json({
      ...consultation,
      googleMeetAvailable,
      // Null means "you may book now" — including every event with no waves.
      bookingOpensAt: notYet ? notYet.opensAt.toISOString() : null,
      bookingOpensForYearGroup: notYet ? notYet.yearGroupName : null,
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
          booking: serializeBookingForParent(s.booking, user.id),
        })),
        availabilityWindows: t.availabilityWindows,
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

/**
 * When THIS family may start booking a given consultation.
 *
 * An evening can open in waves — Year 3 at 19:00, Year 4 at 19:10 — so four
 * hundred families do not arrive in the same minute. An event with no windows
 * has none of this: it opens to everybody when its status says so, which is
 * what every event did before waves existed.
 *
 * THE FAMILY'S EARLIEST WINDOW APPLIES TO ALL THEIR CHILDREN, deliberately.
 *
 * Judging each child against their own year would split a family across
 * waves: a parent with a child in Year 3 and one in Year 4 could book the
 * first at 19:00 and would have to wait until 19:10 for the second — by which
 * time the slots next to the first have gone. That defeats the whole point of
 * helping siblings book close together, for precisely the families who need
 * it. It is also the fairer reading: the family with most to coordinate gets
 * in first rather than last.
 *
 * Returns null when they may book now.
 */
async function bookingOpensAtForFamily(
  consultationId: string,
  parentUserId: string,
): Promise<{ opensAt: Date; yearGroupName: string } | null> {
  const windows = await prisma.consultationBookingWindow.findMany({
    where: { consultationId },
    select: { opensAt: true, yearGroupId: true, yearGroup: { select: { name: true } } },
  })
  if (windows.length === 0) return null

  const links = await prisma.parentStudentLink.findMany({
    where: { userId: parentUserId },
    select: { student: { select: { class: { select: { yearGroupId: true } } } } },
  })
  const yearGroupIds = new Set(
    links.map(l => l.student?.class?.yearGroupId).filter((id): id is string => !!id),
  )

  const mine = windows.filter(w => yearGroupIds.has(w.yearGroupId))
  // A family in no year group that has a window is not held back by one. Waves
  // are for spreading load, not for excluding anybody the school forgot.
  if (mine.length === 0) return null

  const earliest = mine.reduce((a, b) => (a.opensAt <= b.opensAt ? a : b))
  if (earliest.opensAt <= new Date()) return null
  return { opensAt: earliest.opensAt, yearGroupName: earliest.yearGroup.name }
}

// Book a slot
router.post('/parent/book', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    // `studentName` is deliberately not read from the body — the school's name
    // for the child is resolved below.
    const { slotId, studentId, notes } = req.body

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

    // Waves, checked AFTER the status: an event that is closed outright
    // should say so, rather than promising a wave that will never come. And
    // before anything is claimed or Google is asked.
    const notYet = await bookingOpensAtForFamily(
      slot.consultationTeacher.consultation.id,
      user.id,
    )
    if (notYet) {
      // Say WHEN. "Shortly" was the same sentence whether the wave opened in
      // ten minutes or on Thursday, and the parent app shows only this string —
      // `opensAt` below is dropped by the client's error handling, so the time
      // has to be in the words or it reaches nobody.
      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { timezone: true },
      })
      const when = describeWhenForSchool(notYet.opensAt, school?.timezone || 'UTC')
      return res.status(403).json({
        error: `Booking opens for ${notYet.yearGroupName} ${when}. Please come back then.`,
        opensAt: notYet.opensAt.toISOString(),
      })
    }

    if (slot.isBreak) {
      return res.status(400).json({ error: 'Cannot book a break slot' })
    }

    if (slot.booking) {
      return res.status(400).json({ error: 'Slot is already booked' })
    }

    // Whose child is this?
    //
    // studentId and studentName arrived straight from the request body and
    // were stored unchecked, which was already wrong — a booking could name any
    // child, and the teacher would see whatever the client typed. It became
    // load-bearing once the one-booking rule started keying on the child: an
    // unvalidated id would let anyone book around it.
    //
    // A parent's children come from either the Hub-linked ParentStudentLink or
    // the legacy Child rows, and the parent app sends ids from both, so both
    // are accepted.
    const wantedStudentId = typeof studentId === 'string' ? studentId.trim() : ''
    if (!wantedStudentId) {
      return res.status(400).json({ error: 'Please choose which child this booking is for' })
    }

    const link = await prisma.parentStudentLink.findFirst({
      where: { userId: user.id, studentId: wantedStudentId },
      select: { student: { select: { firstName: true, lastName: true } } },
    })
    const legacyChild = link
      ? null
      : await prisma.child.findFirst({
          where: { id: wantedStudentId, parentId: user.id },
          select: { name: true },
        })

    if (!link && !legacyChild) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // The school's name for the child, never the client's. A teacher's list
    // should read as the school knows the child, not as a parent typed them.
    const resolvedStudentName = link
      ? `${link.student.firstName} ${link.student.lastName}`.trim()
      : legacyChild!.name

    // One booking per CHILD per teacher — not per parent per teacher, which is
    // what this used to be and got two things wrong. Siblings in the same class
    // could not both be booked, because the second one looked like the parent
    // double-booking; and the same child could be booked twice by two different
    // guardians, quietly costing another family a slot.
    const existingBooking = await prisma.consultationBooking.findFirst({
      where: {
        studentId: wantedStudentId,
        slot: {
          consultationTeacherId: slot.consultationTeacherId,
        },
      },
    })

    if (existingBooking) {
      return res.status(400).json({
        error: `${resolvedStudentName} already has an appointment with this teacher. Cancel that one first to move it.`,
      })
    }

    // What kind of appointment this is.
    //
    // A teacher set to PARENT_CHOICE will do either, and the parent picks here.
    // Any other setting is the teacher's decision and a choice sent by the
    // client is ignored rather than honoured — the picker only offers one where
    // one exists, so a choice arriving otherwise is a stale page or a crafted
    // request, and neither should move a meeting online.
    const offersChoice = slot.consultationTeacher.locationType === 'PARENT_CHOICE'
    const wanted = typeof req.body?.locationType === 'string' ? req.body.locationType : null
    if (offersChoice && wanted !== 'IN_PERSON' && wanted !== 'GOOGLE_MEET') {
      return res.status(400).json({ error: 'Choose whether this appointment is in person or on Google Meet' })
    }
    const chosenLocationType = offersChoice ? (wanted as 'IN_PERSON' | 'GOOGLE_MEET') : null
    const effectiveLocationType = chosenLocationType ?? slot.consultationTeacher.locationType

    // CLAIM THE SLOT FIRST.
    //
    // ConsultationBooking.slotId is unique, so two parents can never both hold
    // a slot — the database decides. What matters is how long the gap is
    // between checking and claiming, and what happens to whoever loses.
    //
    // This used to create the Google Meet event BEFORE the insert, so the gap
    // was a one-to-two second call to Google. On a booking-opens rush, two
    // parents would both pass the check, both wait on Google, and the loser
    // would hit the unique violation — after an orphaned calendar event had
    // already been made for a meeting that will never happen.
    //
    // Inserting first collapses that gap to a single statement, and means the
    // Meet event is only ever created for a slot already won.
    let booking
    try {
      booking = await prisma.consultationBooking.create({
        data: {
          slotId,
          parentId: user.id,
          studentId: wantedStudentId,
          studentName: resolvedStudentName,
          notes: notes || null,
          locationType: chosenLocationType,
          meetingLink: null,
        },
      })
    } catch (err) {
      // P2002 on slotId: somebody else claimed it between the check above and
      // here. That is an ordinary outcome of a popular evening, not an error —
      // 409 so the app can say so and refresh the grid, rather than the 500
      // this produced, which reads as "the app is broken" and invites a retry
      // into the same wall.
      if ((err as { code?: string }).code === 'P2002') {
        return res.status(409).json({ error: 'That time has just been taken. Please choose another slot.' })
      }
      throw err
    }

    let meetingLink: string | null = null
    let meetingEventId: string | null = null
    // A Meet appointment with no link is the failure worth naming: the parent
    // has an appointment and no way to attend it, and until now that happened
    // silently whenever the school had not connected Google Calendar.
    let meetingLinkFailed = false

    if (effectiveLocationType === 'GOOGLE_MEET') {
      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { googleCalendarRefreshToken: true, timezone: true },
      })

      if (school?.googleCalendarRefreshToken) {
        const consultationDate = slot.date || slot.consultationTeacher.consultation.date
        const startISO = `${consultationDate}T${slot.startTime}:00`
        const endISO = `${consultationDate}T${slot.endTime}:00`

        // BOTH parties. Only the parent was invited, so the event landed on
        // the school Google account's calendar and the teacher — the person
        // who has to be in the room — was never told by Google at all. They
        // found out from Connect's own email and had nothing in their diary.
        const attendees = [user.email, slot.consultationTeacher.teacher.email]
          .filter((e): e is string => !!e)

        const meetResult = await createGoogleMeetEvent({
          refreshToken: school.googleCalendarRefreshToken,
          summary: `${slot.consultationTeacher.teacher.name} - ${resolvedStudentName} Consultation`,
          description: `Parent consultation booking via Wasil`,
          startTime: startISO,
          endTime: endISO,
          attendees: attendees.length > 0 ? attendees : undefined,
          timeZone: school.timezone ?? undefined,
        })

        if (meetResult) {
          meetingLink = meetResult.meetLink
          meetingEventId = meetResult.eventId
        } else {
          meetingLinkFailed = true
        }
      } else {
        // No refresh token: the school has never connected Google Calendar.
        // The booking still stands — the parent holds the slot and losing it
        // would be the worse outcome — but they are told, rather than being
        // left to discover it on the evening.
        meetingLinkFailed = true
      }
    }

    if (meetingLink) {
      booking = await prisma.consultationBooking.update({
        where: { id: booking.id },
        data: { meetingLink, meetingEventId },
      })
    }

    // Fire-and-forget notifications
    const teacher = slot.consultationTeacher.teacher
    const consultation = slot.consultationTeacher.consultation
    const consultationDate = slot.date || consultation.date
    const slotTime = `${slot.startTime} - ${slot.endTime}`
    const location = slot.consultationTeacher.location || (slot.consultationTeacher.locationType === 'IN_PERSON' ? 'In Person' : slot.consultationTeacher.locationType)
    const schoolName = (consultation as any).school?.name || ''

    const emailDetails = {
      schoolId: user.schoolId,
      teacherName: teacher.name,
      childName: resolvedStudentName,
      date: consultationDate,
      time: slotTime,
      location: meetingLink || location,
      schoolName,
    }

    // Fire-and-forget, like the push below it, and NOT awaited.
    //
    // These were awaited and unguarded, so a wobble from the email provider —
    // most likely precisely when fifty parents book at once — threw into the
    // outer catch and returned 500. The booking already existed. The parent
    // was told it had failed, tried again, and got "Slot is already booked".
    //
    // A confirmation email is worth sending and is not worth failing a booking
    // over. The appointment is the thing that happened; the email is a copy of
    // the news.
    if (user.email) {
      sendBookingConfirmationToParent(user.email, emailDetails)
        .catch(e => console.error('[Consultation] Parent confirmation email failed:', e))
    }
    if (teacher.email) {
      sendBookingNotificationToTeacher(teacher.email, { ...emailDetails, parentName: user.name || 'Parent' })
        .catch(e => console.error('[Consultation] Teacher notification email failed:', e))
    }

    sendConsultationBookingNotification({
      parentId: user.id,
      teacherId: teacher.id,
      schoolId: user.schoolId,
      teacherName: teacher.name,
      parentName: user.name || 'Parent',
      childName: resolvedStudentName,
      date: consultationDate,
      time: slotTime,
    }).catch(e => console.error('[Consultation] Push notification failed:', e))

    res.status(201).json({
      ...booking,
      // The effective kind of appointment, resolved — so a client never has to
      // reproduce the fallback rule to know what it booked.
      locationType: effectiveLocationType,
      // True when this is a Meet appointment with no link. The booking is
      // real; the joining detail is not, and saying so is the whole point.
      meetingLinkFailed,
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

    // Cannot cancel within 2 hours of appointment.
    //
    // The slot is a WALL CLOCK — a date string and "15:30" — with no zone on
    // it anywhere, because that is what a school means by an appointment time.
    // `new Date("2026-09-25T15:30:00")` reads that in the SERVER's zone, which
    // in production is UTC, so a Dubai appointment resolved four hours late
    // and the lock engaged four hours late with it: cancellable until two
    // hours after the teacher was already sitting there waiting.
    const slotDate = booking.slot.date || consultation.date
    const appointmentTime = await parseWallClockForSchool(
      `${slotDate}T${booking.slot.startTime}`,
      user.schoolId,
    )
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000)
    if (appointmentTime <= twoHoursFromNow) {
      return res.status(400).json({ error: 'Cannot cancel booking — appointment is less than 2 hours away' })
    }

    await prisma.consultationBooking.delete({ where: { id: bookingId } })

    // Cancel the meeting too, where there was one.
    //
    // Deleting the booking used to leave the Google event standing, with a
    // working joining link, in both the teacher's calendar and the parent's —
    // so a teacher would sit waiting for a family who cancelled a fortnight
    // ago, with nothing to suggest otherwise.
    //
    // After the delete and not awaited: the cancellation has happened, and it
    // must not fail because Google is unreachable. Bookings made before the
    // event id was stored have none, and cannot be cleaned up automatically.
    if (booking.meetingEventId) {
      prisma.school
        .findUnique({ where: { id: user.schoolId }, select: { googleCalendarRefreshToken: true } })
        .then(school => {
          if (!school?.googleCalendarRefreshToken) return
          return deleteGoogleMeetEvent({
            refreshToken: school.googleCalendarRefreshToken,
            eventId: booking.meetingEventId as string,
          })
        })
        .catch(e => console.error('[Consultation] Could not remove the calendar event:', e))
    }

    // Fire-and-forget notifications
    const teacher = booking.slot.consultationTeacher.teacher
    const slotTime = `${booking.slot.startTime} - ${booking.slot.endTime}`
    const location = booking.slot.consultationTeacher.location || (booking.slot.consultationTeacher.locationType === 'IN_PERSON' ? 'In Person' : booking.slot.consultationTeacher.locationType)
    const schoolName = (consultation as any).school?.name || ''

    const emailDetails = {
      schoolId: user.schoolId,
      teacherName: teacher.name,
      childName: booking.studentName,
      date: slotDate,
      time: slotTime,
      location: booking.meetingLink || location,
      schoolName,
    }

    if (user.email) {
      await sendCancellationToParent(user.email, emailDetails)
    }
    if (teacher.email) {
      await sendCancellationToTeacher(teacher.email, { ...emailDetails, parentName: user.name || 'Parent' })
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
      // The URI goes out even here — it is exactly what somebody needs in
      // order to fix this, and withholding it makes the fix a guess.
      return res.json({ url: null, configured: false, redirectUri: GOOGLE_CALENDAR_REDIRECT_URI })
    }

    // Whether this school has already connected, and to which account — a
    // button reading "Connect" beside an existing connection is how somebody
    // reconnects the wrong Google account by accident.
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { googleCalendarEmail: true, googleCalendarRefreshToken: true },
    })

    const url = getGoogleAuthUrl(user.schoolId, user.id)
    res.json({
      url,
      configured: true,
      connected: !!school?.googleCalendarRefreshToken,
      connectedEmail: school?.googleCalendarEmail || null,
      // Shown in the admin so it can be pasted into Google Cloud. A
      // redirect_uri_mismatch names nothing, so without this the fix is
      // comparing two strings you cannot both see.
      redirectUri: GOOGLE_CALENDAR_REDIRECT_URI,
    })
  } catch (error) {
    console.error('Error getting Google auth URL:', error)
    res.status(500).json({ error: 'Failed to get Google auth URL' })
  }
})

// Create a consultation event
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, description, date, endDate, slotDuration, breakDuration, targetClass,
      defaultStartTime, defaultEndTime } = req.body

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
        // Blank stays null rather than becoming "", so "no default set" is
        // distinguishable from "runs from midnight".
        defaultStartTime: asTime(defaultStartTime),
        defaultEndTime: asTime(defaultEndTime),
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
            availabilityWindows: {
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
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
        availabilityWindows: t.availabilityWindows,
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
        bookingWindows: {
          select: { id: true, yearGroupId: true, opensAt: true, yearGroup: { select: { name: true } } },
          orderBy: { opensAt: 'asc' },
        },
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
            availabilityWindows: {
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
      bookingWindows: consultation.bookingWindows.map(w => ({
        id: w.id,
        yearGroupId: w.yearGroupId,
        yearGroupName: w.yearGroup.name,
        opensAt: w.opensAt.toISOString(),
      })),
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
        availabilityWindows: t.availabilityWindows,
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
    const { title, description, date, endDate, status, slotDuration, breakDuration, targetClass,
      defaultStartTime, defaultEndTime } = req.body

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
        ...(defaultStartTime !== undefined && { defaultStartTime: asTime(defaultStartTime) }),
        ...(defaultEndTime !== undefined && { defaultEndTime: asTime(defaultEndTime) }),
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

// Set when each year group may begin booking.
//
//   PUT /api/consultations/:id/booking-windows
//   { windows: [ { yearGroupId, opensAt } ] }
//
// The whole set is replaced, so removing a year group is sending a list
// without it — the alternative is a delete endpoint and two ways to get the
// same state half-applied.
//
// An empty list means no waves: the evening opens to everybody when its
// status says so, which is what every event did before waves existed.
router.put('/:id/booking-windows', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const windows = Array.isArray(req.body?.windows) ? req.body.windows : []

    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
      select: { id: true },
    })
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' })

    const parsed: { yearGroupId: string; opensAt: Date }[] = []
    for (const w of windows as Array<Record<string, unknown>>) {
      const yearGroupId = typeof w?.yearGroupId === 'string' ? w.yearGroupId.trim() : ''
      const raw = typeof w?.opensAt === 'string' ? w.opensAt : ''
      if (!yearGroupId || !raw) continue
      // "19:00" from a datetime-local input means 19:00 AT THE SCHOOL. Read
      // against the server's zone it would open a Dubai evening four hours
      // early — the same mistake posts and consultations already guard.
      const opensAt = await parseWallClockForSchool(raw, user.schoolId)
      if (!opensAt) continue
      parsed.push({ yearGroupId, opensAt })
    }

    // Year groups must be this school's. A wave keyed to somebody else's year
    // group would silently never match a family here.
    const ids = [...new Set(parsed.map(p => p.yearGroupId))]
    const valid = ids.length
      ? await prisma.yearGroup.findMany({
          where: { id: { in: ids }, schoolId: user.schoolId },
          select: { id: true },
        })
      : []
    if (valid.length !== ids.length) {
      return res.status(400).json({ error: 'Unknown or cross-school year group' })
    }

    await prisma.$transaction([
      prisma.consultationBookingWindow.deleteMany({ where: { consultationId: id } }),
      ...(parsed.length
        ? [prisma.consultationBookingWindow.createMany({
            data: parsed.map(w => ({ consultationId: id, yearGroupId: w.yearGroupId, opensAt: w.opensAt })),
          })]
        : []),
    ])

    const saved = await prisma.consultationBookingWindow.findMany({
      where: { consultationId: id },
      select: { id: true, yearGroupId: true, opensAt: true, yearGroup: { select: { name: true, order: true } } },
      orderBy: { opensAt: 'asc' },
    })

    res.json({
      windows: saved.map(w => ({
        id: w.id,
        yearGroupId: w.yearGroupId,
        yearGroupName: w.yearGroup.name,
        opensAt: w.opensAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error setting booking windows:', error)
    res.status(500).json({ error: 'Failed to set booking windows' })
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
    const { teacherId, teacherIds, location, locationType, startTime, endTime, availabilityWindows } = req.body

    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    // One teacher or many. Setting up a primary school's parents' evening was
    // ~30 passes through this form typing the same times, because teachers
    // configure nothing — the window and location are the same for all of them
    // and the slot grid is generated identically.
    const batch = Array.isArray(teacherIds)
    const requested: string[] = batch
      ? [...new Set((teacherIds as unknown[]).filter((t): t is string => typeof t === 'string' && !!t.trim()).map(t => t.trim()))]
      : typeof teacherId === 'string' && teacherId.trim()
        ? [teacherId.trim()]
        : []

    if (requested.length === 0) {
      return res.status(400).json({ error: batch ? 'teacherIds must contain at least one id' : 'Teacher not found' })
    }

    const staff = await prisma.user.findMany({
      where: {
        id: { in: requested },
        schoolId: user.schoolId,
        role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },
        // Somebody who has left cannot be added to an evening. Teachers already
        // on one are untouched — removing them would delete parents' bookings.
        // A teacher leaving in July is still addable in March.
        ...currentStaffWhere(),
      },
      select: { id: true },
    })
    const isStaffHere = new Set(staff.map(t => t.id))

    // Already on this event — skipped rather than fatal. An admin who added
    // three people by hand and then reaches for "everyone" should not have to
    // work out which three.
    const alreadyOn = await prisma.consultationTeacher.findMany({
      where: { consultationId: id, teacherId: { in: requested } },
      select: { teacherId: true },
    })
    const existing = new Set(alreadyOn.map(t => t.teacherId))

    const skipped: Array<{ teacherId: string; reason: string }> = []
    const toAdd: string[] = []
    for (const t of requested) {
      if (!isStaffHere.has(t)) skipped.push({ teacherId: t, reason: 'not a staff member at this school' })
      else if (existing.has(t)) skipped.push({ teacherId: t, reason: 'already on this event' })
      else toAdd.push(t)
    }

    // A single-teacher call keeps its original 404, so nothing that already
    // calls this route sees a new shape.
    if (!batch && toAdd.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    // Generate slots: use availabilityWindows if provided, otherwise fall back to flat startTime/endTime
    const allSlots: Array<{ startTime: string; endTime: string; isBreak: boolean; date: string }> = []
    const windowRecords: Array<{ date: string; startTime: string; endTime: string }> = []

    if (availabilityWindows && Array.isArray(availabilityWindows) && availabilityWindows.length > 0) {
      // Use per-window slot generation
      for (const window of availabilityWindows as Array<{ date: string; startTime: string; endTime: string }>) {
        windowRecords.push({ date: window.date, startTime: window.startTime, endTime: window.endTime })
        const windowSlots = generateSlots(window.startTime, window.endTime, consultation.slotDuration, consultation.breakDuration)
        windowSlots.forEach(s => allSlots.push({ ...s, date: window.date }))
      }
    } else {
      // Backwards compatible: use flat startTime/endTime across all dates
      const dates = getDateRange(consultation.date, consultation.endDate)
      const baseSlots = generateSlots(startTime, endTime, consultation.slotDuration, consultation.breakDuration)
      for (const date of dates) {
        baseSlots.forEach(s => allSlots.push({ ...s, date }))
      }
    }

    const added = []
    for (const eachTeacherId of toAdd) {
    const consultationTeacher = await prisma.consultationTeacher.create({
      data: {
        consultationId: id,
        teacherId: eachTeacherId,
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
        ...(windowRecords.length > 0 && {
          availabilityWindows: {
            create: windowRecords.map(w => ({
              date: w.date,
              startTime: w.startTime,
              endTime: w.endTime,
            })),
          },
        }),
      },
      include: {
        teacher: { select: { id: true, name: true } },
        slots: {
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        },
        availabilityWindows: {
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        },
      },
    })

    added.push({
      id: consultationTeacher.id,
      consultationId: consultationTeacher.consultationId,
      teacherId: consultationTeacher.teacherId,
      teacherName: consultationTeacher.teacher.name,
      location: consultationTeacher.location,
      locationType: consultationTeacher.locationType,
      startTime: consultationTeacher.startTime,
      endTime: consultationTeacher.endTime,
      slots: consultationTeacher.slots,
      availabilityWindows: consultationTeacher.availabilityWindows,
      createdAt: consultationTeacher.createdAt.toISOString(),
    })
    }

    // `teacherIds` gets the batch shape; a legacy single `teacherId` call gets
    // exactly what it got before, so existing callers are untouched.
    res.status(201).json(batch ? { added, skipped } : added[0])
  } catch (error) {
    console.error('Error adding teacher:', error)
    res.status(500).json({ error: 'Failed to add teacher' })
  }
})

// Get teacher availability windows
router.get('/:id/teachers/:ctId/availability', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, ctId } = req.params

    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    const ct = await prisma.consultationTeacher.findFirst({
      where: { id: ctId, consultationId: id },
      include: {
        availabilityWindows: {
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        },
      },
    })

    if (!ct) {
      return res.status(404).json({ error: 'Teacher not found in this consultation' })
    }

    res.json(ct.availabilityWindows)
  } catch (error) {
    console.error('Error fetching teacher availability:', error)
    res.status(500).json({ error: 'Failed to fetch teacher availability' })
  }
})

// Bulk replace teacher availability windows and regenerate slots
router.put('/:id/teachers/:ctId/availability', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, ctId } = req.params
    const { windows } = req.body as { windows: Array<{ date: string; startTime: string; endTime: string }> }

    if (!windows || !Array.isArray(windows) || windows.length === 0) {
      return res.status(400).json({ error: 'windows array is required and must not be empty' })
    }

    const consultation = await prisma.consultationEvent.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' })
    }

    const ct = await prisma.consultationTeacher.findFirst({
      where: { id: ctId, consultationId: id },
    })

    if (!ct) {
      return res.status(404).json({ error: 'Teacher not found in this consultation' })
    }

    // Delete old availability windows
    await prisma.consultationAvailabilityWindow.deleteMany({
      where: { consultationTeacherId: ctId },
    })

    // Create new availability windows
    await prisma.consultationAvailabilityWindow.createMany({
      data: windows.map(w => ({
        consultationTeacherId: ctId,
        date: w.date,
        startTime: w.startTime,
        endTime: w.endTime,
      })),
    })

    // Delete non-booked auto-generated slots (keep custom slots and booked slots)
    await prisma.consultationSlot.deleteMany({
      where: {
        consultationTeacherId: ctId,
        isCustom: false,
        booking: null,
      },
    })

    // Regenerate slots from each window
    const newSlots: Array<{ startTime: string; endTime: string; isBreak: boolean; date: string }> = []
    for (const window of windows) {
      const windowSlots = generateSlots(window.startTime, window.endTime, consultation.slotDuration, consultation.breakDuration)
      windowSlots.forEach(s => newSlots.push({ ...s, date: window.date }))
    }

    if (newSlots.length > 0) {
      await prisma.consultationSlot.createMany({
        data: newSlots.map(s => ({
          consultationTeacherId: ctId,
          startTime: s.startTime,
          endTime: s.endTime,
          isBreak: s.isBreak,
          date: s.date,
          isCustom: false,
        })),
      })
    }

    res.json({ success: true, slotsGenerated: newSlots.length })
  } catch (error) {
    console.error('Error updating teacher availability:', error)
    res.status(500).json({ error: 'Failed to update teacher availability' })
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

    // Scope to this consultation so a ctId from another (cross-tenant)
    // consultation can't be deleted via the school-scoped parent event.
    const removed = await prisma.consultationTeacher.deleteMany({ where: { id: ctId, consultationId: id } })
    if (removed.count === 0) return res.status(404).json({ error: 'Teacher not found' })
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
