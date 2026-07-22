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
import { buildReminderResolver, subjectKeyOf, type ReminderItem } from '../services/timetableReminders.js'
import {
  applyOverrides,
  applyOverridesToGrid,
  type OverrideInput,
} from '../services/timetableOverrides.js'

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

    // Connect-owned this-week overrides for today, keyed by the child's Connect
    // class id (one findMany across the parent's classes). Applied on top of the
    // Hub-resolved items below: CANCELLED subjects drop, ADDED subjects append.
    const connectClassIds = [...new Set(entries.map((e) => e.classId))]
    const overrideRows = connectClassIds.length
      ? await prisma.timetableOverride.findMany({
          where: {
            schoolId: req.user!.schoolId,
            classId: { in: connectClassIds },
            date: {
              gte: new Date(`${date}T00:00:00.000Z`),
              lt: new Date(`${date}T23:59:59.999Z`),
            },
          },
          select: { classId: true, subjectKey: true, subject: true, emoji: true, action: true },
        })
      : []
    const overridesByClass = new Map<string, OverrideInput[]>()
    for (const o of overrideRows) {
      const arr = overridesByClass.get(o.classId)
      if (arr) arr.push(o)
      else overridesByClass.set(o.classId, [o])
    }

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
      const baseItems = hubClassId ? itemsByHubClass.get(hubClassId) ?? [] : []
      return {
        studentId: e.studentId,
        name: e.name,
        className: e.className,
        items: applyOverrides(baseItems, overridesByClass.get(e.classId) ?? [], resolver),
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

/** A reminder-worthy subject on a given weekday. `cancelled`/`added` reflect a
 * Connect this-week override (a cancelled Hub subject is still listed, flagged;
 * an added one is appended, flagged) so the read-only grid can render both. */
interface GridSubject {
  subject: string
  emoji: string
  specialist: boolean
  /** Cancelled this week by a Connect override (shown struck through). */
  cancelled?: boolean
  /** Added this week by a Connect override (not from Hub). */
  added?: boolean
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

    // Base Hub allocation per (Connect classId | weekday). Filled from Hub, then
    // the Connect override layer is applied on top in the post-pass below.
    const baseByClassWeekday = new Map<string, GridSubject[]>()
    if (hubReady) {
      // Fetch every (class, weekday) once; the cache coalesces repeats.
      await Promise.all(
        classes.map(async (c) => {
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
                if (subjects.length) baseByClassWeekday.set(`${c.id}|${weekday}`, subjects)
              } catch {
                // A per-class/day Hub failure shouldn't sink the grid.
              }
            }),
          )
        }),
      )
    }

    // This-week overrides for the whole school within the Mon–Fri window, keyed
    // by `${classId}|${YYYY-MM-DD}`. Applied even when Hub is unavailable so an
    // ADDED override still surfaces.
    const overrideRows = await prisma.timetableOverride.findMany({
      where: {
        schoolId,
        date: {
          gte: new Date(`${dates[0].date}T00:00:00.000Z`),
          lt: new Date(`${dates[dates.length - 1].date}T23:59:59.999Z`),
        },
      },
      select: { classId: true, date: true, subjectKey: true, subject: true, emoji: true, action: true },
    })
    const overridesByClassDate = new Map<string, OverrideInput[]>()
    for (const o of overrideRows) {
      const key = `${o.classId}|${o.date.toISOString().slice(0, 10)}`
      const arr = overridesByClassDate.get(key)
      if (arr) arr.push(o)
      else overridesByClassDate.set(key, [o])
    }

    // Apply overrides for every (class, weekday); set allocations when non-empty.
    for (const [idx, c] of classes.entries()) {
      for (const { weekday, date } of dates) {
        const base = baseByClassWeekday.get(`${c.id}|${weekday}`) ?? []
        const ov = overridesByClassDate.get(`${c.id}|${date}`) ?? []
        if (base.length === 0 && ov.length === 0) continue
        const subjects = applyOverridesToGrid(base, ov, resolver)
        if (subjects.length) gridClasses[idx].allocations[weekday] = subjects
      }
    }

    const result: TimetableGrid = { weekOf: monday, hubAvailable, classes: gridClasses }
    res.json(result)
  } catch (error) {
    console.error('Error building timetable/grid:', error)
    res.status(500).json({ error: 'Failed to load timetable grid' })
  }
})

// ---------------------------------------------------------------------------
// This-week override CRUD (admin, school-scoped)
//
//   GET    /api/timetable/overrides?from=YYYY-MM-DD&to=YYYY-MM-DD
//   POST   /api/timetable/overrides   { classId, date, subject, action, emoji?, note? }
//   DELETE /api/timetable/overrides/:id
//
// The UI composes the primitives (cancel = one CANCELLED row; move = a CANCELLED
// on the source date + an ADDED on the target date; ad-hoc = one ADDED row); the
// server just stores/returns what it's given. All rows are tenant-scoped by
// schoolId and the classId is verified to belong to the school.
// ---------------------------------------------------------------------------

/** The override row shape returned to the admin UI. */
export interface TimetableOverrideDto {
  id: string
  classId: string
  date: string // YYYY-MM-DD
  subject: string
  subjectKey: string
  emoji: string | null
  action: string // 'CANCELLED' | 'ADDED'
  note: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

const OVERRIDE_SELECT = {
  id: true,
  classId: true,
  date: true,
  subject: true,
  subjectKey: true,
  emoji: true,
  action: true,
  note: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const

const VALID_ACTIONS = new Set(['CANCELLED', 'ADDED'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Serialise a DB row's DateTime `date` down to a YYYY-MM-DD calendar day. */
function serialiseOverride(row: {
  id: string
  classId: string
  date: Date
  subject: string
  subjectKey: string
  emoji: string | null
  action: string
  note: string | null
  createdByUserId: string | null
  createdAt: Date
  updatedAt: Date
}): TimetableOverrideDto {
  return {
    id: row.id,
    classId: row.classId,
    date: row.date.toISOString().slice(0, 10),
    subject: row.subject,
    subjectKey: row.subjectKey,
    emoji: row.emoji,
    action: row.action,
    note: row.note,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// List overrides in a [from, to] window (inclusive of both days) for the school.
router.get('/overrides', isAdmin, async (req, res) => {
  try {
    const from = String(req.query.from ?? '')
    const to = String(req.query.to ?? '')
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' })
    }
    const rows = await prisma.timetableOverride.findMany({
      where: {
        schoolId: req.user!.schoolId,
        date: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lt: new Date(`${to}T23:59:59.999Z`),
        },
      },
      select: OVERRIDE_SELECT,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    })
    res.json(rows.map(serialiseOverride))
  } catch (error) {
    console.error('Error listing timetable overrides:', error)
    res.status(500).json({ error: 'Failed to load overrides' })
  }
})

// Create one override row. The UI creates two (a CANCELLED + an ADDED) for a move.
router.post('/overrides', isAdmin, async (req, res) => {
  try {
    const { classId, date, subject, action, emoji, note } = req.body ?? {}
    if (typeof classId !== 'string' || !classId) {
      return res.status(400).json({ error: 'classId is required' })
    }
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }
    if (typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ error: 'subject is required' })
    }
    if (typeof action !== 'string' || !VALID_ACTIONS.has(action)) {
      return res.status(400).json({ error: "action must be 'CANCELLED' or 'ADDED'" })
    }
    if (emoji !== undefined && emoji !== null && typeof emoji !== 'string') {
      return res.status(400).json({ error: 'emoji must be a string' })
    }
    if (note !== undefined && note !== null && typeof note !== 'string') {
      return res.status(400).json({ error: 'note must be a string' })
    }

    // Tenant check: the class must belong to the admin's school.
    const owned = await prisma.class.findFirst({
      where: { id: classId, schoolId: req.user!.schoolId },
      select: { id: true },
    })
    if (!owned) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const row = await prisma.timetableOverride.create({
      data: {
        schoolId: req.user!.schoolId,
        classId,
        date: new Date(`${date}T00:00:00.000Z`),
        subject: subject.trim(),
        subjectKey: subjectKeyOf(subject),
        emoji: emoji ? String(emoji).trim() || null : null,
        action,
        note: note ? String(note).trim() || null : null,
        createdByUserId: req.user!.id,
      },
      select: OVERRIDE_SELECT,
    })
    res.status(201).json(serialiseOverride(row))
  } catch (error) {
    console.error('Error creating timetable override:', error)
    res.status(500).json({ error: 'Failed to create override' })
  }
})

// Delete one override row. Tenant-scoped: 404 unless it belongs to the school.
router.delete('/overrides/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await prisma.timetableOverride.deleteMany({
      where: { id, schoolId: req.user!.schoolId },
    })
    if (result.count === 0) {
      return res.status(404).json({ error: 'Override not found' })
    }
    res.json({ message: 'Override deleted successfully' })
  } catch (error) {
    console.error('Error deleting timetable override:', error)
    res.status(500).json({ error: 'Failed to delete override' })
  }
})

export default router
