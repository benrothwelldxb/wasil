// Partner API — a deliberately narrow surface for external Wasil apps (Desk).
//
//   GET /api/partner/inbox/summary?hub_user_id=<Hub user id> → { unread }
//
// Auth is a Bearer partner token (see middleware/partnerAuth). Everything here is
// COUNT-ONLY: never message content, sender names, or thread metadata — that
// keeps partners outside the parent-data boundary by design.
import { Router } from 'express'
import prisma from '../services/prisma.js'
import { requirePartner } from '../middleware/partnerAuth.js'

const router = Router()

// Unread inbox summary for one staff member, addressed by their Hub user id
// (Connect maps it via the Hub SSO identity link, `User.hubUserId`).
//
// `unread` = the number of that staff member's conversation THREADS that hold at
// least one unread inbound message (a non-deleted message from the parent that
// the staff member hasn't read), excluding threads they've archived — the same
// notion of "unread" the staff inbox itself uses. Unknown user → { unread: 0 }.
router.get('/inbox/summary', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    if (!hubUserId) {
      return res.status(400).json({ error: 'hub_user_id required' })
    }

    const staff = await prisma.user.findUnique({
      where: { hubUserId },
      select: { id: true },
    })
    // Unknown user is not an error — Desk polls many ids, some unmapped.
    if (!staff) return res.json({ unread: 0 })

    const unread = await prisma.conversation.count({
      where: {
        staffId: staff.id,
        archivedByStaff: false,
        messages: {
          some: { senderId: { not: staff.id }, readAt: null, deletedAt: null },
        },
      },
    })

    // Cheap + cacheable — Desk polls at most once a minute per active user.
    res.set('Cache-Control', 'private, max-age=30')
    res.json({ unread })
  } catch (error) {
    console.error('Error building partner inbox summary:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
