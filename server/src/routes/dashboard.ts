// The parent dashboard's own surface. Today it carries one thing: the features
// a school has chosen to promote (see services/dashboardFeatures.ts). It's a
// route of its own rather than a corner of school-services because the slot is
// meant to take other kinds — activities, events, forms — without moving.
import { Router } from 'express'
import { isAuthenticated } from '../middleware/auth.js'
import { featuresForParent } from '../services/dashboardFeatures.js'

const router = Router()

//   GET /api/dashboard/features → { features: [...] }
//
// Parent-scoped: filtered to what this parent's children are eligible for, and
// to promos that haven't expired. Always 200 — an empty list is the normal
// state, and the dashboard must render whatever happens here.
router.get('/features', isAuthenticated, async (req, res) => {
  const user = req.user!
  const features = await featuresForParent(user.id, user.schoolId)
  res.set('Cache-Control', 'private, max-age=60')
  res.json({ features })
})

export default router
