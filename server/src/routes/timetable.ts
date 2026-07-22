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
import { isAuthenticated, isAdmin, loadUserWithRelations } from '../middleware/auth.js'
import { todayInTimezone } from '../services/dateTime.js'
import { getClassDayCached } from '../services/timetableCache.js'
import { buildReminderResolver, type ReminderItem } from '../services/timetableReminders.js'

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
    // Hub id + timezone), plus load the school's editable reminder map. Without a
    // Hub link nothing can be fetched.
    const [school, classes, reminderRows] = await Promise.all([
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
      prisma.subjectReminder.findMany({
        where: { schoolId: req.user!.schoolId, active: true },
        select: { subject: true, emoji: true, reminder: true },
      }),
    ])

    const resolver = buildReminderResolver(reminderRows)

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
            itemsByHubClass.set(hubClassId, resolver.remindersForBlocks(day?.blocks ?? []))
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

// ---------------------------------------------------------------------------
// GET /api/timetable/grid   (admin) — read-only "what Hub has allocated"
//
// A confirmation view for staff: for each Hub-linked class, which reminder-worthy
// specialist subjects (Swimming, PE, Library, …) fall on which weekday of the
// current week, straight from Hub's timetable. Nothing here is editable — Hub
// owns the days. Degrades to `hubAvailable:false` + empty allocations when Hub
// can't answer (no token / school not linked / no published timetable), so the
// admin UI can fall back to the manual grid.
// ---------------------------------------------------------------------------

/** A reminder-worthy subject on a given weekday. */
interface GridSubject {
  subject: string
  emoji: string
  specialist: boolean
}
interface GridClass {
  classId: string
  className: string
  /** weekday (1=Mon … 5=Fri) → subjects allocated that day. */
  allocations: Record<number, GridSubject[]>
}
export interface TimetableGrid {
  /** Monday of the week shown, YYYY-MM-DD (school timezone). */
  weekOf: string
  /** True when at least one class's day was answered by Hub. */
  hubAvailable: boolean
  classes: GridClass[]
}

/** Mon–Fri dates (YYYY-MM-DD) of the week containing `todayISO`. Pure string
 * arithmetic via a UTC anchor, so no timezone drift. */
function weekdayDates(todayISO: string): { monday: string; dates: { weekday: number; date: string }[] } {
  const anchor = new Date(`${todayISO}T00:00:00.000Z`)
  const dow = anchor.getUTCDay() // 0=Sun … 6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(anchor)
  monday.setUTCDate(anchor.getUTCDate() + mondayOffset)
  const dates: { weekday: number; date: string }[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    dates.push({ weekday: i + 1, date: d.toISOString().slice(0, 10) })
  }
  return { monday: monday.toISOString().slice(0, 10), dates }
}

router.get('/grid', isAdmin, async (req, res) => {
  try {
    const schoolId = req.user!.schoolId
    const [school, classes, reminderRows] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { hubSchoolId: true, timezone: true },
      }),
      prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, hubClassId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.subjectReminder.findMany({
        where: { schoolId, active: true },
        select: { subject: true, emoji: true, reminder: true },
      }),
    ])

    const resolver = buildReminderResolver(reminderRows)
    const { monday, dates } = weekdayDates(todayInTimezone(school?.timezone ?? 'UTC'))
    const hubReady = !!process.env.HUB_SERVICE_TOKEN && !!school?.hubSchoolId

    const gridClasses: GridClass[] = classes.map((c) => ({
      classId: c.id,
      className: c.name,
      allocations: {},
    }))
    let hubAvailable = false

    if (hubReady) {
      // Fetch every (class, weekday) once; the cache coalesces repeats.
      await Promise.all(
        classes.map(async (c, idx) => {
          if (!c.hubClassId) return
          await Promise.all(
            dates.map(async ({ weekday, date }) => {
              try {
                const day = await getClassDayCached(school!.hubSchoolId!, c.hubClassId!, date)
                if (!day) return
                hubAvailable = true
                // Dedup a subject that appears more than once in a day.
                const seen = new Set<string>()
                const subjects: GridSubject[] = []
                for (const item of resolver.remindersForBlocks(day.blocks)) {
                  const key = item.subject.toLowerCase()
                  if (seen.has(key)) continue
                  seen.add(key)
                  subjects.push({ subject: item.subject, emoji: item.emoji, specialist: item.specialist })
                }
                if (subjects.length) gridClasses[idx].allocations[weekday] = subjects
              } catch {
                // A per-class/day Hub failure shouldn't sink the grid.
              }
            }),
          )
        }),
      )
    }

    const result: TimetableGrid = { weekOf: monday, hubAvailable, classes: gridClasses }
    res.json(result)
  } catch (error) {
    console.error('Error building timetable/grid:', error)
    res.status(500).json({ error: 'Failed to load timetable grid' })
  }
})

export default router
