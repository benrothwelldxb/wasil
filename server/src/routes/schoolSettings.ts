import { Router, Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

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
} as const

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

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    const school = await prisma.school.update({
      where: { id: user.schoolId },
      data,
      select: SETTINGS_SELECT,
    })

    res.json(school)
  } catch (error) {
    console.error('Error updating school settings:', error)
    res.status(500).json({ error: 'Failed to update school settings' })
  }
})

export default router
export { MODULE_FLAG_FIELDS, type ModuleFlagField }
