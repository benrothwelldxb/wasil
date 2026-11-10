import { Router } from 'express'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { translateTexts } from '../services/translation.js'
import { unseenReleases, isKnownRelease, type ParentRelease } from '../services/parentReleases.js'

// "What's new" for parents: the box the parent app shows on opening when a
// feature has launched since they last looked. Entries are in code
// (services/parentReleases.ts); this route decides which ones this parent
// should see, in their language, and records when they close it.

const router = Router()

/**
 * GET /api/whats-new → ParentRelease[] (usually empty)
 *
 * Empty while the school has an emergency alert running: nothing about a new
 * button should sit on top of a lockdown. The box simply comes the next time
 * the app is opened.
 */
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT' && user.role !== 'STAFF') return res.json([])

    const now = new Date()
    const [account, school, seen, alert] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true, preferredLanguage: true } }),
      prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { postsEnabled: true, inboxEnabled: true, formsEnabled: true, eventsEnabled: true },
      }),
      prisma.parentReleaseSeen.findMany({ where: { userId: user.id }, select: { releaseId: true } }),
      prisma.emergencyAlert.findFirst({ where: { schoolId: user.schoolId, status: 'ACTIVE' }, select: { id: true } }),
    ])
    if (!account || !school || alert) return res.json([])

    const releases = unseenReleases(
      { joinedAt: account.createdAt, school },
      seen.map(s => s.releaseId),
      now,
    )
    res.json(await translated(releases, account.preferredLanguage || 'en'))
  } catch (error) {
    // Never worth an error screen: a parent who misses the box misses nothing
    // they need.
    console.error("Error fetching what's new:", error)
    res.json([])
  }
})

const seenSchema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(20) })

/**
 * POST /api/whats-new/seen { ids } → { recorded }
 *
 * Idempotent: closing the box twice, or on two devices, is the same parent
 * saying the same thing. Ids not in the code are ignored rather than stored.
 */
router.post('/seen', isAuthenticated, validate(seenSchema), async (req, res) => {
  try {
    const user = req.user!
    const ids = [...new Set((req.body.ids as string[]).filter(isKnownRelease))]
    if (ids.length > 0) {
      await prisma.parentReleaseSeen.createMany({
        data: ids.map(releaseId => ({ userId: user.id, releaseId })),
        skipDuplicates: true,
      })
    }
    res.json({ recorded: ids.length })
  } catch (error) {
    console.error("Error recording what's new as seen:", error)
    res.status(500).json({ error: 'Failed to record' })
  }
})

/** Title, blurb and link label in the parent's language. English as written
 *  when translation is unavailable: the box is still worth showing. */
async function translated(releases: ParentRelease[], lang: string): Promise<ParentRelease[]> {
  if (lang === 'en' || releases.length === 0) return releases
  const texts = releases.flatMap(r => [r.title, r.blurb, ...(r.cta ? [r.cta] : [])])
  try {
    const out = await translateTexts(texts, lang)
    let i = 0
    return releases.map(r => ({
      ...r,
      title: out[i++] || r.title,
      blurb: out[i++] || r.blurb,
      ...(r.cta ? { cta: out[i++] || r.cta } : {}),
    }))
  } catch {
    return releases
  }
}

export default router
