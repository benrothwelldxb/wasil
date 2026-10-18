// The Inclusion page — a child's SEND plan, documents and therapy sessions,
// read from Wasil Inclusion.
//
// Connect stores NOTHING. Every load asks Inclusion, and that is the design
// rather than an optimisation left undone: a cached plan is a plan still being
// shown to a family after a SENCO has withdrawn it.
//
// THE PUBLICATION RULE IS NOT HERE AND MUST NOT BE. Connect once held a copy —
// a push lane with its own parentVisible column, and a bug where a caller who
// never mentioned the flag published a child's plan by omission. That lane was
// decommissioned the same day this pull was agreed. The rule now lives in one
// place, Inclusion's familyVisibleIeps(), and two copies of a rule about what
// a family may read is how they drift apart.
//
// THE GUARDIAN CHECK LIVES HERE AS WELL AS THERE. Inclusion has its own scope
// choke point and I am not doubting it; a family's children are the thing
// where one guard is not enough, and Connect is the app that actually owns the
// household. So a pupil the caller is not linked to never reaches Inclusion.
import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'
import { requireModule } from '../middleware/moduleFlag.js'
import {
  fetchChildren,
  fetchPlan,
  fetchDocuments,
  inclusionConfigured,
  fileUrl,
  InclusionError,
  InclusionNotConfiguredError,
} from '../services/sendInclusion.js'

const router = Router()

/**
 * THE STATES, and why there are five rather than "data or an error".
 *
 * Four of these would otherwise render as "your child has no plan", which is a
 * confident written statement to a family about their child's support, and
 * wrong in every one of them. Only `ok` with a null plan means it.
 *
 *   ok           Inclusion answered. plan may be null — that genuinely means
 *                no plan is currently shared, and the card is hidden.
 *   no_hub_link  This parent or this pupil has no Hub id, so there is nothing
 *                to ask about. Not an error and not an absence of provision.
 *   not_known    Inclusion does not hold this guardian or pupil. Usually a
 *                family Inclusion has never mirrored.
 *   unavailable  Unconfigured, or Inclusion refused us. A missing credential
 *                must never look like a child with no support plan.
 */
type State = 'ok' | 'no_hub_link' | 'not_known' | 'unavailable'

/** Inclusion's 404 is deliberately identical for "unknown guardian", "unknown
 *  pupil" and "not your child", so the API cannot be used to probe which
 *  children belong to whom. Connect must therefore never read a 404 as "no
 *  plan" — it is "I cannot tell you", which is a different sentence. */
const isNotFound = (e: unknown) => e instanceof InclusionError && e.status === 404

async function context(userId: string, schoolId: string) {
  const [user, school] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { hubGuardianId: true } }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { hubSchoolId: true } }),
  ])
  return { guardianId: user?.hubGuardianId ?? null, hubSchoolId: school?.hubSchoolId ?? null }
}

// GET /api/inclusion/children — the caller's children, annotated with whether
// Inclusion holds anything for them.
//
// Connect's own children are the list. Inclusion only ever annotates it, and
// never adds to it: a child appearing here who is not on this parent's
// ParentStudentLink would be someone else's child, however Inclusion came to
// mention them.
router.get('/children', isAuthenticated, requireModule('sendInclusionEnabled'), async (req, res) => {
  try {
    const user = req.user!
    const links = await prisma.parentStudentLink.findMany({
      where: { userId: user.id },
      select: { student: { select: { id: true, firstName: true, lastName: true, hubPupilId: true } } },
    })
    const mine = links.map(l => l.student).filter(Boolean)

    const { guardianId, hubSchoolId } = await context(user.id, user.schoolId)

    // A self-registered parent, or a hand-created account never matched to
    // Hub, has no guardian id. Inclusion has never heard of them and a call
    // would 404 — so do not make one. Telling the two apart on our side is
    // the only way to tell them apart at all.
    if (!guardianId || !hubSchoolId || !inclusionConfigured()) {
      const state: State = !inclusionConfigured() || !hubSchoolId ? 'unavailable' : 'no_hub_link'
      return res.json({ state, children: mine.map(s => ({ id: s.id, firstName: s.firstName, hasPlan: null })) })
    }

    let summary
    try {
      summary = await fetchChildren({ hubSchoolId, guardianId })
    } catch (e) {
      // A guardian Inclusion has never mirrored. Not an error page: this
      // family simply has nothing in Inclusion, which is the ordinary case
      // for most of a school.
      if (isNotFound(e)) {
        return res.json({ state: 'not_known' as State, children: [] })
      }
      throw e
    }

    const byPupil = new Map(summary.children.map(c => [c.pupil_id, c]))
    res.json({
      state: 'ok' as State,
      // CONNECT'S LIST, annotated. Never Inclusion's.
      children: mine.map(s => {
        const theirs = s.hubPupilId ? byPupil.get(s.hubPupilId) : undefined
        return {
          id: s.id,
          firstName: s.firstName,
          // null means "not asked or not known", false means "asked, nothing".
          // A tri-state because a child missing from Inclusion's mirror and a
          // child Inclusion knows has no plan want different wording.
          hasPlan: theirs ? theirs.has_active_iep : null,
        }
      }),
    })
  } catch (error) {
    if (error instanceof InclusionNotConfiguredError) {
      return res.status(503).json({ state: 'unavailable' as State, children: [] })
    }
    console.error('Error reading Inclusion children:', error)
    res.status(502).json({ state: 'unavailable' as State, children: [] })
  }
})

// GET /api/inclusion/child/:studentId — one child's plan, documents and
// therapy sessions.
router.get('/child/:studentId', isAuthenticated, requireModule('sendInclusionEnabled'), async (req, res) => {
  try {
    const user = req.user!
    const { studentId } = req.params

    // THE GUARD THAT MATTERS. Only this parent's own children, resolved from
    // Connect's own links — so a studentId from anywhere else reads as no
    // child, and no request leaves Connect on its behalf.
    const link = await prisma.parentStudentLink.findFirst({
      where: { userId: user.id, studentId },
      select: { student: { select: { firstName: true, hubPupilId: true } } },
    })
    if (!link?.student) return res.status(404).json({ error: 'not_found' })

    const childName = link.student.firstName
    const { guardianId, hubSchoolId } = await context(user.id, user.schoolId)

    if (!inclusionConfigured() || !hubSchoolId) {
      return res.status(503).json({ state: 'unavailable' as State, childName })
    }
    if (!guardianId || !link.student.hubPupilId) {
      return res.json({ state: 'no_hub_link' as State, childName })
    }

    const args = { hubSchoolId, guardianId, hubPupilId: link.student.hubPupilId }

    // Asked together: the page shows them together, and two round trips in
    // series would make a slow page out of two quick calls.
    const [planResult, docs] = await Promise.all([
      fetchPlan(args).catch(e => (isNotFound(e) ? undefined : Promise.reject(e))),
      fetchDocuments(args).catch(e => (isNotFound(e) ? undefined : Promise.reject(e))),
    ])

    // Undefined from BOTH means Inclusion does not hold this pupil. Undefined
    // from one is not possible today but would mean the same thing for that
    // half, and rendering it as "no plan" is the mistake this guards.
    if (planResult === undefined && docs === undefined) {
      return res.json({ state: 'not_known' as State, childName })
    }

    res.json({
      state: 'ok' as State,
      childName,
      // null is a real answer here: no plan is currently shared with this
      // family. Whether anything is SAID about that is Inclusion's call, not
      // Connect's — they know whether this is a rollover, a redraft, or an
      // error being undone, and only the first two deserve a word to the
      // parent.
      plan: planResult?.plan ?? null,
      // Rendered verbatim where present, absent otherwise. Connect does not
      // compose, map or default this sentence.
      ...(planResult?.notice ? { notice: planResult.notice } : {}),
      documents: (docs?.documents ?? []).map(d => ({
        ...d,
        // Swapped for a Connect URL so the service token never reaches a
        // browser. Inclusion re-checks the sharing rule on every fetch, so a
        // link minted before a document was made confidential will not serve.
        url: d.file_token ? `/api/inclusion/file/${encodeURIComponent(d.file_token)}` : null,
        file_token: undefined,
      })),
      therapySessions: (docs?.therapy_sessions ?? []).map(s => ({
        ...s,
        documents: (s.documents ?? []).map(d => ({
          ...d,
          url: d.file_token ? `/api/inclusion/file/${encodeURIComponent(d.file_token)}` : null,
          file_token: undefined,
        })),
      })),
    })
  } catch (error) {
    if (error instanceof InclusionNotConfiguredError) {
      return res.status(503).json({ state: 'unavailable' as State })
    }
    console.error('Error reading Inclusion child:', error)
    res.status(502).json({ state: 'unavailable' as State })
  }
})

// GET /api/inclusion/file/:token — fetch a document through Connect.
//
// PROXIED RATHER THAN REDIRECTED, for one reason: the service token must never
// reach a browser. Inclusion's link is short-lived and re-checked on every
// fetch, so this adds no authority — it only carries the credential.
//
// Connect does not check whose document this is, and cannot: the token is
// opaque. Inclusion re-checks sharing, confidentiality and retention on the
// fetch, which is the check that counts. Connect's contribution is that you
// must be a signed-in parent at a school with the module on to use this route
// at all.
router.get('/file/:token', isAuthenticated, requireModule('sendInclusionEnabled'), async (req, res) => {
  try {
    if (!inclusionConfigured()) return res.status(503).json({ error: 'unavailable' })

    const upstream = await fetch(fileUrl(req.params.token), {
      headers: { authorization: `Bearer ${process.env.SEND_SERVICE_TOKEN || ''}` },
      cache: 'no-store',
    })
    if (!upstream.ok || !upstream.body) {
      // Expired or withdrawn reads the same as never-existed, by Inclusion's
      // design and ours.
      return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'not_found' })
    }

    const type = upstream.headers.get('content-type')
    if (type) res.setHeader('content-type', type)
    const disposition = upstream.headers.get('content-disposition')
    if (disposition) res.setHeader('content-disposition', disposition)
    // Never cached anywhere: a child's SEND document must not sit in a shared
    // proxy or survive a sign-out in the browser's store.
    res.setHeader('cache-control', 'private, no-store')

    const buf = Buffer.from(await upstream.arrayBuffer())
    res.end(buf)
  } catch (error) {
    console.error('Error fetching Inclusion file:', error)
    res.status(502).json({ error: 'unavailable' })
  }
})

export default router
