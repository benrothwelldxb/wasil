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
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'
import { requireModule } from '../middleware/moduleFlag.js'
import type { InclusionFile } from '../services/sendInclusion.js'
import {
  fetchChildren,
  fetchPlan,
  fetchDocuments,
  findFile,
  inclusionConfigured,
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

/**
 * One file, as the page needs it.
 *
 * Inclusion's own `view_url` and `download_url` are dropped rather than
 * forwarded: they carry a five-minute token, and a URL that works for anyone
 * holding it has no business in a page a parent might screenshot or a browser
 * might sync. Connect's link needs a Connect session instead.
 *
 * `unavailable` is a file past retention. The RECORD survives — the session
 * and the therapist's note still matter — so it is listed and plainly marked,
 * never given a link that fails when tapped.
 */
function fileCard(f: InclusionFile, studentId: string) {
  const gone = f.file_deleted === true || (!f.view_url && !f.download_url)
  const base = `/api/inclusion/child/${encodeURIComponent(studentId)}/file/${encodeURIComponent(f.id)}`
  return {
    id: f.id,
    title: f.title,
    fileName: f.file_name ?? null,
    typeLabel: f.document_type_label ?? null,
    createdAt: f.created_at ?? null,
    sizeBytes: f.size_bytes ?? null,
    unavailable: gone,
    url: gone ? null : base,
    downloadUrl: gone ? null : `${base}?save=1`,
  }
}

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
      // LINKED BY DOCUMENT ID, never by Inclusion's URL. Every link in a
      // /documents response shares one expiry, so a parent who opens the page
      // and taps a file six minutes later would be following a dead link.
      // Connect's URL has no expiry because it mints a fresh one on each open.
      documents: (docs?.documents ?? []).map(f => fileCard(f, studentId)),
      therapySessions: (docs?.sessions ?? []).map(sess => ({
        id: sess.id,
        session_date: sess.session_date ?? null,
        provider_name: sess.provider_name ?? null,
        provider_note: sess.provider_note ?? null,
        files: (sess.files ?? []).map(f => fileCard(f, studentId)),
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

// GET /api/inclusion/child/:studentId/file/:fileId[?save=1]
//
// KEYED BY DOCUMENT ID, NOT BY INCLUSION'S URL, and the expiry is why. Every
// link in a /documents response shares one short expiry, so a URL captured at
// page load is dead by the time a parent who was interrupted comes back to it.
// This looks the file up and mints a fresh link at the moment of opening, so
// Connect's own URL never goes stale — and if the file stopped being shared
// in the meantime, Inclusion's answer now reflects that rather than the answer
// it gave when the page was drawn.
//
// IT ALSO RE-CHECKS WHOSE CHILD THIS IS. The old route took an opaque token
// and could not: any signed-in parent with a link could follow it. This one
// resolves the pupil from the caller's own ParentStudentLink first, so a file
// belonging to another family is not fetchable even with its id.
//
// NO AUTHORIZATION HEADER ON THE FILE FETCH, and that is the opposite of what
// it looks like it needs. The link IS the credential — one file, one child,
// one guardian, minutes — and it takes no bearer. Sending one is actively
// dangerous rather than merely useless: Inclusion answers a file on R2 with a
// 302 to a PRESIGNED R2 URL, so the header would ride the redirect. At best S3
// rejects the request for carrying two auth mechanisms; at worst Connect's
// service token is presented to Cloudflare. `fetch` is specified to strip it
// cross-origin; the fix is to never attach it rather than to depend on that.
//
// STREAMED, NOT BUFFERED — therapy records include video.
//
// FETCHED ONLY WHEN A PARENT OPENS A FILE. Inclusion writes an audit row on
// every fetch and a SENCO reads it, so a prefetch would put views in a child's
// access record that nobody made.
router.get(
  '/child/:studentId/file/:fileId',
  isAuthenticated,
  requireModule('sendInclusionEnabled'),
  async (req, res) => {
    try {
      const user = req.user!
      const { studentId, fileId } = req.params
      const save = req.query.save === '1'

      const link = await prisma.parentStudentLink.findFirst({
        where: { userId: user.id, studentId },
        select: { student: { select: { hubPupilId: true } } },
      })
      if (!link?.student?.hubPupilId) return res.status(404).json({ error: 'not_found' })

      const { guardianId, hubSchoolId } = await context(user.id, user.schoolId)
      if (!inclusionConfigured() || !hubSchoolId || !guardianId) {
        return res.status(503).json({ error: 'unavailable' })
      }

      let docs
      try {
        docs = await fetchDocuments({ hubSchoolId, guardianId, hubPupilId: link.student.hubPupilId })
      } catch (e) {
        if (isNotFound(e)) return res.status(404).json({ error: 'not_found' })
        throw e
      }

      const file = findFile(docs, fileId)
      // Not among this child's shared files — which also covers a file that
      // was shared when the page was drawn and has since been withdrawn.
      if (!file) return res.status(404).json({ error: 'not_found' })

      const href = save ? file.download_url ?? file.view_url : file.view_url ?? file.download_url
      // Past retention: the record survives, the file does not.
      if (file.file_deleted === true || !href) return res.status(410).json({ error: 'no_longer_available' })

      // Deliberately no headers: the link is the credential. See above.
      const upstream = await fetch(href, { cache: 'no-store' })
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'not_found' })
      }

      const type = upstream.headers.get('content-type')
      if (type) res.setHeader('content-type', type)
      const disposition = upstream.headers.get('content-disposition')
      if (disposition) res.setHeader('content-disposition', disposition)
      const length = upstream.headers.get('content-length')
      if (length) res.setHeader('content-length', length)
      // Never cached anywhere: a child's SEND record must not sit in a shared
      // proxy or survive a sign-out in the browser's store.
      res.setHeader('cache-control', 'private, no-store')

      await pipeline(Readable.fromWeb(upstream.body as WebReadableStream), res)
    } catch (error) {
      console.error('Error fetching Inclusion file:', error)
      if (!res.headersSent) res.status(502).json({ error: 'unavailable' })
    }
  },
)

export default router
