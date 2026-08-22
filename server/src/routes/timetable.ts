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
import { getClassDayCached, getCalendarStructureCached } from '../services/timetableCache.js'
import type { HubCalendarStructure } from '../services/hubMis.js'
import type { HubTimetableBlock } from '../services/hubMis.js'
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
// GET /api/timetable/child/:studentId/week?weekOf=YYYY-MM-DD   (parent)
//
// The parent-app weekly child timetable: Mon–Fri of the requested week for one
// of the requester's own children, sourced live (read-only) from Hub's per-class
// effective day. Reuses the same per-class-per-day cache as /today so siblings'
// parents share one Hub call. Degrades gracefully — a day Hub can't answer comes
// back with `blocks: []`; when Hub answers for no day, `hubAvailable:false` with
// empty `days` (never a 500 on the dormant case).
//
// v1 shows the raw Hub effective blocks (the effective-day already folds A/B
// weeks by date); the Connect this-week override layer is not composed here.
// ---------------------------------------------------------------------------

/** One timetable block as the parent app renders it. */
interface ChildTimetableBlock {
  id: string
  start: string
  end: string
  label: string
  subject: { name: string; color: string | null } | null
  teacher: { firstName: string; lastName: string } | null
  room: string | null
  specialist: boolean
  blockType: string
}
interface ChildTimetableDay {
  weekday: number // 1=Mon … 5=Fri
  date: string // YYYY-MM-DD
  blocks: ChildTimetableBlock[]
}
export interface ChildTimetableWeek {
  studentId: string
  studentName: string
  className: string
  weekOf: string // Monday, YYYY-MM-DD
  hubAvailable: boolean
  days: ChildTimetableDay[]
  // Term awareness: Hub's timetable pattern repeats every week regardless of
  // term, so a holiday/half-term week would otherwise render a full timetable.
  // `outOfTerm` is true when the viewed Mon–Fri falls entirely outside every
  // teaching period; `resumeDate` (YYYY-MM-DD) is when lessons next start. Both
  // are best-effort — if the calendar structure can't be read they stay
  // false/null and the view behaves exactly as before (no banner).
  outOfTerm: boolean
  resumeDate: string | null
}

/** Out-of-term detection for one viewed week (weekMon..weekFri, YYYY-MM-DD).
 * Teaching periods are the half-terms where a term has them (so half-term breaks
 * also read as out of term), else the whole term. Date-string compare is safe
 * for fixed-width YYYY-MM-DD. */
export function computeTermStatus(
  structure: HubCalendarStructure,
  weekMon: string,
  weekFri: string,
): { outOfTerm: boolean; resumeDate: string | null } {
  const periods = structure.terms.flatMap((t) =>
    t.half_terms?.length
      ? t.half_terms.map((h) => ({ starts_on: h.starts_on, ends_on: h.ends_on }))
      : [{ starts_on: t.starts_on, ends_on: t.ends_on }],
  )
  if (periods.length === 0) return { outOfTerm: false, resumeDate: null }

  const inTerm = periods.some((p) => p.starts_on <= weekFri && p.ends_on >= weekMon)
  if (inTerm) return { outOfTerm: false, resumeDate: null }

  const resumeDate =
    periods
      .filter((p) => p.starts_on > weekFri)
      .map((p) => p.starts_on)
      .sort((a, b) => a.localeCompare(b))[0] ?? null
  return { outOfTerm: true, resumeDate }
}

/** Hub sends room as an object ({ id, name, kind }); older builds documented a
 * bare string. Collapse either to a plain name so the parent app never receives
 * an object where it renders a string (React #31 → blank timetable). */
function roomName(room: HubTimetableBlock['room']): string | null {
  if (!room) return null
  if (typeof room === 'string') return room
  return room.name ?? null
}

/** Map a raw Hub block down to the parent-facing shape. */
function toChildBlock(b: HubTimetableBlock): ChildTimetableBlock {
  return {
    id: b.id,
    start: b.start,
    end: b.end,
    label: b.label,
    subject: b.subject ? { name: b.subject.name, color: b.subject.color } : null,
    teacher: b.teacher ? { firstName: b.teacher.firstName, lastName: b.teacher.lastName } : null,
    room: roomName(b.room),
    specialist: b.specialist,
    blockType: b.block_type,
  }
}

router.get('/child/:studentId/week', isAuthenticated, async (req, res) => {
  try {
    const { studentId } = req.params
    const user = (await loadUserWithRelations(req.user!.id))!

    // Resolve the requester's own children (studentLinks + legacy children),
    // mirroring /today's resolution — this is the child-ownership check.
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

    const child = entries.find((e) => e.studentId === studentId)
    if (!child) {
      // Not one of the requester's children — don't reveal whether it exists.
      return res.status(404).json({ error: 'Child not found' })
    }

    const [school, klass] = await Promise.all([
      prisma.school.findUnique({
        where: { id: req.user!.schoolId },
        select: { hubSchoolId: true, timezone: true },
      }),
      prisma.class.findUnique({
        where: { id: child.classId },
        select: { hubClassId: true },
      }),
    ])

    const tz = school?.timezone ?? 'UTC'
    const rawWeekOf = req.query.weekOf
    const weekOf =
      typeof rawWeekOf === 'string' && DATE_RE.test(rawWeekOf) ? rawWeekOf : todayInTimezone(tz)
    const { monday, dates } = weekdayDates(weekOf)

    const hubClassId = klass?.hubClassId ?? null
    const hubReady = !!process.env.HUB_SERVICE_TOKEN && !!school?.hubSchoolId && !!hubClassId

    // Fetch each weekday's effective day (cache-coalesced). A day Hub can't
    // answer (null / thrown) becomes an empty-block day; if no day answers at
    // all, hubAvailable stays false and we return empty days.
    let hubAvailable = false
    const days: ChildTimetableDay[] = await Promise.all(
      dates.map(async ({ weekday, date }): Promise<ChildTimetableDay> => {
        if (!hubReady) return { weekday, date, blocks: [] }
        try {
          const day = await getClassDayCached(school!.hubSchoolId!, hubClassId!, date)
          if (!day) return { weekday, date, blocks: [] }
          hubAvailable = true
          return { weekday, date, blocks: day.blocks.map(toChildBlock) }
        } catch {
          return { weekday, date, blocks: [] }
        }
      }),
    )

    // Term awareness (best-effort): flag a viewed week that falls outside every
    // teaching period. Any failure — no Hub token, no hubSchoolId, a Hub blip —
    // falls back to the prior behaviour (no banner), never breaking the grid.
    let outOfTerm = false
    let resumeDate: string | null = null
    if (process.env.HUB_SERVICE_TOKEN && school?.hubSchoolId) {
      try {
        const structure = await getCalendarStructureCached(school.hubSchoolId)
        const weekFri = dates.length ? dates[dates.length - 1].date : monday
        const status = computeTermStatus(structure, monday, weekFri)
        outOfTerm = status.outOfTerm
        resumeDate = status.resumeDate
      } catch (err) {
        console.error('Timetable term-status lookup failed (falling back to no banner):', err)
      }
    }

    const result: ChildTimetableWeek = {
      studentId: child.studentId,
      studentName: child.name,
      className: child.className,
      weekOf: monday,
      hubAvailable,
      days: hubAvailable ? days : [],
      outOfTerm,
      resumeDate,
    }
    res.json(result)
  } catch (error) {
    console.error('Error building timetable/child week:', error)
    res.status(500).json({ error: 'Failed to load timetable' })
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
