// "Today your child has …" — the parent-facing timetable helper.
//
//   GET /api/timetable/today   (authenticated parent)
//
// Sourced from Wasil Hub (the timetable source of truth). For each of the
// parent's children we look up the child's class's *effective* day from Hub
// (per class, cached and shared across that class's parents — approach B) and
// distil it to reminder-worthy items (Swimming → kit, Library → books, …).
//
// It degrades gracefully to `items: []` rather than erroring whenever Hub can't
// answer: a class with no Hub link, a class with no published timetable, or the
// service token not being configured yet. Callers (the parent app / agent) then
// fall back to Connect's own ScheduleItems.

import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, loadUserWithRelations } from '../middleware/auth.js'
import { todayInTimezone } from '../services/dateTime.js'
import { getClassDayCached } from '../services/timetableCache.js'
import { remindersForBlocks, type ReminderItem } from '../services/timetableReminders.js'

const router = Router()

interface ChildEntry {
  studentId: string
  name: string
  className: string
  /** Connect Class id — resolved to a Hub class id below. */
  classId: string
}

export interface TimetableTodayChild {
  studentId: string
  name: string
  className: string
  items: ReminderItem[]
}

router.get('/today', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!

    // Collect the parent's children from both the new studentLinks and the
    // legacy children[]. Keyed by class id so we can dedup class fetches.
    const entries: ChildEntry[] = []
    const seen = new Set<string>()
    for (const link of user.studentLinks ?? []) {
      const s = link.student
      if (!s?.classId || seen.has(s.id)) continue
      seen.add(s.id)
      entries.push({
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        className: s.class?.name ?? '',
        classId: s.classId,
      })
    }
    for (const child of user.children ?? []) {
      if (!child.classId || seen.has(child.id)) continue
      seen.add(child.id)
      entries.push({
        studentId: child.id,
        name: child.name,
        className: child.class?.name ?? '',
        classId: child.classId,
      })
    }

    // Resolve each child's Connect class to its Hub class id (and the school's
    // Hub id + timezone). Without a Hub link nothing can be fetched.
    const [school, classes] = await Promise.all([
      prisma.school.findUnique({
        where: { id: req.user!.schoolId },
        select: { hubSchoolId: true, timezone: true },
      }),
      entries.length
        ? prisma.class.findMany({
            where: { id: { in: [...new Set(entries.map((e) => e.classId))] } },
            select: { id: true, hubClassId: true },
          })
        : Promise.resolve([] as { id: string; hubClassId: string | null }[]),
    ])

    const hubClassByConnectId = new Map(classes.map((c) => [c.id, c.hubClassId]))
    const date = todayInTimezone(school?.timezone ?? 'UTC')

    // Distinct Hub classes to fetch (siblings in the same class share one call).
    const distinctHubClassIds = [
      ...new Set(
        entries
          .map((e) => hubClassByConnectId.get(e.classId))
          .filter((id): id is string => !!id),
      ),
    ]

    // If Hub isn't reachable (no token / school not linked) everyone gets []
    // — a graceful fallback, not a 500.
    const itemsByHubClass = new Map<string, ReminderItem[]>()
    const hubReady = !!process.env.HUB_SERVICE_TOKEN && !!school?.hubSchoolId
    if (hubReady) {
      await Promise.all(
        distinctHubClassIds.map(async (hubClassId) => {
          try {
            const day = await getClassDayCached(school!.hubSchoolId!, hubClassId, date)
            itemsByHubClass.set(hubClassId, remindersForBlocks(day?.blocks ?? []))
          } catch {
            // A per-class Hub failure shouldn't sink the whole response.
            itemsByHubClass.set(hubClassId, [])
          }
        }),
      )
    }

    const result: TimetableTodayChild[] = entries.map((e) => {
      const hubClassId = hubClassByConnectId.get(e.classId) ?? null
      return {
        studentId: e.studentId,
        name: e.name,
        className: e.className,
        items: hubClassId ? itemsByHubClass.get(hubClassId) ?? [] : [],
      }
    })

    res.json(result)
  } catch (error) {
    console.error('Error building timetable/today:', error)
    res.status(500).json({ error: 'Failed to load timetable' })
  }
})

export default router
