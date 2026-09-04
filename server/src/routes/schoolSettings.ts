import { Router, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit, computeChanges } from '../services/audit.js'

const router = Router()

const MODULE_FLAG_FIELDS = [
  'inboxEnabled',
  'postsEnabled',
  'emergencyAlertsEnabled',
  'formsEnabled',
  'eventsEnabled',
  'weeklyUpdatesEnabled',
  'pulseEnabled',
  'attendanceEnabled',
  'ecaEnabled',
  'consultationsEnabled',
  'schoolServicesEnabled',
  'lunchMenuEnabled',
  'termDatesEnabled',
  'scheduleEnabled',
  'policiesEnabled',
  'filesEnabled',
  'linksEnabled',
  'knowledgeBaseEnabled',
] as const

type ModuleFlagField = (typeof MODULE_FLAG_FIELDS)[number]

const SETTINGS_SELECT = {
  id: true,
  name: true,
  timezone: true,
  inboxEnabled: true,
  postsEnabled: true,
  emergencyAlertsEnabled: true,
  formsEnabled: true,
  eventsEnabled: true,
  weeklyUpdatesEnabled: true,
  pulseEnabled: true,
  attendanceEnabled: true,
  ecaEnabled: true,
  consultationsEnabled: true,
  schoolServicesEnabled: true,
  lunchMenuEnabled: true,
  termDatesEnabled: true,
  scheduleEnabled: true,
  policiesEnabled: true,
  filesEnabled: true,
  linksEnabled: true,
  knowledgeBaseEnabled: true,
  attendanceDigestEnabled: true,
  attendanceDigestTime: true,
  attendanceFigureVisibleToParents: true,
  contactConfirmDays: true,
  bottomNavItems: true,
} as const

// Valid parent bottom-nav catalog keys — mirrors the shared
// PARENT_BOTTOM_NAV_CATALOG (kept inline so the server stays free of a frontend
// dependency). At most three may be chosen (the bar has three middle slots).
const BOTTOM_NAV_KEYS = [
  'events', 'termDates', 'principalUpdates', 'attendance', 'timetable',
  'activities', 'consultations', 'schoolServices', 'lunchMenu', 'clubs',
  'messages', 'resources',
] as const
const MAX_BOTTOM_NAV_ITEMS = 3

// GET /api/school-settings — any authenticated user can read settings for their school
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: SETTINGS_SELECT,
    })
    if (!school) return res.status(404).json({ error: 'School not found' })
    res.json(school)
  } catch (error) {
    console.error('Error fetching school settings:', error)
    res.status(500).json({ error: 'Failed to fetch school settings' })
  }
})

// PATCH /api/school-settings — admin only, updates module toggles + digest config + timezone
router.patch('/', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const body = req.body as Record<string, unknown>
    const data: Record<string, unknown> = {}

    for (const field of MODULE_FLAG_FIELDS) {
      if (typeof body[field] === 'boolean') {
        data[field] = body[field]
      }
    }

    if (typeof body.timezone === 'string' && body.timezone.length > 0) {
      data.timezone = body.timezone
    }
    if (typeof body.attendanceDigestEnabled === 'boolean') {
      data.attendanceDigestEnabled = body.attendanceDigestEnabled
    }
    if (typeof body.attendanceFigureVisibleToParents === 'boolean') {
      data.attendanceFigureVisibleToParents = body.attendanceFigureVisibleToParents
    }
    if (typeof body.attendanceDigestTime === 'string') {
      const time = body.attendanceDigestTime.trim()
      if (time === '') {
        data.attendanceDigestTime = null
      } else if (/^\d{2}:\d{2}$/.test(time)) {
        data.attendanceDigestTime = time
      } else {
        return res.status(400).json({ error: 'attendanceDigestTime must be HH:MM' })
      }
    } else if (body.attendanceDigestTime === null) {
      data.attendanceDigestTime = null
    }
    if (typeof body.contactConfirmDays === 'number' && Number.isInteger(body.contactConfirmDays) && body.contactConfirmDays >= 0 && body.contactConfirmDays <= 3650) {
      data.contactConfirmDays = body.contactConfirmDays
    }
    if (body.bottomNavItems !== undefined) {
      // null resets to the app default; otherwise it's an ordered array of ≤3
      // distinct known catalog keys. Anything else is a 400 (never store junk
      // that the parent bar would silently drop).
      if (body.bottomNavItems === null) {
        // Prisma will not take a bare `null` for a nullable Json column — it
        // needs DbNull to mean "SQL NULL" rather than "the JSON value null".
        // Passing null threw a validation error at runtime, and `data` being
        // Record<string, unknown> meant the compiler never saw it. Since the
        // settings page PATCHes the whole object, every school that had not yet
        // customised its bar sent null here and got a 500 for the entire save.
        data.bottomNavItems = Prisma.DbNull
      } else if (Array.isArray(body.bottomNavItems)) {
        const items = body.bottomNavItems
        const allValid = items.every((k) => typeof k === 'string' && (BOTTOM_NAV_KEYS as readonly string[]).includes(k))
        const distinct = new Set(items).size === items.length
        if (!allValid || !distinct || items.length > MAX_BOTTOM_NAV_ITEMS) {
          return res.status(400).json({ error: `bottomNavItems must be up to ${MAX_BOTTOM_NAV_ITEMS} distinct known keys` })
        }
        data.bottomNavItems = items
      } else {
        return res.status(400).json({ error: 'bottomNavItems must be an array or null' })
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    // Snapshot before, write, then audit the diff. Module toggles and digest
    // config are sensitive (turning off attendance hides registers from
    // teachers, attendanceDigestEnabled controls daily PII emails to admins)
    // so a clean trail of who flipped what and when is non-negotiable.
    const before = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: SETTINGS_SELECT,
    })

    const school = await prisma.school.update({
      where: { id: user.schoolId },
      data,
      select: SETTINGS_SELECT,
    })

    if (before) {
      const changes = computeChanges(
        before as unknown as Record<string, unknown>,
        school as unknown as Record<string, unknown>,
      )
      if (changes) {
        await logAudit({
          req,
          action: 'UPDATE',
          resourceType: 'SCHOOL',
          resourceId: user.schoolId,
          changes,
          metadata: { source: 'school-settings' },
        })
      }
    }

    res.json(school)
  } catch (error) {
    console.error('Error updating school settings:', error)
    res.status(500).json({ error: 'Failed to update school settings' })
  }
})

export default router
export { MODULE_FLAG_FIELDS, type ModuleFlagField }
