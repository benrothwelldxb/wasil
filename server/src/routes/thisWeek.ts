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
  fetchOpenAvailability,
  sendAvailabilityReply,
  schoolWeekBounds,
  activeConfigured,
  ActiveScheduleError,
} from '../services/activeSchedule.js'
import type { ActiveScheduleItem } from '../services/activeSchedule.js'
import { fixtureUpdatesFor, addDays, DAY_BEFORE_FROM } from '../services/fixtureUpdates.js'
import type { FixtureUpdate } from '../services/fixtureUpdates.js'
import { nowInTimezone } from '../services/dateTime.js'

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type RequesterChild = { id: string; name: string; hubPupilId: string | null }

// The child-ownership check, resolving from BOTH sources the parent app's child
// switcher offers — studentLinks and the legacy `children` table.
//
// This read studentLinks alone and 404'd everything else, which is how a parent
// got a blank page for a child the menu had just offered them: the switcher
// resolves from two tables (copied from the timetable page), the route accepted
// one, and the ids from the second matched nothing. A picker and its endpoint
// disagreeing about what a valid id is will always look like the endpoint being
// broken for one particular child.
function requesterChildren(user: NonNullable<Awaited<ReturnType<typeof loadUserWithRelations>>>): RequesterChild[] {
  const entries: RequesterChild[] = []
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
  return entries
}

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

    const entries = requesterChildren(user)

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

    // What the school has told this family about the week's fixtures, so a
    // tapped "Update on Maya's fixture" lands on a page that shows it.
    const updates = await fixtureUpdatesFor([child.id], from, to)
    const fixtureUpdates: Record<string, Array<{ message: string; sentAt: string }>> = {}
    for (const u of updates) (fixtureUpdates[u.fixtureId] ??= []).push({ message: u.message, sentAt: u.sentAt })

    res.json({
      state: 'ok',
      childName,
      fixtureUpdates,
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

// "Can they play?" — the questions a school has asked about this parent's
// children. Active holds the answers; this checks the household and passes them
// along. Same rule as the week: a child who is not the requester's never reaches
// Active.

/** What a refusal from Active means for the parent, logged by layer. */
function availabilityFailure(res: import('express').Response, error: unknown, what: string) {
  if (error instanceof ActiveScheduleError) {
    if (error.status === 409) return res.status(409).json({ error: 'fixture_closed' })
    if (error.status === 404 && error.message.includes('not_asked')) {
      return res.status(404).json({ error: 'not_asked' })
    }
    const reason = error.status === 404 ? 'unknown_school' : error.status === 403 ? 'scope' : 'upstream'
    console.error(`[thisWeek] Wasil Active refused ${what} (${reason}, status ${error.status})`, error.message)
    return res.status(503).json({ state: 'unavailable', reason })
  }
  console.error(`Error handling ${what}:`, error)
  return res.status(500).json({ error: 'Failed to reach the school system' })
}

async function hubSchoolIdFor(schoolId: string): Promise<string | null> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { hubSchoolId: true } })
  return school?.hubSchoolId && activeConfigured() ? school.hubSchoolId : null
}

// GET /api/this-week/fixture-day   (parent)
//
// The home page's fixture card: every fixture one of the requester's children
// is picked for, today, and from 15:00 the day before for tomorrow's; plus any
// "update to families" about a fixture still to come, from the moment it is
// sent. Updates are Connect's own record, so they show even if Active is down;
// `scheduleUnavailable` says the times could not be read.
//
// Nothing here is stored. Times are Active's wall clock, passed through.
router.get('/fixture-day', isAuthenticated, requireModule('activeScheduleEnabled'), async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const children = requesterChildren(user)
    if (children.length === 0) return res.json({ cards: [], scheduleUnavailable: false })

    const school = await prisma.school.findUnique({
      where: { id: req.user!.schoolId },
      select: { hubSchoolId: true, timezone: true },
    })
    const now = nowInTimezone(school?.timezone || 'UTC')
    const today = now.date
    const lastDay = now.time >= DAY_BEFORE_FROM ? addDays(today, 1) : today

    type Card = {
      studentId: string
      childName: string
      fixtureId: string
      date: string | null
      name: string
      item: ActiveScheduleItem | null
      updates: Array<{ message: string; sentAt: string }>
    }
    const cards = new Map<string, Card>()
    const nameOf = new Map(children.map(c => [c.id, c.name]))

    let scheduleUnavailable = false
    const linked = children.filter(c => c.hubPupilId)
    if (linked.length > 0) {
      if (!school?.hubSchoolId || !activeConfigured()) {
        scheduleUnavailable = true
      } else {
        const weeks = await Promise.allSettled(linked.map(c => fetchChildWeek({
          hubSchoolId: school.hubSchoolId!, hubPupilId: c.hubPupilId!, from: today, to: lastDay,
        })))
        weeks.forEach((w, i) => {
          if (w.status === 'rejected') { scheduleUnavailable = true; return }
          const child = linked[i]
          for (const day of w.value.days) {
            for (const item of day.items) {
              // A played fixture is over; nothing on it is worth the top of the page.
              if (item.kind !== 'fixture' || !item.id || item.status === 'played') continue
              cards.set(`${child.id}:${item.id}`, {
                studentId: child.id, childName: child.name, fixtureId: item.id,
                date: day.date, name: item.name, item, updates: [],
              })
            }
          }
        })
      }
    }

    const updates: FixtureUpdate[] = await fixtureUpdatesFor(children.map(c => c.id), today)
    for (const u of updates) {
      const key = `${u.studentId}:${u.fixtureId}`
      let card = cards.get(key)
      if (!card) {
        // An update about a fixture further ahead, or one this child is not
        // (yet) picked for: shown on its own, from the moment it was sent.
        card = {
          studentId: u.studentId, childName: nameOf.get(u.studentId) ?? '', fixtureId: u.fixtureId,
          date: u.date, name: u.fixtureName ?? 'Fixture', item: null, updates: [],
        }
        cards.set(key, card)
      }
      card.updates.push({ message: u.message, sentAt: u.sentAt })
    }

    const list = [...cards.values()].sort((a, b) =>
      (a.date ?? '9999').localeCompare(b.date ?? '9999')
      || (a.item?.departs_at ?? a.item?.starts_at ?? '').localeCompare(b.item?.departs_at ?? b.item?.starts_at ?? '')
      || a.childName.localeCompare(b.childName))

    res.json({ today, cards: list, scheduleUnavailable })
  } catch (error) {
    console.error('Error building fixture-day card:', error)
    res.status(500).json({ error: 'Failed to load fixtures' })
  }
})

// GET /api/this-week/availability   (parent)
router.get('/availability', isAuthenticated, requireModule('activeScheduleEnabled'), async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const children = requesterChildren(user).filter(c => c.hubPupilId)
    if (children.length === 0) return res.json({ asks: [] })

    const hubSchoolId = await hubSchoolIdFor(req.user!.schoolId)
    if (!hubSchoolId) return res.status(503).json({ state: 'unavailable' })

    const asks = await fetchOpenAvailability({
      hubSchoolId,
      hubPupilIds: children.map(c => c.hubPupilId!),
    })
    const byPupil = new Map(children.map(c => [c.hubPupilId!, c]))
    res.json({
      asks: asks.flatMap(a => {
        const child = byPupil.get(a.hub_pupil_id)
        // Only ever what was asked for, but a reply naming another child is not
        // something to pass to a parent on trust.
        if (!child) return []
        return [{
          fixtureId: a.fixture_id,
          studentId: child.id,
          childName: child.name,
          name: a.name,
          date: a.date,
          startsAt: a.starts_at,
          venue: a.venue ?? null,
          travelling: a.travelling,
          state: a.state,
          respondedVia: a.responded_via ?? null,
        }]
      }),
    })
  } catch (error) {
    availabilityFailure(res, error, 'availability read')
  }
})

// POST /api/this-week/availability   (parent)
router.post('/availability', isAuthenticated, requireModule('activeScheduleEnabled'), async (req, res) => {
  try {
    const { studentId, fixtureId, state } = (req.body ?? {}) as Record<string, unknown>
    if (typeof studentId !== 'string' || typeof fixtureId !== 'string' || !fixtureId) {
      return res.status(400).json({ error: 'studentId and fixtureId are required' })
    }
    if (state !== 'available' && state !== 'unavailable') {
      return res.status(400).json({ error: 'state must be available or unavailable' })
    }

    const user = (await loadUserWithRelations(req.user!.id))!
    const child = requesterChildren(user).find(c => c.id === studentId)
    // Not theirs, or nothing Active could know them by. Neither is revealed.
    if (!child?.hubPupilId) return res.status(404).json({ error: 'Child not found' })

    const hubSchoolId = await hubSchoolIdFor(req.user!.schoolId)
    if (!hubSchoolId) return res.status(503).json({ state: 'unavailable' })

    await sendAvailabilityReply({ hubSchoolId, hubPupilId: child.hubPupilId, fixtureId, state })
    res.json({ ok: true, state })
  } catch (error) {
    availabilityFailure(res, error, 'availability reply')
  }
})

export default router
