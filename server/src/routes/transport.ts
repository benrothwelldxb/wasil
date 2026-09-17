import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, loadUserWithRelations } from '../middleware/auth.js'
import { todayInTimezone } from '../services/dateTime.js'

/**
 * A guardian's own children's bus arrangements.
 *
 * This is the ONLY read path for transport data in Connect, and it takes no
 * arguments — no stop list, no route list, no school-wide view, no parameter
 * that could widen it. Because the school collects door-to-door, a stop name is
 * a child's home address; a read path that cannot express "someone else's
 * child" cannot leak one. See docs/adr/0001.
 *
 * There is deliberately no staff or admin transport surface anywhere in
 * Connect. Desk holds the roster and restricts it to a transport manager;
 * Connect has no equivalent tier, so it has no staff read at all.
 */
const router = Router()

router.get('/mine', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const studentIds = (user.studentLinks || []).map(l => l.studentId)
    if (studentIds.length === 0) return res.json({ children: [] })

    // The school's own switch, and the reason it is HERE rather than on the
    // push: Desk sending a roster must never be what makes buses appear in a
    // parent app. A school still testing transport in Desk pushes freely and
    // parents see nothing until someone turns it on deliberately.
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { transportEnabled: true, timezone: true },
    })
    if (!school?.transportEnabled) return res.json({ children: [] })

    const assignments = await prisma.transportAssignment.findMany({
      // Scoped to this guardian's own children, and to their school. Both, so
      // that a stale link across a tenancy cannot reach another school's row.
      where: { studentId: { in: studentIds }, schoolId: user.schoolId },
      orderBy: [{ leg: 'asc' }, { timeLocal: 'asc' }],
    })
    if (assignments.length === 0) return res.json({ children: [] })

    // Today's marks for the buses these children are actually on. Keyed by
    // route + leg because that is what a run is about: a bus, not a child.
    const today = todayInTimezone(school.timezone ?? 'UTC')
    const routeIds = [...new Set(assignments.map(a => a.routeId).filter((r): r is string => !!r))]
    const runs = routeIds.length
      ? await prisma.transportRun.findMany({
          where: { schoolId: user.schoolId, dateLocal: today, routeId: { in: routeIds } },
          select: { routeId: true, leg: true, markedAt: true, dueAt: true },
        })
      : []
    const runByRouteLeg = new Map(runs.map(r => [`${r.routeId}:${r.leg}`, r]))

    const nameByStudentId = new Map(
      (user.studentLinks || []).map(l => [l.studentId, `${l.student.firstName} ${l.student.lastName}`.trim()]),
    )

    // Grouped per child, because that is how a parent reads it: "Amina, morning
    // bus at 06:52; afternoon bus at 15:40".
    const byChild = new Map<string, { studentId: string; studentName: string; legs: unknown[] }>()
    for (const a of assignments) {
      let entry = byChild.get(a.studentId)
      if (!entry) {
        entry = {
          studentId: a.studentId,
          studentName: nameByStudentId.get(a.studentId) || 'Your child',
          legs: [],
        }
        byChild.set(a.studentId, entry)
      }
      entry.legs.push({
        leg: a.leg,
        routeName: a.routeName,
        routeCode: a.routeCode,
        // Suppressed where showing it would disclose one parent's address to
        // another (Desk sets the flag; Connect holds no household data and
        // cannot judge it). Route and time still answer "which bus, when".
        stopName: a.hideStopName ? null : a.stopName,
        stopNameHidden: a.hideStopName,
        timeLocal: a.timeLocal,
        // The two TIMES, never a sentence: the app words it and translates it.
        // Null when the office has not marked this bus today, or has withdrawn
        // the mark — a withdrawal must make the app stop saying it.
        run: (() => {
          const r = a.routeId ? runByRouteLeg.get(`${a.routeId}:${a.leg}`) : undefined
          if (!r) return null
          return { markedAt: r.markedAt.toISOString(), dueAt: r.dueAt }
        })(),
      })
    }

    res.json({ children: [...byChild.values()] })
  } catch (error) {
    console.error('Error loading transport assignments:', error)
    // Never degrade a failure into an empty list: a screen that quietly shows
    // no bus is worse than one that admits it is broken.
    res.status(500).json({ error: 'Failed to load transport' })
  }
})

export default router
