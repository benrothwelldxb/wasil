import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, loadUserWithRelations } from '../middleware/auth.js'

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

    const assignments = await prisma.transportAssignment.findMany({
      // Scoped to this guardian's own children, and to their school. Both, so
      // that a stale link across a tenancy cannot reach another school's row.
      where: { studentId: { in: studentIds }, schoolId: user.schoolId },
      orderBy: [{ leg: 'asc' }, { timeLocal: 'asc' }],
    })
    if (assignments.length === 0) return res.json({ children: [] })

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
