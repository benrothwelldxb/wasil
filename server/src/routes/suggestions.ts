// The suggestion box.
//
// A parent tells the school something they would not put in a message to a
// teacher: an idea, a frustration, something small that nobody has mentioned.
// Off by default per school (`School.suggestionsEnabled`), because it is a
// commitment to read and answer things rather than a feature to find switched
// on.
//
// ANONYMITY IS THE DESIGN, and everything below follows from being exact about
// what is and is not promised. See the Suggestion model for the full statement;
// in short: an anonymous suggestion carries no authorId and nothing derived
// from the author, its timestamp is rounded to the hour so it cannot be matched
// against who was in the app at 14:32, and the rate limit lives in a separate
// table with no way to join back.
//
// The honest boundary: somebody with raw database access could learn THAT a
// parent submitted something on a given day. They could not learn WHICH. No
// screen we build reveals more than that, and the parent-facing wording — "we
// will not know who sent it" — is true of everyone using the app.
import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { todayInTimezone } from '../services/dateTime.js'
import { logAudit } from '../services/audit.js'

const router = Router()

/** A parent may send this many in a day. High enough that nobody with something
 *  to say is stopped, low enough that one person cannot bury the list. */
const DAILY_LIMIT = 5

/** Long enough for a real idea, short enough that the box is not a complaints
 *  procedure by another name. */
const MAX_BODY = 2000

const CATEGORIES = ['Facilities', 'Communication', 'Learning', 'Food', 'Events', 'Other'] as const

/** Round to the hour. A to-the-second timestamp is itself an identifier once
 *  you hold the rest of the app's logs — "who opened the app at 14:32" is a
 *  short list, and in a small school it is often one family. */
function roundedToHour(d: Date): Date {
  const out = new Date(d)
  out.setUTCMinutes(0, 0, 0)
  return out
}

/**
 * Is the box open here?
 *
 *   GET /api/suggestions/enabled → { enabled }
 *
 * Its own endpoint because the parent app needs it before deciding whether to
 * show the menu item at all, and a 404 from the submit route is a worse way to
 * find out.
 */
router.get('/enabled', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { suggestionsEnabled: true },
    })
    res.json({ enabled: !!school?.suggestionsEnabled })
  } catch {
    // The menu must render. Absent is the safe answer.
    res.json({ enabled: false })
  }
})

/**
 * Send one.
 *
 *   POST /api/suggestions  { body, category?, anonymous }
 *
 * `anonymous` is required rather than defaulted, deliberately. A default is a
 * decision made for somebody about whether they can be identified, and it would
 * be made silently, by whoever wrote this line.
 */
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'The suggestion box is for parents and carers.' })
    }

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { suggestionsEnabled: true, timezone: true },
    })
    if (!school?.suggestionsEnabled) {
      return res.status(404).json({ error: 'Not found' })
    }

    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : ''
    const anonymous = req.body?.anonymous

    if (!body) return res.status(400).json({ error: 'Write your suggestion first.' })
    if (body.length > MAX_BODY) {
      return res.status(400).json({ error: `Please keep it under ${MAX_BODY} characters.` })
    }
    if (typeof anonymous !== 'boolean') {
      return res.status(400).json({ error: 'Choose whether to send this with your name or anonymously.' })
    }
    if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return res.status(400).json({ error: 'Unknown category' })
    }

    // THE RATE LIMIT LIVES APART FROM THE SUGGESTION. Counting per parent per
    // day is the smallest thing that resolves "you cannot cap what you cannot
    // count" against "you cannot count what you cannot attribute" — it holds
    // no reference to any suggestion and no time more precise than the date,
    // so it can say how many somebody sent and never which.
    const dayLocal = todayInTimezone(school.timezone || 'UTC')
    const quota = await prisma.suggestionQuota.upsert({
      where: { userId_dayLocal: { userId: user.id, dayLocal } },
      create: { userId: user.id, schoolId: user.schoolId, dayLocal, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    })
    if (quota.count > DAILY_LIMIT) {
      return res.status(429).json({
        error: `You have sent ${DAILY_LIMIT} suggestions today. Please come back tomorrow.`,
      })
    }

    const now = new Date()
    const created = await prisma.suggestion.create({
      data: {
        schoolId: user.schoolId,
        body,
        category: category || null,
        // The whole promise, in one ternary.
        authorId: anonymous ? null : user.id,
        createdAt: anonymous ? roundedToHour(now) : now,
      },
      select: { id: true },
    })

    // NOT AUDITED. An audit row would carry the actor, the time and the
    // resource id — which is a join back to an anonymous suggestion, written
    // by the very system that promised there was none.
    res.status(201).json({ id: created.id, anonymous })
  } catch (error) {
    console.error('Error saving suggestion:', error)
    res.status(500).json({ error: 'Failed to send your suggestion' })
  }
})

/**
 * Read them.
 *
 *   GET /api/suggestions?status=NEW
 *
 * ADMIN ONLY. A suggestion may name a member of staff despite the notice
 * asking that it does not, and a smaller readership is the only version of
 * this we can describe honestly to a parent.
 */
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const status = typeof req.query.status === 'string' ? req.query.status : ''

    const suggestions = await prisma.suggestion.findMany({
      where: {
        schoolId: user.schoolId,
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        body: true,
        category: true,
        status: true,
        adminNote: true,
        createdAt: true,
        handledAt: true,
        author: { select: { id: true, name: true } },
        handledBy: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })

    res.json(
      suggestions.map(s => ({
        id: s.id,
        body: s.body,
        category: s.category,
        status: s.status,
        adminNote: s.adminNote,
        createdAt: s.createdAt.toISOString(),
        handledAt: s.handledAt ? s.handledAt.toISOString() : null,
        handledByName: s.handledBy?.name ?? null,
        // Null author IS the anonymity. There is no id here to look up, and
        // no field the app could use to ask for one.
        fromName: s.author?.name ?? null,
        canReply: !!s.author,
      })),
    )
  } catch (error) {
    console.error('Error listing suggestions:', error)
    res.status(500).json({ error: 'Failed to load suggestions' })
  }
})

/**
 * Move one along.
 *
 *   PATCH /api/suggestions/:id  { status?, adminNote? }
 *
 * The note is the school's own and is never shown to the parent, named or not.
 */
router.patch('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const status = typeof req.body?.status === 'string' ? req.body.status : undefined
    const adminNote = typeof req.body?.adminNote === 'string' ? req.body.adminNote.trim() : undefined

    if (status && !['NEW', 'READ', 'ACTIONED', 'DECLINED'].includes(status)) {
      return res.status(400).json({ error: 'Unknown status' })
    }

    const existing = await prisma.suggestion.findFirst({
      where: { id, schoolId: user.schoolId },
      select: { id: true },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const updated = await prisma.suggestion.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(adminNote !== undefined ? { adminNote: adminNote || null } : {}),
        // Stamped on any move out of NEW, so "who has looked at this" is
        // answerable without a separate audit trail — and without recording
        // anything about the SENDER.
        ...(status && status !== 'NEW' ? { handledById: user.id, handledAt: new Date() } : {}),
      },
      select: { id: true, status: true },
    })

    await logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'SCHOOL',
      resourceId: id,
      // Deliberately records what the SCHOOL did and nothing about who sent
      // it. There is no author to name for an anonymous one, and naming the
      // author of a signed one here would make the two look different in the
      // log, which is itself a signal.
      metadata: { event: 'SUGGESTION_UPDATED', status: updated.status },
    })

    res.json({ id: updated.id, status: updated.status })
  } catch (error) {
    console.error('Error updating suggestion:', error)
    res.status(500).json({ error: 'Failed to update the suggestion' })
  }
})

export default router
