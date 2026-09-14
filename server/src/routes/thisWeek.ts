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
import { requireModule } from '../middleware/moduleFlag.js'
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
// `requireModule` runs before anything reads Active. A school without the
// module 404s here, so a parent with a stale link gets nothing rather than a
// page, and no request leaves Connect on their behalf.
router.get('/child/:studentId', isAuthenticated, requireModule('activeScheduleEnabled'), async (req, res) => {
  try {
    const { studentId } = req.params
    const user = (await loadUserWithRelations(req.user!.id))!

    // The child-ownership check, resolving from BOTH sources the parent app's
    // child switcher offers — studentLinks and the legacy `children` table.
    //
    // This read studentLinks alone and 404'd everything else, which is how a
    // parent got a blank page for a child the menu had just offered them: the
    // switcher resolves from two tables (copied from the timetable page), the
    // route accepted one, and the ids from the second matched nothing. A picker
    // and its endpoint disagreeing about what a valid id is will always look
    // like the endpoint being broken for one particular child.
    const entries: Array<{ id: string; name: string; hubPupilId: string | null }> = []
    const seen = new Set<string>()
    for (const link of user.studentLinks ?? []) {
      const s = link.student
      if (!s || seen.has(s.id)) continue
      seen.add(s.id)
      entries.push({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        hubPupilId: s.hubPupilId ?? null,
      })
    }
    for (const c of user.children ?? []) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      // A legacy Child carries no Hub pupil id by definition, so it resolves to
      // `no_hub_link` below — which is the honest answer, and a different one
      // from the 404 it used to get.
      entries.push({ id: c.id, name: c.name.trim(), hubPupilId: null })
    }

    const child = entries.find(e => e.id === studentId)
    if (!child) {
      // Not one of the requester's children — don't reveal whether it exists.
      return res.status(404).json({ error: 'Child not found' })
    }

    const childName = child.name

    // A pupil Connect created by hand, or a legacy Child row, has no Hub id, so
    // there is nothing to ask Active about. Said plainly rather than shown as a
    // quiet week.
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
      // Passed straight through, undefined and all. The page decides what to
      // say; this route does not collapse three possible meanings into two.
      clubsPublished: week.clubsPublished,
    })
  } catch (error) {
    if (error instanceof ActiveScheduleError) {
      // Active's own refusal. The parent sees the same thing either way — there
      // is nothing a family can do about any of these — but the STATUS says
      // which layer is broken, and logging them identically would send someone
      // to the wrong one:
      //   404  the school_id WE send is wrong. Ours to fix, and permanent until
      //        we do; it will not come back on a retry.
      //   403  the token lacks `schedule:read`. Ben's grant, not the request.
      //   else Active is down or erroring — the only one a retry helps.
      //
      // Worth the distinction because of how this presented before Active
      // started 404ing an unknown school: a wrong school_id came back 200 with
      // every pupil in `unknown_pupils`, so it read as "all your children are
      // unsynced" and would have sent us debugging the Hub roster sync for what
      // was a typo in a tenant id.
      const reason = error.status === 404
        ? 'unknown_school'
        : error.status === 403 ? 'scope' : 'upstream'
      console.error(
        `[thisWeek] Wasil Active refused (${reason}, status ${error.status})`,
        reason === 'unknown_school' ? `school_id sent: ${req.user!.schoolId}` : '',
        error.message,
      )
      return res.status(503).json({ state: 'unavailable', reason })
    }
    console.error('Error building this-week schedule:', error)
    res.status(500).json({ error: 'Failed to load the week' })
  }
})

export default router
