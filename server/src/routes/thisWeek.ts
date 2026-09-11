// "This Week" — a child's clubs and fixtures, read from Wasil Active.
//
// Families get a burst of one-off messages when an allocation is published and
// then nothing, so the question a parent actually asks every week — what has my
// child got on, and who is collecting them — has no answer anywhere. Active has
// held every part of it all along; this is the missing screen, not missing data.
// Connect stores none of it.
//
// The guardian check lives HERE, and only here. Active's endpoint is asked by
// pupil and never by guardian, deliberately: Connect owns the household and
// knows whose children are whose, and Active does not and should not learn. So
// a request that isn't for one of the requester's own children must never reach
// Active at all.
import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, loadUserWithRelations } from '../middleware/auth.js'
import {
  fetchChildWeek,
  schoolWeekBounds,
  activeConfigured,
  ActiveScheduleError,
} from '../services/activeSchedule.js'

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/this-week/child/:studentId[?weekOf=YYYY-MM-DD]   (parent)
//
// Four outcomes, and they are deliberately distinct on the wire, because three
// of them would otherwise render as "your child has no clubs" — which is a
// confident written statement to a family, and wrong in all three:
//
//   200 { state: 'ok' }          a week, possibly with empty days
//   200 { state: 'not_synced' }  Active has never heard of this pupil
//   200 { state: 'no_hub_link' } the pupil has no Hub id to ask about
//   503 { state: 'unavailable' } Active is unconfigured or refused us
//
// An empty `days[]` inside `ok` means a genuinely quiet week and is the ONLY
// one of the four that may be shown as nothing on.
router.get('/child/:studentId', isAuthenticated, async (req, res) => {
  try {
    const { studentId } = req.params
    const user = (await loadUserWithRelations(req.user!.id))!

    // The child-ownership check, mirroring the timetable route's resolution.
    const mine = (user.studentLinks ?? [])
      .map(l => l.student)
      .filter((s): s is NonNullable<typeof s> => !!s)
    const child = mine.find(s => s.id === studentId)
    if (!child) {
      // Not one of the requester's children — don't reveal whether it exists.
      return res.status(404).json({ error: 'Child not found' })
    }

    const childName = `${child.firstName} ${child.lastName}`.trim()

    // A pupil Connect created by hand has no Hub id, so there is nothing to ask
    // Active about. Said plainly rather than shown as a quiet week.
    if (!child.hubPupilId) {
      return res.json({ state: 'no_hub_link', childName, days: [], timezone: null })
    }

    const school = await prisma.school.findUnique({
      where: { id: req.user!.schoolId },
      select: { hubSchoolId: true, timezone: true },
    })
    if (!school?.hubSchoolId || !activeConfigured()) {
      return res.status(503).json({ state: 'unavailable', childName })
    }

    const weekOf = typeof req.query.weekOf === 'string' && DATE_RE.test(req.query.weekOf)
      ? req.query.weekOf
      : undefined
    const { from, to } = schoolWeekBounds(school.timezone || 'UTC', weekOf)

    const week = await fetchChildWeek({
      hubSchoolId: school.hubSchoolId,
      hubPupilId: child.hubPupilId,
      from,
      to,
    })

    // Active doesn't recognise the pupil — almost always a child who hasn't
    // synced from Hub yet. Rendering this as an empty week would tell a family,
    // in writing, that their child has no clubs on the morning after they were
    // allocated one.
    if (week.unknown) {
      return res.json({ state: 'not_synced', childName, days: [], timezone: week.timezone, from, to })
    }

    res.json({
      state: 'ok',
      childName,
      // Named so the page can say which zone the times are in if it ever needs
      // to. Every time below is ALREADY in it — display only, never converted.
      timezone: week.timezone,
      from,
      to,
      days: week.days,
    })
  } catch (error) {
    if (error instanceof ActiveScheduleError) {
      // Active's own refusal, including a missing scope. Logged with its status
      // so a 403 is traceable to the grant rather than to the request.
      console.error('[thisWeek] Wasil Active refused:', error.message)
      return res.status(503).json({ state: 'unavailable' })
    }
    console.error('Error building this-week schedule:', error)
    res.status(500).json({ error: 'Failed to load the week' })
  }
})

export default router
