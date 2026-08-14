// Partner API — a deliberately narrow surface for external Wasil apps (Desk).
//
//   GET /api/partner/inbox/summary?hub_user_id=<Hub user id> → { unread }
//   GET /api/partner/attendance/today?school_id=&date=       → today's absences
//
// Auth is a Bearer partner token (see middleware/partnerAuth). Responses carry
// only what a partner needs to ROUTE and DISPLAY — a count, or a student's
// display name + class (with `hubClassId` so Desk can route to the class
// teacher) — and never other pupil PII. That keeps partners outside the
// parent-data boundary by design.
import { Router } from 'express'
import prisma from '../services/prisma.js'
import { requirePartner } from '../middleware/partnerAuth.js'
import { todayInTimezone } from '../services/dateTime.js'

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Unread inbox summary for one staff member, addressed by their Hub user id
// (Connect maps it via the Hub SSO identity link, `User.hubUserId`).
//
// `unread` = the number of that staff member's conversation THREADS that hold at
// least one unread inbound message (a non-deleted message from the parent that
// the staff member hasn't read), excluding threads they've archived — the same
// notion of "unread" the staff inbox itself uses. Unknown user → { unread: 0 }.
router.get('/inbox/summary', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    if (!hubUserId) {
      return res.status(400).json({ error: 'hub_user_id required' })
    }

    const staff = await prisma.user.findUnique({
      where: { hubUserId },
      select: { id: true },
    })
    // Unknown user is not an error — Desk polls many ids, some unmapped.
    if (!staff) return res.json({ unread: 0 })

    const unread = await prisma.conversation.count({
      where: {
        staffId: staff.id,
        archivedByStaff: false,
        messages: {
          some: { senderId: { not: staff.id }, readAt: null, deletedAt: null },
        },
      },
    })

    // Cheap + cacheable — Desk polls at most once a minute per active user.
    res.set('Cache-Control', 'private, max-age=30')
    res.json({ unread })
  } catch (error) {
    console.error('Error building partner inbox summary:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// Today's parent-reported absences for a school, so Desk can surface them and
// route each to the class teacher (via `hubClassId`).
//
//   GET /api/partner/attendance/today?school_id=<Hub school id>[&date=YYYY-MM-DD]
//
// `school_id` is resolved against the Hub school link (falls back to a Connect
// school id). `date` defaults to today in the school's timezone. Returns every
// AttendanceRequest whose window covers `date` — i.e. `startDate <= date <=
// coalesce(endDate, startDate)` (the string dates are YYYY-MM-DD, so a
// lexicographic compare is correct). Each row carries only denormalised display
// data (student display name + class) plus `hubClassId` for routing — no other
// pupil PII. Unknown school → empty list, not an error.
router.get('/attendance/today', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) {
      return res.status(400).json({ error: 'school_id required' })
    }
    const dateParam = typeof req.query.date === 'string' ? req.query.date.trim() : ''
    if (dateParam && !DATE_RE.test(dateParam)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }

    // Accept the Hub school id (Desk's world) or a Connect school id.
    const school = await prisma.school.findFirst({
      where: { OR: [{ hubSchoolId: schoolIdParam }, { id: schoolIdParam }] },
      select: { id: true, timezone: true },
    })
    // Unknown school is not an error — Desk may probe ids we don't host.
    if (!school) return res.json({ date: dateParam || null, absences: [] })

    const date = dateParam || todayInTimezone(school.timezone ?? 'UTC')

    const rows = await prisma.attendanceRequest.findMany({
      where: {
        schoolId: school.id,
        // Window covers `date`: startDate <= date <= coalesce(endDate, startDate).
        startDate: { lte: date },
        OR: [
          { endDate: { gte: date } },
          { AND: [{ endDate: null }, { startDate: { gte: date } }] },
        ],
      },
      select: {
        type: true,
        reason: true,
        notes: true,
        startDate: true,
        endDate: true,
        time: true,
        status: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            class: { select: { name: true, hubClassId: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const absences = rows.map((r) => ({
      studentName: `${r.student.firstName} ${r.student.lastName}`.trim(),
      hubClassId: r.student.class?.hubClassId ?? null,
      className: r.student.class?.name ?? null,
      type: r.type,
      reason: r.reason,
      notes: r.notes,
      startDate: r.startDate,
      endDate: r.endDate,
      time: r.time,
      status: r.status,
    }))

    res.set('Cache-Control', 'private, max-age=30')
    res.json({ date, absences })
  } catch (error) {
    console.error('Error building partner attendance/today:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
