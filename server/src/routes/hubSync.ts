// Admin-triggered Wasil Hub MIS sync.
//
//   POST /api/admin/hub-sync   (isAdmin)
//
// Pulls the Hub roster for the caller's school and upserts it (year-groups →
// classes → pupils → staff), returning a summary of what changed. This is the
// button behind the "stale data" banner (see INTEGRATION.md → Data freshness):
// Hub never syncs on our behalf, the admin pulls when they choose. No cron in
// this slice.
import { Router, Request, Response } from 'express'
import { isAdmin } from '../middleware/auth.js'
import { syncSchoolFromHub, SchoolNotLinkedError } from '../services/hubSync.js'
import { HubServiceTokenMissingError, HubMisError } from '../services/hubMis.js'

const router = Router()

router.post('/hub-sync', isAdmin, async (req: Request, res: Response) => {
  const schoolId = req.user!.schoolId
  try {
    const summary = await syncSchoolFromHub(schoolId)
    return res.json({ summary })
  } catch (err) {
    if (err instanceof SchoolNotLinkedError) {
      return res.status(400).json({ error: 'school_not_linked' })
    }
    if (err instanceof HubServiceTokenMissingError) {
      return res.status(503).json({ error: 'service_token_not_configured' })
    }
    if (err instanceof HubMisError) {
      // Upstream Hub error — surface as a bad gateway, not a Connect 500.
      return res.status(502).json({ error: 'hub_unavailable', status: err.status })
    }
    throw err
  }
})

export default router
