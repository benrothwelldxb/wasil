// Partner API — a deliberately narrow surface for external Wasil apps (Desk).
//
//   GET /api/partner/inbox/summary?hub_user_id=<Hub user id> → { unread }
//   GET /api/partner/attendance/today?school_id=&date=       → today's absences
//
// Auth is a Bearer partner token (see middleware/partnerAuth). Responses carry
// only what a partner needs to ROUTE and DISPLAY — a count, or a student's
// display name + class (with `hubClassId` so Desk can route to the class
// teacher) — and never other pupil PII. That keeps partners outside the
// parent-data boundary by design.
import { Router } from 'express'
import type { Request, Response } from 'express'
import multer from 'multer'
import { marked } from 'marked'
import prisma from '../services/prisma.js'
import { requirePartner } from '../middleware/partnerAuth.js'
import { resolveHubStaffMembership } from '../services/hubStaffActor.js'
import { todayInTimezone } from '../services/dateTime.js'
import { sendPushNotification, removeInvalidTokens } from '../services/firebase.js'
import { getPushBadgeCount } from '../services/unreadCount.js'
import { sendNotification } from '../services/notify.js'
import { signalAdminNotice } from '../services/adminNotices.js'
import logger from '../services/logger.js'
import { enqueuePush } from '../services/outbox.js'
import { notifyAttendanceReviewed } from '../services/attendanceReviewNotify.js'
import { sanitizeRichText } from '../services/htmlSanitizer.js'
import { uploadFile, generateKey } from '../services/storage.js'
import { checkUpload, ATTACHMENT_MIME_TYPES } from '../services/uploadValidation.js'
import { ALLOWED_REACTION_EMOJIS } from './inbox.js'

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Attachment upload — same allowlist + limits as the native staff route
// (messages.ts). Desk authors in markdown everywhere; on the broadcast path we
// convert that markdown to HTML and run it through the SAME sanitizer the admin
// composer uses, so a partner broadcast stores the same safe-HTML content model
// as a native one (bold/italic/lists survive; anything unsafe is discarded).
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB, matches native
})

/** Desk markdown → sanitized HTML (broadcast content model is HTML). */
function markdownToSafeHtml(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: true }) as string
  return sanitizeRichText(html)
}

// A resolved staff/admin actor, shaped exactly like `req.user`, so we can reuse
// the native inbox logic against a partner (Desk) request. `hub_user_id` maps to
// `User.hubUserId` (the Hub SSO identity link).
//
// Authorisation here is SCHOOL MEMBERSHIP, not job title (ADR 0004: Desk owns
// the scoping decision — who may message whom — and Connect validates only that
// the caller really is staff at the school). So NON-TEACHING staff (reception,
// office) are first-class actors: a Hub user id Connect holds no staff-eligible
// row for is checked against Hub's own staff list for the school, and backed by
// a linked/provisioned Connect user (see services/hubStaffActor.ts). Before
// that, only staff Connect had already provisioned — in practice teachers and
// admins — could resolve, and reception 403'd.
//
// An ILSA must NEVER slip through this resolver (it would gain the staff
// recipient picker / broadcast / group surfaces): they are a distinct,
// pupil-scoped actor, refused both locally and in the Hub fallback (ADR 0006).
type StaffActor = { id: string; role: string; schoolId: string; name: string }

const STAFF_ELIGIBLE_ROLES = ['STAFF', 'ADMIN', 'SUPER_ADMIN']

/** The local (no-network) half: a Connect user already provisioned as staff. */
async function resolveLocalStaffActor(hubUserId: string): Promise<StaffActor | null> {
  if (!hubUserId) return null
  const u = await prisma.user.findUnique({
    where: { hubUserId },
    select: { id: true, role: true, schoolId: true, name: true },
  })
  if (!u || !STAFF_ELIGIBLE_ROLES.includes(u.role)) return null
  return { id: u.id, role: u.role, schoolId: u.schoolId, name: u.name }
}

/**
 * A staff actor for the partner surface: the local staff record if there is
 * one, else whoever Hub confirms is staff at the school (linked/provisioned on
 * the spot). `schoolHint` is the request's optional `school_id` — a Hub or
 * Connect school id — which narrows the Hub lookup to one school; without it we
 * check every Hub-linked school. The fallback never throws: Hub unreachable or
 * unconfigured degrades to null, i.e. today's 403.
 */
async function resolveStaffActor(
  hubUserId: string,
  schoolHint?: string | null,
): Promise<StaffActor | null> {
  const local = await resolveLocalStaffActor(hubUserId)
  if (local) return local
  return resolveHubStaffMembership(hubUserId, schoolHint)
}

// A resolved ILSA actor — an ILSA-role user scoped to exactly ONE pupil via an
// ACTIVE IlsaLink. An ILSA with no active link (never linked, or Hub-deactivated)
// resolves to null, which cuts off all messaging access (deliverable #5). v1 has
// exactly one link per ILSA; if several ever exist we take the first active one.
type IlsaActor = { id: string; schoolId: string; name: string; studentId: string; hubPupilId: string }

async function resolveIlsaActor(hubUserId: string): Promise<IlsaActor | null> {
  if (!hubUserId) return null
  const u = await prisma.user.findUnique({
    where: { hubUserId },
    select: { id: true, role: true, schoolId: true, name: true },
  })
  if (!u || u.role !== 'ILSA') return null
  const link = await prisma.ilsaLink.findFirst({
    where: { userId: u.id, active: true },
    select: { studentId: true, hubPupilId: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!link) return null
  return { id: u.id, schoolId: u.schoolId, name: u.name, studentId: link.studentId, hubPupilId: link.hubPupilId }
}

// The unified actor for the shared inbox routes: a partner request is EITHER a
// staff/admin actor OR an ILSA actor (role is exclusive — a user is one or the
// other, never both). A parent / unknown / deactivated-ILSA id → null → 403.
type Actor = { kind: 'STAFF'; staff: StaffActor } | { kind: 'ILSA'; ilsa: IlsaActor }

async function resolveActor(hubUserId: string, schoolHint?: string | null): Promise<Actor | null> {
  // Local staff first, then ILSA, and only then the Hub membership check — so a
  // known actor of either kind costs no network call, and an ILSA id can never
  // reach the staff fallback.
  const local = await resolveLocalStaffActor(hubUserId)
  if (local) return { kind: 'STAFF', staff: local }
  const ilsa = await resolveIlsaActor(hubUserId)
  if (ilsa) return { kind: 'ILSA', ilsa }
  const staff = await resolveHubStaffMembership(hubUserId, schoolHint)
  if (staff) return { kind: 'STAFF', staff }
  return null
}

/** The request's optional `school_id` (Hub or Connect id), used to narrow the
 * Hub staff lookup. Desk sends it on some routes and not others; absent, the
 * lookup simply covers every Hub-linked school. */
function schoolHintOf(req: Request): string | null {
  const fromQuery = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
  if (fromQuery) return fromQuery
  const body = (req.body ?? {}) as Record<string, unknown>
  const fromBody = typeof body.school_id === 'string' ? body.school_id.trim() : ''
  return fromBody || null
}

/** An ADMIN asking to look beyond their own threads — `?scope=school`.
 *
 * Admin oversight of the staff inbox is an AUDIT MEASURE, used when there's a
 * reason, not a permanent view: a principal who sees every parent↔teacher
 * conversation by default can't find their own, and a thread addressed to a
 * class teacher looks misdelivered to them. So it has to be asked for
 * explicitly, it's logged every time, and it is READ-ONLY — replying still
 * requires being the thread's staff or CC'd onto it.
 */
function wantsSchoolAudit(req: Request, actor: StaffActor): boolean {
  return req.query.scope === 'school' && isAdminActor(actor)
}

/** Record an admin looking at threads that aren't theirs. Framed as "created an
 * access record" to fit the CREATE/UPDATE/DELETE audit vocabulary, matching the
 * ILSA oversight route. Never blocks the read. */
async function auditInboxAccess(
  req: Request,
  actor: StaffActor,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        action: 'CREATE',
        resourceType: 'CONVERSATION',
        resourceId: (detail.threadId as string) ?? actor.schoolId,
        metadata: { event: 'ADMIN_INBOX_AUDIT', ...detail },
        schoolId: actor.schoolId,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
      },
    })
  } catch (err) {
    console.error('Failed to record admin inbox audit access:', err)
  }
}

function isAdminActor(actor: StaffActor): boolean {
  return actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN'
}

// Gate a per-thread action to the actor's OWN thread — their own or one they've
// been CC'd on. Admins get no school-wide branch HERE: Desk is a working inbox,
// and a principal seeing every parent↔teacher conversation in it made their own
// threads impossible to find, and made a thread addressed to a class teacher
// look as though it had been misdelivered to them. School-wide oversight still
// exists, in the two places it belongs — Connect's own admin inbox, and the
// audited /oversight/ilsa-threads route.
//
// Deliberately staff-oriented (no `parentId` branch): the actor is always staff
// here. `kind: 'STAFF'` EXCLUDES ILSA threads, so a private parent↔ILSA thread
// is never reachable through the staff inbox (ADR 0006 #2). A non-matching
// thread must 404, never 403, so we don't reveal that a thread exists to a staff
// member who can't see it.
function staffThreadWhere(id: string, actor: StaffActor) {
  return {
    id,
    kind: 'STAFF',
    OR: [
      { staffId: actor.id },
      // A CC'd staff member (a STAFF-role participant) may open and reply to the
      // thread, exactly like the primary staff.
      { participants: { some: { userId: actor.id } } },
    ],
  }
}

// Gate a per-thread action to an ILSA's OWN private thread: the thread must be
// theirs (staffId slot) AND typed ILSA. The teacher↔parent thread (kind STAFF) is
// therefore invisible to the ILSA, and this same filter can never match another
// ILSA's thread. 404 on a miss (never reveal existence).
function ilsaThreadWhere(id: string, actor: IlsaActor) {
  return { id, kind: 'ILSA', staffId: actor.id }
}

/** The requester's Connect user id, whichever actor kind. */
function actorUserId(actor: Actor): string {
  return actor.kind === 'STAFF' ? actor.staff.id : actor.ilsa.id
}

/** The per-thread gate for the acting party — staff (own/CC/admin, STAFF-typed)
 * or ILSA (own, ILSA-typed). Both 404 on a miss without leaking existence. */
function threadWhereForActor(id: string, actor: Actor) {
  return actor.kind === 'STAFF' ? staffThreadWhere(id, actor.staff) : ilsaThreadWhere(id, actor.ilsa)
}

/** A student's PRIMARY guardian (first ParentStudentLink) as a same-school
 * PARENT user id, or null. The single point both the staff and ILSA start-thread
 * paths resolve the parent by, so every studentId round-trips the same way. */
async function resolvePrimaryGuardianId(studentId: string, schoolId: string): Promise<string | null> {
  const link = await prisma.parentStudentLink.findFirst({
    where: { studentId },
    select: { userId: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!link) return null
  const parentUser = await prisma.user.findFirst({
    where: { id: link.userId, schoolId, role: 'PARENT' },
    select: { id: true },
  })
  return parentUser?.id ?? null
}

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

    let staff: { id: string } | null = await prisma.user.findUnique({
      where: { hubUserId },
      select: { id: true },
    })
    // Not provisioned locally? Same membership check as the rest of the inbox,
    // so a reception/office user's badge works before they've opened Desk's
    // inbox (and is backed by the same linked/provisioned user thereafter).
    if (!staff) staff = await resolveStaffActor(hubUserId, schoolHintOf(req))
    // Unknown user is not an error — Desk polls many ids, some unmapped.
    if (!staff) return res.json({ unread: 0 })

    const unread = await prisma.conversation.count({
      where: {
        staffId: staff.id,
        // STAFF threads only — an ILSA's private threads never count toward a
        // staff/teacher unread badge (and this endpoint is staff-facing).
        kind: 'STAFF',
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

// Today's parent-reported absences for a school, so Desk can surface them and
// route each to the class teacher (via `hubClassId`).
//
//   GET /api/partner/attendance/today?school_id=<Hub school id>[&date=YYYY-MM-DD]
//
// `school_id` is resolved against the Hub school link (falls back to a Connect
// school id). `date` defaults to today in the school's timezone. Each row's `id`
// is its AttendanceRequest id — the handle for POST /attendance/:id/review, so
// reception can approve from Desk without switching to Connect. Returns every
// AttendanceRequest whose window covers `date` — i.e. `startDate <= date <=
// coalesce(endDate, startDate)` (the string dates are YYYY-MM-DD, so a
// lexicographic compare is correct). Each row carries only denormalised display
// data (student display name + class) plus `hubClassId` for routing — no other
// pupil PII. Unknown school → empty list, not an error.
router.get('/attendance/today', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) {
      return res.status(400).json({ error: 'school_id required' })
    }
    const dateParam = typeof req.query.date === 'string' ? req.query.date.trim() : ''
    if (dateParam && !DATE_RE.test(dateParam)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }

    // Accept the Hub school id (Desk's world) or a Connect school id.
    const school = await prisma.school.findFirst({
      where: { OR: [{ hubSchoolId: schoolIdParam }, { id: schoolIdParam }] },
      select: { id: true, timezone: true },
    })
    // Unknown school is not an error — Desk may probe ids we don't host.
    if (!school) return res.json({ date: dateParam || null, absences: [] })

    const date = dateParam || todayInTimezone(school.timezone ?? 'UTC')

    const rows = await prisma.attendanceRequest.findMany({
      where: {
        schoolId: school.id,
        // Test Students are hidden from Desk-facing lists (delivery is unaffected).
        student: { isTest: false },
        // Window covers `date`: startDate <= date <= coalesce(endDate, startDate).
        startDate: { lte: date },
        OR: [
          { endDate: { gte: date } },
          { AND: [{ endDate: null }, { startDate: { gte: date } }] },
        ],
      },
      select: {
        // The AttendanceRequest id — what POST /attendance/:id/review targets.
        id: true,
        type: true,
        reason: true,
        notes: true,
        startDate: true,
        endDate: true,
        time: true,
        status: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            class: { select: { name: true, hubClassId: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const absences = rows.map((r) => ({
      id: r.id,
      studentName: `${r.student.firstName} ${r.student.lastName}`.trim(),
      hubClassId: r.student.class?.hubClassId ?? null,
      className: r.student.class?.name ?? null,
      type: r.type,
      reason: r.reason,
      notes: r.notes,
      startDate: r.startDate,
      endDate: r.endDate,
      time: r.time,
      status: r.status,
    }))

    res.set('Cache-Control', 'private, max-age=30')
    res.json({ date, absences })
  } catch (error) {
    console.error('Error building partner attendance/today:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// Everything ahead of schedule: absences a parent has PLANNED but that haven't
// started yet — the ones still to review, and the ones already agreed.
//
//   GET /api/partner/attendance/requests?school_id=<Hub school id | Connect id>
//   → { requests: [ … ] }
//
// /attendance/today is windowed to one date, so a request whose startDate is
// still in the future never surfaces there — a holiday booked three weeks out
// was invisible to Desk until the morning it began. This is the complement:
// starting AFTER today, ordered soonest-first.
//
// Two statuses, because Desk renders two sections from one call: PENDING is the
// review queue (Approve/Decline), APPROVED is the read-only "upcoming absences"
// list — knowing who is already booked out next week is as useful to the front
// office as knowing what still needs deciding. DECLINED and expired are dropped;
// nobody acts on those. `status` per row tells Desk which section a row belongs
// to. The two lists stay disjoint by construction (`>` today, not `>=`), so a
// same-day request belongs to /today alone and can never appear twice.
//
// Each row carries the same fields /today does, plus `createdAt` so Desk can
// show how long a parent has been waiting. `id` is the AttendanceRequest id —
// the same handle POST /attendance/:id/review takes, so reviewing works
// identically from either list. Unknown school → empty list, not an error.
router.get('/attendance/requests', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) {
      return res.status(400).json({ error: 'school_id required' })
    }

    // Accept the Hub school id (Desk's world) or a Connect school id.
    const school = await prisma.school.findFirst({
      where: { OR: [{ hubSchoolId: schoolIdParam }, { id: schoolIdParam }] },
      select: { id: true, timezone: true },
    })
    if (!school) return res.json({ requests: [] })

    // "Future" is measured in the school's own day, not the server's.
    const today = todayInTimezone(school.timezone ?? 'UTC')

    const rows = await prisma.attendanceRequest.findMany({
      where: {
        schoolId: school.id,
        // PENDING = still to review, APPROVED = already agreed and coming up.
        status: { in: ['PENDING', 'APPROVED'] },
        // Dates are YYYY-MM-DD strings, so a lexicographic compare is correct.
        startDate: { gt: today },
        // Test Students stay out of Desk-facing lists, exactly as on /today.
        student: { isTest: false },
      },
      select: {
        id: true,
        type: true,
        reason: true,
        notes: true,
        startDate: true,
        endDate: true,
        time: true,
        status: true,
        createdAt: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            class: { select: { name: true, hubClassId: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    })

    const requests = rows.map((r) => ({
      id: r.id,
      studentName: `${r.student.firstName} ${r.student.lastName}`.trim(),
      hubClassId: r.student.class?.hubClassId ?? null,
      className: r.student.class?.name ?? null,
      type: r.type,
      reason: r.reason,
      notes: r.notes,
      startDate: r.startDate,
      endDate: r.endDate,
      time: r.time,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }))

    res.set('Cache-Control', 'private, max-age=30')
    res.json({ requests })
  } catch (error) {
    console.error('Error building partner attendance requests:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// Approve or decline one parent-reported absence, from Desk's front-office
// screen — reception sees the absence on /attendance/today and acts on it there
// rather than switching to Connect.
//
//   POST /api/partner/attendance/:id/review
//   { hub_user_id, status: "APPROVED" | "DECLINED", review_notes? }
//   → 200 { id, status, reviewedBy, reviewedAt }
//
// `:id` is the row id from /attendance/today. `hub_user_id` is the staff member
// doing the reviewing — resolved the same way as every other partner route, so
// reception and office staff qualify on SCHOOL MEMBERSHIP, not job title (ADR
// 0004). Desk gates the button to its own roles on top of that.
//
// Mirrors the native PATCH /attendance/requests/:id exactly, including the side
// effect that matters: an APPROVED absence writes EXCUSED attendance records
// across its date range, so the register and the digest agree with the decision.
// A request from another school 404s (never 403 — don't confirm it exists).
router.post('/attendance/:id/review', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, status, review_notes } = req.body ?? {}
    const actor = await resolveStaffActor(
      typeof hub_user_id === 'string' ? hub_user_id.trim() : '',
      schoolHintOf(req),
    )
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    if (status !== 'APPROVED' && status !== 'DECLINED') {
      return res.status(400).json({ error: 'status must be APPROVED or DECLINED' })
    }
    const reviewNotes =
      typeof review_notes === 'string' && review_notes.trim() ? review_notes.trim() : null

    // School-scoped lookup — the actor's school, resolved from their own Connect
    // record, is the only school they can ever review for.
    const request = await prisma.attendanceRequest.findFirst({
      where: { id: req.params.id, schoolId: actor.schoolId },
      select: {
        id: true, studentId: true, parentId: true, type: true,
        startDate: true, endDate: true, reason: true,
        student: { select: { firstName: true, lastName: true } },
      },
    })
    if (!request) return res.status(404).json({ error: 'not_found' })

    const updated = await prisma.attendanceRequest.update({
      where: { id: request.id },
      data: { status, reviewedById: actor.id, reviewedAt: new Date(), reviewNotes },
      select: { id: true, status: true, reviewedAt: true },
    })

    // An approved ABSENCE marks the register EXCUSED for every day it covers —
    // the same loop the native route runs, so both paths leave identical state.
    if (status === 'APPROVED' && request.type === 'ABSENCE') {
      const end = request.endDate || request.startDate
      for (
        let cursor = new Date(`${request.startDate}T00:00:00.000Z`);
        cursor.toISOString().slice(0, 10) <= end;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        const date = cursor.toISOString().slice(0, 10)
        await prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: request.studentId, date } },
          create: {
            studentId: request.studentId,
            schoolId: actor.schoolId,
            date,
            status: 'EXCUSED',
            notes: `Approved absence: ${request.reason}`,
            markedById: actor.id,
          },
          update: {
            status: 'EXCUSED',
            notes: `Approved absence: ${request.reason}`,
            markedById: actor.id,
          },
        })
      }
    }

    // Tell the parent — identical wording and channels whether the decision was
    // made here or in Connect's own staff app.
    await notifyAttendanceReviewed({
      requestId: request.id,
      schoolId: actor.schoolId,
      parentId: request.parentId,
      // Optional-chained on purpose: the decision is already saved, so nothing
      // in ASSEMBLING the message may throw and fail the review after the fact.
      studentName: `${request.student?.firstName ?? ''} ${request.student?.lastName ?? ''}`.trim() || 'your child',
      type: request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      status,
      reviewNotes,
    })

    // Audit with the RESOLVED actor — a partner request carries no `req.user`,
    // so the shared logAudit helper can't be used here.
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        action: 'UPDATE',
        resourceType: 'ATTENDANCE_REQUEST',
        resourceId: request.id,
        metadata: { status, reviewNotes, via: 'partner' },
        schoolId: actor.schoolId,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
      },
    })

    res.json({
      id: updated.id,
      status: updated.status,
      reviewedBy: actor.name,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    })
  } catch (error) {
    console.error('Error reviewing partner attendance request:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// ============================================================================
// Partner inbox — Desk hosts the 1:1 parent↔staff inbox; Connect stays the
// system of record. Each route resolves an `actor` from a Hub user id — either a
// staff/admin actor OR a pupil-scoped ILSA actor (ADR 0006). For an ILSA the
// SAME routes operate ONLY on their private, ILSA-typed thread(s) for their one
// pupil, so Desk's generic client reuses them with no change. Responses carry
// DISPLAY NAMES ONLY — never parent email/phone, never pupil DOB/UPN/other PII.
// ============================================================================

// The include used by both list routes — mirror it across staff + ILSA so the
// mapper below is shared.
const THREAD_LIST_INCLUDE = {
  parent: { select: { name: true } },
  student: {
    select: {
      firstName: true,
      lastName: true,
      class: { select: { name: true, hubClassId: true } },
    },
  },
  participants: { select: { userId: true, role: true, lastReadAt: true } },
} as const

// Shape one conversation row into a Desk thread-list item. `actorId` is the
// requester (staff, CC'd staff, or ILSA) and drives the unread computation.
type ThreadRowMessages = { messages: { readAt: Date | null; createdAt: Date }[] }
function mapThreadItem(
  c: {
    id: string
    staffId: string
    parent: { name: string }
    student: { firstName: string; lastName: string; class: { name: string; hubClassId: string | null } | null } | null
    lastMessageText: string | null
    lastMessageAt: Date
    participants: { userId: string; role: string; lastReadAt: Date | null }[]
  } & ThreadRowMessages,
  actorId: string,
) {
  // A CC'd staff member (a STAFF participant who is NOT the primary staff) reads
  // via their own participant row: unread = inbound newer than their lastReadAt
  // (null ⇒ all inbound). The primary staff / ILSA / admin keep the two-party
  // ConversationMessage.readAt model unchanged.
  const myPart = c.participants.find((p) => p.userId === actorId && p.role === 'STAFF')
  const useParticipant = !!myPart && c.staffId !== actorId
  const unread = useParticipant
    ? c.messages.filter((m) => (myPart!.lastReadAt ? m.createdAt > myPart!.lastReadAt : true)).length
    : c.messages.filter((m) => m.readAt === null).length
  return {
    id: c.id,
    parentName: c.parent.name,
    studentName: c.student ? `${c.student.firstName} ${c.student.lastName}`.trim() : null,
    hubClassId: c.student?.class?.hubClassId ?? null,
    className: c.student?.class?.name ?? null,
    lastMessageText: c.lastMessageText,
    lastMessageAt: c.lastMessageAt.toISOString(),
    unread,
    // Number of additional CO-GUARDIANS this thread is shared with (STAFF CCs
    // are excluded — they are not co-guardians). 0 = ordinary 1-to-1.
    sharedCount: c.participants.filter((p) => p.role !== 'STAFF').length,
    // True when the actor is on this thread as a CC'd staff member rather than
    // the primary teacher — lets Desk badge "you're CC'd on this". Always false
    // for an ILSA (they are always the primary party on their own thread).
    ccd: useParticipant,
  }
}

// 1. List the actor's inbox threads (mirrors GET /staff/conversations).
//
//   GET /api/partner/inbox/threads?hub_user_id=<Hub user id>[&class_id=<Hub class id>]
//
// Staff/admin: admins see every non-archived STAFF thread in their school; other
// staff see only their own (+ CCs). `class_id` (optional Hub class id) filters by
// the thread's student; an unknown class → empty list.
// ILSA: sees ONLY their private (ILSA-typed) thread(s) for their one pupil —
// `class_id` is ignored (they are single-pupil-scoped). ILSA threads are excluded
// from every staff branch above via `kind: 'STAFF'`.
router.get('/inbox/threads', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveActor(hubUserId, schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    // --- ILSA: their own ILSA-typed threads only ---------------------------
    if (actor.kind === 'ILSA') {
      const conversations = await prisma.conversation.findMany({
        where: { staffId: actor.ilsa.id, kind: 'ILSA' },
        include: {
          ...THREAD_LIST_INCLUDE,
          messages: {
            where: { senderId: { not: actor.ilsa.id }, deletedAt: null },
            select: { readAt: true, createdAt: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
      })
      return res.json({ threads: conversations.map((c) => mapThreadItem(c, actor.ilsa.id)) })
    }

    // --- Staff: their OWN threads, admins included -------------------------
    // Every staff member — principal included — sees the threads they're part
    // of: their own, plus any they've been CC'd on as a STAFF participant
    // (their own participant archivedAt drives archive). Admins used to get the
    // whole school here; in a working inbox that buried their own conversations
    // among everyone else's. Oversight lives in Connect's admin inbox instead.
    const staff = actor.staff
    const where: Record<string, unknown> = { kind: 'STAFF' }
    const auditing = wantsSchoolAudit(req, staff)
    if (auditing) {
      // Explicit admin audit sweep — logged, and only ever STAFF-typed threads
      // (a private parent↔ILSA thread stays out; ADR 0006 #2).
      where.schoolId = staff.schoolId
      where.archivedByStaff = false
    } else {
      where.OR = [
        { staffId: staff.id, archivedByStaff: false },
        { participants: { some: { userId: staff.id, role: 'STAFF', archivedAt: null } } },
      ]
    }

    const classIdParam = typeof req.query.class_id === 'string' ? req.query.class_id.trim() : ''
    if (classIdParam) {
      const cls = await prisma.class.findFirst({
        where: { hubClassId: classIdParam, schoolId: staff.schoolId },
        select: { id: true },
      })
      // Unknown / unmapped class → no threads (rather than an unfiltered list).
      if (!cls) return res.json({ threads: [] })
      where.student = { classId: cls.id }
    }

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        ...THREAD_LIST_INCLUDE,
        messages: {
          where: { senderId: { not: staff.id }, deletedAt: null },
          select: { readAt: true, createdAt: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (auditing) {
      await auditInboxAccess(req, staff, { view: 'list', threadCount: conversations.length })
    }
    res.json({ threads: conversations.map((c) => mapThreadItem(c, staff.id)) })
  } catch (error) {
    console.error('Error building partner inbox threads:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

/** { [emoji]: { count, reacted } } — the shape the parent inbox already returns,
 *  built here for the partner surface so both apps render the same thing.
 *  `undefined` rather than `{}` when empty: Desk renders nothing for a missing
 *  key, so a thread with no reactions costs no bytes and no special case. */
function summariseReactions(
  reactions: Array<{ emoji: string; userId: string }>,
  viewerId: string,
): Record<string, { count: number; reacted: boolean }> | undefined {
  if (reactions.length === 0) return undefined
  const out: Record<string, { count: number; reacted: boolean }> = {}
  for (const r of reactions) {
    const entry = out[r.emoji] ?? (out[r.emoji] = { count: 0, reacted: false })
    entry.count++
    if (r.userId === viewerId) entry.reacted = true
  }
  return out
}

// ─── Reacting to a message ───────────────────────────────────────────────────
//
//   POST   /api/partner/inbox/threads/:id/messages/:messageId/react  { hub_user_id, emoji }
//   DELETE /api/partner/inbox/threads/:id/messages/:messageId/react?hub_user_id=&emoji=
//
// resolveActor rather than resolveStaffActor, so an ILSA can react in their own
// thread the way a teacher can in theirs — the same reason the thread read uses
// it. The visibility gate is the read's gate exactly: if you cannot open the
// thread you cannot react in it.
//
// A reaction is NOT an acknowledgement. It is not a read receipt, it does not
// answer a message, and nothing here touches the "who has responded" counts or
// the unread state. It also sends no notification: a heart from a teacher is not
// worth a push, and the parent sees it next time they open the thread.
async function resolveReactionTarget(req: Request, res: Response, emoji: unknown) {
  const hubUserId = typeof req.query.hub_user_id === 'string'
    ? req.query.hub_user_id.trim()
    : typeof (req.body as Record<string, unknown>)?.hub_user_id === 'string'
      ? ((req.body as Record<string, string>).hub_user_id).trim()
      : ''
  const actor = await resolveActor(hubUserId, schoolHintOf(req))
  if (!actor) {
    res.status(403).json({ error: 'forbidden' })
    return null
  }

  if (typeof emoji !== 'string' || !ALLOWED_REACTION_EMOJIS.includes(emoji)) {
    res.status(400).json({ error: 'unsupported_emoji', allowed: ALLOWED_REACTION_EMOJIS })
    return null
  }

  const { id, messageId } = req.params
  // Same gate as reading the thread — no audit-scope escape hatch here. Reading
  // someone else's thread for oversight is a logged, deliberate act; writing
  // into it is not something oversight should permit.
  const conversation = await prisma.conversation.findFirst({
    where: threadWhereForActor(id, actor),
    select: { id: true },
  })
  if (!conversation) {
    res.status(404).json({ error: 'not_found' })
    return null
  }

  const message = await prisma.conversationMessage.findFirst({
    // Scoped to the thread, so a message id from another conversation cannot be
    // reacted to by borrowing a thread the actor can see.
    where: { id: messageId, conversationId: conversation.id },
    select: { id: true, deletedAt: true },
  })
  if (!message) {
    res.status(404).json({ error: 'message_not_found' })
    return null
  }
  // A withdrawn message shows no reactions, so it should not gain one.
  if (message.deletedAt) {
    res.status(409).json({ error: 'message_withdrawn' })
    return null
  }

  return { actorId: actorUserId(actor), messageId: message.id, emoji }
}

router.post('/inbox/threads/:id/messages/:messageId/react', requirePartner, async (req, res) => {
  try {
    const target = await resolveReactionTarget(req, res, (req.body as Record<string, unknown>)?.emoji)
    if (!target) return

    // Idempotent: reacting twice with the same emoji is the same state, not an
    // error. The unique index is [messageId, userId, emoji].
    await prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId: target.messageId,
          userId: target.actorId,
          emoji: target.emoji,
        },
      },
      create: { messageId: target.messageId, userId: target.actorId, emoji: target.emoji },
      update: {},
    })

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId: target.messageId },
      select: { emoji: true, userId: true },
    })
    res.json({ reactions: summariseReactions(reactions, target.actorId) ?? {} })
  } catch (error) {
    console.error('Error adding partner reaction:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.delete('/inbox/threads/:id/messages/:messageId/react', requirePartner, async (req, res) => {
  try {
    const target = await resolveReactionTarget(req, res, req.query.emoji)
    if (!target) return

    // deleteMany, not delete: removing a reaction that is already gone is the
    // state the caller asked for, not a 404.
    await prisma.messageReaction.deleteMany({
      where: { messageId: target.messageId, userId: target.actorId, emoji: target.emoji },
    })

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId: target.messageId },
      select: { emoji: true, userId: true },
    })
    res.json({ reactions: summariseReactions(reactions, target.actorId) ?? {} })
  } catch (error) {
    console.error('Error removing partner reaction:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// 2. Read one thread with its messages (mirrors GET /conversations/:id incl. the
// mark-inbound-read side-effect). Soft-deleted messages are EXCLUDED entirely —
// Desk gets a curated, display-only shape (names only; no reactions / replyTo /
// avatars / readAt). A thread the actor can't see → 404. For an ILSA actor the
// gate is their own ILSA-typed thread; a teacher↔parent (STAFF) thread 404s.
router.get('/inbox/threads/:id', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveActor(hubUserId, schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })
    const aId = actorUserId(actor)

    const { id } = req.params

    // An admin may open a thread that isn't theirs ONLY by asking for the audit
    // scope explicitly, and it's logged. Everything else stays own/CC.
    const auditing = actor.kind === 'STAFF' && wantsSchoolAudit(req, actor.staff)
    const where = auditing
      ? { id, kind: 'STAFF', schoolId: actor.staff.schoolId }
      : threadWhereForActor(id, actor)

    const conversation = await prisma.conversation.findFirst({
      where,
      include: {
        parent: { select: { name: true } },
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        participants: { select: { id: true, userId: true, role: true, user: { select: { name: true } } } },
        // Soft-deleted messages are INCLUDED, as tombstones. Filtering them out
        // left a teacher holding a notification about a message that wasn't
        // there — indistinguishable, from Desk's side, from a bug in Desk. The
        // content is withheld below; only the fact and time of withdrawal go.
        messages: {
          include: {
            sender: { select: { name: true } },
            attachments: true,
            reactions: { select: { emoji: true, userId: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'not_found' })
    }

    if (auditing && actor.kind === 'STAFF') {
      await auditInboxAccess(req, actor.staff, {
        view: 'thread',
        threadId: conversation.id,
        messageCount: conversation.messages.length,
      })
    }

    // Mark-read side-effect. A CC'd staff member (a STAFF participant who is NOT
    // the primary staff) stamps their OWN participant lastReadAt; the primary
    // staff / admin / ILSA keep the two-party ConversationMessage.readAt model.
    //
    // An audit read marks NOTHING: the teacher whose thread it is must not have
    // their unread state changed by someone else looking, and an admin who never
    // owned the thread has no read state to keep.
    const myPart = conversation.participants.find((p) => p.userId === aId && p.role === 'STAFF')
    const ownThread = conversation.staffId === aId || !!myPart
    if (auditing && !ownThread) {
      // read-only
    } else if (myPart && conversation.staffId !== aId) {
      await prisma.conversationParticipant.update({
        where: { id: myPart.id },
        data: { lastReadAt: new Date() },
      })
    } else {
      await prisma.conversationMessage.updateMany({
        where: { conversationId: id, senderId: { not: aId }, readAt: null },
        data: { readAt: new Date() },
      })
    }

    res.json({
      thread: {
        id: conversation.id,
        parentName: conversation.parent.name,
        studentName: conversation.student
          ? `${conversation.student.firstName} ${conversation.student.lastName}`.trim()
          : null,
        className: conversation.student?.class?.name ?? null,
        // Co-guardian sharing: names of additional guardians this thread is shared
        // with (empty when it's an ordinary 1-to-1 thread). STAFF CCs are excluded
        // — they are not co-guardians. On an ILSA thread these are the pupil's
        // other guardian(s); there are never STAFF CCs on one.
        sharedWith: conversation.participants.filter((p) => p.role !== 'STAFF').map((p) => p.user.name),
        // Names of additional staff CC'd onto this thread (empty on an ordinary
        // thread, and always empty on an ILSA thread — no teacher is ever on one).
        ccStaff: conversation.participants.filter((p) => p.role === 'STAFF').map((p) => p.user.name),
      },
      messages: conversation.messages.map((m) => {
        // Same tombstone shape the parent inbox already uses (serializeMessage
        // in routes/inbox.ts): blank content, `deleted` present only when true,
        // `deletedAt` always. Attachments are dropped too — Desk renders none
        // for a withdrawn message, and shipping the file URLs of something a
        // parent withdrew would undo the withdrawal.
        // Truthiness, not `!== null`: a row reaching here without the field set
        // must read as LIVE. Getting that backwards would tombstone a real
        // message, which is a far worse failure than missing a withdrawal.
        const isDeleted = !!m.deletedAt
        return {
          id: m.id,
          senderName: m.sender.name,
          mine: m.senderId === aId,
          content: isDeleted ? '' : m.content,
          deleted: isDeleted || undefined,
          deletedAt: m.deletedAt?.toISOString() || null,
          sentAt: m.createdAt.toISOString(),
          // The same { [emoji]: { count, reacted } } summary the parent inbox
          // builds, with `reacted` relative to the caller. Omitted when empty so
          // Desk can treat a missing key as "no reactions" — which is what lets
          // this ship before the write path without changing anything.
          //
          // Dropped from a withdrawn message along with its content and files: a
          // tombstone carrying hearts would be odd, and reacting to something a
          // parent withdrew is not a thing to preserve.
          reactions: isDeleted ? undefined : summariseReactions(m.reactions, aId),
          attachments: isDeleted
            ? []
            : m.attachments.map((a) => ({
                name: a.fileName,
                url: a.fileUrl,
                type: a.fileType,
                size: a.fileSize,
              })),
        }
      }),
    })
  } catch (error) {
    console.error('Error fetching partner inbox thread:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// 3. Send a message in a thread (mirrors POST /conversations/:id/messages).
// Attachments must be PRE-HOSTED URLs (Desk can't call the staff-JWT upload
// route). Runs the same recipient fan-out — a Notification row + FCM push to
// every OTHER party (respecting mute). The sender is staff or ILSA (never a
// parent here), so there is no parent→teacher email branch. For an ILSA the
// gate is their own ILSA-typed thread, and the fan-out reaches only the pupil's
// guardian(s) on it — never any teacher (a teacher is never a party to one).
router.post('/inbox/threads/:id/messages', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, content, attachments } = req.body ?? {}
    const actor = await resolveActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '', schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })
    const aId = actorUserId(actor)

    const { id } = req.params
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content required' })
    }

    const conversation = await prisma.conversation.findFirst({
      where: threadWhereForActor(id, actor),
      include: {
        parent: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        schoolContact: { select: { name: true } },
        participants: { select: { userId: true, mutedAt: true } },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'not_found' })
    }

    const message = await prisma.conversationMessage.create({
      data: { conversationId: id, senderId: aId, content: content.trim() },
    })

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      await prisma.conversationAttachment.createMany({
        data: attachments.map((a: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => ({
          messageId: message.id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileType: a.fileType,
          fileSize: a.fileSize,
        })),
      })
    }

    await prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: message.createdAt,
        lastMessageText: content.trim().substring(0, 200),
      },
    })

    // Recipient fan-out — notify everyone on the thread EXCEPT the sender: the
    // primary parent, the primary staff (so a CC'd staff sender still reaches the
    // primary teacher), and every added participant (co-guardians + other staff
    // CCs). Deduped by userId; each carries their own mute state (the primary
    // flags for the primary parent/staff, participant.mutedAt for added ones).
    // The sender's display name is the primary staff name unless the sender is a
    // CC'd staff participant, in which case it's the actor's own name.
    const senderIsPrimaryStaff = conversation.staffId === aId
    const senderDisplayName = senderIsPrimaryStaff
      ? (conversation.schoolContact
          ? `${conversation.staff.name} (via ${conversation.schoolContact.name})`
          : conversation.staff.name)
      : actor.kind === 'STAFF' ? actor.staff.name : actor.ilsa.name

    const recipients: Array<{ userId: string; muted: boolean }> = [
      { userId: conversation.parentId, muted: conversation.mutedByParent },
      { userId: conversation.staffId, muted: conversation.mutedByStaff },
    ]
    for (const p of conversation.participants ?? []) {
      recipients.push({ userId: p.userId, muted: p.mutedAt != null })
    }
    const seenRecipients = new Set<string>()
    const dedupedRecipients = recipients.filter((r) => {
      if (r.userId === aId || seenRecipients.has(r.userId)) return false
      seenRecipients.add(r.userId)
      return true
    })

    // Notification rows are always created regardless of mute.
    for (const r of dedupedRecipients) {
      await prisma.notification.create({
        data: {
          userId: r.userId,
          type: 'DIRECT_MESSAGE',
          title: `Message from ${senderDisplayName}`,
          body: content.trim().substring(0, 200),
          resourceType: 'CONVERSATION',
          resourceId: id,
          data: { conversationId: id, route: `/inbox/${id}` },
          schoolId: conversation.schoolId,
        },
      })
    }

    // FCM push to each recipient that hasn't muted this thread.
    for (const r of dedupedRecipients) {
      if (r.muted) continue
      const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId: r.userId },
        select: { token: true },
      })
      if (deviceTokens.length > 0) {
        const tokens = deviceTokens.map((dt) => dt.token)
        // The recipient's OWN unread total, now including the message just
        // created - the number their device should badge with. Per recipient,
        // and undefined (badge omitted) if it can't be worked out.
        const badge = await getPushBadgeCount(r.userId)
        const result = await sendPushNotification(tokens, {
          title: `Message from ${senderDisplayName}`,
          body: content.trim().substring(0, 200),
          data: {
            type: 'DIRECT_MESSAGE',
            resourceType: 'CONVERSATION',
            resourceId: id,
            route: `/inbox/${id}`,
          },
          badge,
        })
        if (result.failedTokens.length > 0) {
          await removeInvalidTokens(result.failedTokens)
        }
      }
    }

    res.status(201).json({ id: message.id, sentAt: message.createdAt.toISOString() })
  } catch (error) {
    console.error('Error sending partner inbox message:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// 4. Find-or-create a thread between the actor and a parent (mirrors POST
// /staff/conversations). Re-opening un-archives the actor's side.
//   • Staff: parent is identified directly (parentId) or via a student (first
//     ParentStudentLink). The thread is STAFF-typed.
//   • ILSA: `studentId` is forced to the ILSA's ONE linked pupil (any other →
//     403 — an ILSA can never reach a different pupil's guardian). The thread is
//     ILSA-typed, with the pupil's PRIMARY guardian as the parent party. Other
//     guardians join only via the existing opt-in co-guardian sharing (mirrors
//     the teacher model's separated-guardian safeguard), or by starting their own
//     thread with the ILSA from the parent app.
router.post('/inbox/threads', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, studentId, parentId } = req.body ?? {}
    const actor = await resolveActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '', schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    // --- ILSA: pinned to their one pupil, ILSA-typed thread ----------------
    if (actor.kind === 'ILSA') {
      const ilsa = actor.ilsa
      if (studentId && studentId !== ilsa.studentId) {
        // The ILSA tried to open a thread about a pupil that isn't theirs.
        return res.status(403).json({ error: 'forbidden' })
      }
      const guardianId = await resolvePrimaryGuardianId(ilsa.studentId, ilsa.schoolId)
      if (!guardianId) return res.status(400).json({ error: 'could not resolve parent' })

      const existing = await prisma.conversation.findFirst({
        where: {
          parentId: guardianId,
          staffId: ilsa.id,
          studentId: ilsa.studentId,
          schoolContactId: null,
          kind: 'ILSA',
        },
      })
      if (existing) {
        if (existing.archivedByStaff) {
          await prisma.conversation.update({ where: { id: existing.id }, data: { archivedByStaff: false } })
        }
        return res.json({ id: existing.id })
      }

      const conversation = await prisma.conversation.create({
        data: {
          schoolId: ilsa.schoolId,
          parentId: guardianId,
          staffId: ilsa.id,
          studentId: ilsa.studentId,
          schoolContactId: null,
          kind: 'ILSA',
        },
      })
      return res.json({ id: conversation.id })
    }

    // --- Staff: unchanged, STAFF-typed -------------------------------------
    const staff = actor.staff
    // Resolve the parent, verifying they are a same-school PARENT either way.
    let resolvedParentId: string | null = null
    if (parentId) {
      const parentUser = await prisma.user.findFirst({
        where: { id: parentId, schoolId: staff.schoolId, role: 'PARENT' },
        select: { id: true },
      })
      if (parentUser) resolvedParentId = parentUser.id
    } else if (studentId) {
      resolvedParentId = await resolvePrimaryGuardianId(studentId, staff.schoolId)
    }

    if (!resolvedParentId) {
      return res.status(400).json({ error: 'could not resolve parent' })
    }

    const existing = await prisma.conversation.findFirst({
      where: {
        parentId: resolvedParentId,
        staffId: staff.id,
        studentId: studentId || null,
        schoolContactId: null,
        kind: 'STAFF',
      },
    })

    if (existing) {
      if (existing.archivedByStaff) {
        await prisma.conversation.update({
          where: { id: existing.id },
          data: { archivedByStaff: false },
        })
      }
      return res.json({ id: existing.id })
    }

    const conversation = await prisma.conversation.create({
      data: {
        schoolId: staff.schoolId,
        parentId: resolvedParentId,
        staffId: staff.id,
        studentId: studentId || null,
        schoolContactId: null,
        kind: 'STAFF',
      },
    })

    res.json({ id: conversation.id })
  } catch (error) {
    console.error('Error creating partner inbox thread:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// 5. The pupils a staff member may start a thread with — completes Desk's
// composer (replies already work). `scope=own` (default) = pupils in classes the
// actor teaches (StaffClassAssignment); `scope=school` = all pupils in the
// school (Desk gates who may request the wider scope via its own grant; we still
// hard-scope to the actor's school so it can never leak cross-school). An
// unresolvable/parent id → 403 (bad actor) — same rule as the thread routes;
// recipients has no resource lookup (it's a list scoped to the actor), so its
// only failure axis is the identity. Empty is valid → 200 { recipients: [] }
// (e.g. a teacher with no class assigned yet), so the composer can say "no pupils
// yet" rather than "unavailable". Each row is four display fields only —
// `parentName` is the first ParentStudentLink, exactly as the start-thread route
// resolves it, so every returned studentId round-trips.
router.get('/inbox/recipients', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveActor(hubUserId, schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    // --- ILSA: exactly the ONE linked pupil, whatever `scope` says ---------
    if (actor.kind === 'ILSA') {
      const student = await prisma.student.findFirst({
        where: { id: actor.ilsa.studentId, schoolId: actor.ilsa.schoolId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          class: { select: { name: true } },
          parentLinks: {
            select: { user: { select: { name: true } } },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      })
      // Link points at a pupil we can't load (e.g. mid-unlink) → empty, not error.
      const recipients = student
        ? [{
            studentId: student.id,
            studentName: `${student.firstName} ${student.lastName}`.trim(),
            className: student.class?.name ?? null,
            parentName: student.parentLinks[0]?.user?.name ?? null,
          }]
        : []
      res.set('Cache-Control', 'private, max-age=30')
      return res.json({ recipients })
    }

    // --- Staff: assigned-class pupils (own) or whole school ----------------
    const staff = actor.staff
    const scope = req.query.scope === 'school' ? 'school' : 'own'

    let classFilter: { classId: { in: string[] } } | undefined
    if (scope === 'own') {
      const assignments = await prisma.staffClassAssignment.findMany({
        where: { userId: staff.id, class: { schoolId: staff.schoolId } },
        select: { classId: true },
      })
      const classIds = assignments.map((a) => a.classId)
      // No class assigned yet → empty (valid), not an error.
      if (classIds.length === 0) return res.json({ recipients: [] })
      classFilter = { classId: { in: classIds } }
    }

    const students = await prisma.student.findMany({
      // Always hard-scoped to the actor's school — scope=school never crosses it.
      // Test Students are hidden from the Desk recipient picker (delivery via
      // class fan-out is unaffected; this is only the staff-facing chooser).
      where: { schoolId: staff.schoolId, isTest: false, ...(classFilter ?? {}) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        class: { select: { name: true } },
        parentLinks: {
          select: { user: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
    })

    const recipients = students.map((s) => ({
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      className: s.class?.name ?? null,
      parentName: s.parentLinks[0]?.user?.name ?? null,
    }))

    res.set('Cache-Control', 'private, max-age=30')
    res.json({ recipients })
  } catch (error) {
    console.error('Error building partner inbox recipients:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// ============================================================================
// Passive school oversight of parent↔ILSA threads (ADR 0006, #4). This is the
// ONLY path by which a school ever sees an ILSA conversation — a retrieval route
// for the safeguarding/admin role, NOT a live inbox and NOT routine surveillance.
// Every access is AUDITED (an ILSA_THREAD AuditLog row). Retained history is
// returned even for DEACTIVATED ILSAs (their threads persist through the school's
// retention window); each thread is flagged with whether its ILSA is still active.
// ============================================================================

//   GET /api/partner/oversight/ilsa-threads?hub_user_id=<admin>&pupil_id=<hubPupilId>
//     [&school_id=<Hub school id | Connect id>]
//
// `hub_user_id` MUST resolve to an ADMIN/SUPER_ADMIN in the pupil's school (the
// safeguarding role + the audit actor); any other actor → 403. `pupil_id` is a
// Hub pupil id, resolved to a same-school Student. Unknown pupil → 404. Optional
// `school_id` is a cross-check; if it resolves to a different school than the
// admin's, → 403 (never serve cross-school). Display-only shape (names only).
router.get('/oversight/ilsa-threads', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveStaffActor(hubUserId, schoolHintOf(req))
    // Only a school admin / safeguarding lead may retrieve ILSA threads.
    if (!actor || !isAdminActor(actor)) return res.status(403).json({ error: 'forbidden' })

    const pupilHubId = typeof req.query.pupil_id === 'string' ? req.query.pupil_id.trim() : ''
    if (!pupilHubId) return res.status(400).json({ error: 'pupil_id required' })

    // Optional school_id cross-check — never serve outside the admin's own school.
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (schoolIdParam) {
      const school = await prisma.school.findFirst({
        where: { OR: [{ hubSchoolId: schoolIdParam }, { id: schoolIdParam }] },
        select: { id: true },
      })
      if (!school || school.id !== actor.schoolId) return res.status(403).json({ error: 'forbidden' })
    }

    const pupil = await prisma.student.findFirst({
      where: { hubPupilId: pupilHubId, schoolId: actor.schoolId },
      select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
    })
    if (!pupil) return res.status(404).json({ error: 'not_found' })

    // Every retained parent↔ILSA thread for this pupil (deactivated ILSAs incl.).
    const threads = await prisma.conversation.findMany({
      where: { schoolId: actor.schoolId, kind: 'ILSA', studentId: pupil.id },
      include: {
        parent: { select: { name: true } },
        staff: { select: { id: true, name: true } }, // the ILSA (staff-side slot)
        participants: { select: { role: true, user: { select: { name: true } } } },
        // Tombstones included, as on the thread route. This is the safeguarding
        // read of an ILSA's threads for one pupil: a message that was sent and
        // withdrawn is exactly the kind of thing a safeguarding lead needs to
        // see happened, and filtering it left no trace of it at all.
        messages: {
          include: { sender: { select: { name: true } }, attachments: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    // Which of this pupil's ILSAs are still actively linked (vs deactivated but
    // retained) — one query, mapped per thread by the ILSA's user id.
    const activeLinks = await prisma.ilsaLink.findMany({
      where: { studentId: pupil.id, active: true },
      select: { userId: true },
    })
    const activeIlsaIds = new Set(activeLinks.map((l) => l.userId))

    // AUDIT the access — who looked, at whose threads, how many, when. Framed as
    // "created an access record" to fit the CREATE/UPDATE/DELETE audit vocabulary.
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        action: 'CREATE',
        resourceType: 'ILSA_THREAD',
        resourceId: pupil.id,
        metadata: {
          event: 'OVERSIGHT_ACCESS',
          pupilHubId,
          threadCount: threads.length,
        },
        schoolId: actor.schoolId,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
      },
    })

    res.json({
      pupil: {
        studentName: `${pupil.firstName} ${pupil.lastName}`.trim(),
        className: pupil.class?.name ?? null,
      },
      threads: threads.map((c) => ({
        id: c.id,
        ilsaName: c.staff.name,
        // The ILSA is still actively linked (vs deactivated but retained).
        ilsaActive: activeIlsaIds.has(c.staffId),
        guardianName: c.parent.name,
        // Additional guardians the thread was shared with (co-guardians only).
        sharedWith: c.participants.filter((p) => p.role !== 'STAFF').map((p) => p.user.name),
        createdAt: c.createdAt.toISOString(),
        lastMessageAt: c.lastMessageAt.toISOString(),
        messages: c.messages.map((m) => {
          // Same tombstone shape as the thread route: blank content, `deleted`
          // only when true, `deletedAt` always, `senderName` kept so a consumer
          // can say WHO withdrew it. Attachments dropped — a withdrawn file
          // must not stay fetchable just because this view retains the row.
          const isDeleted = !!m.deletedAt
          return {
            id: m.id,
            senderName: m.sender.name,
            // ILSA vs guardian, by whether the sender is the thread's ILSA party.
            senderRole: m.senderId === c.staffId ? 'ILSA' : 'GUARDIAN',
            content: isDeleted ? '' : m.content,
            deleted: isDeleted || undefined,
            deletedAt: m.deletedAt?.toISOString() || null,
            sentAt: m.createdAt.toISOString(),
            attachments: isDeleted
              ? []
              : m.attachments.map((a) => ({
                  name: a.fileName, url: a.fileUrl, type: a.fileType, size: a.fileSize,
                })),
          }
        }),
      })),
    })
  } catch (error) {
    console.error('Error building partner ILSA oversight:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// ============================================================================
// Partner broadcast + group management — Desk (staff-facing) can send native
// broadcasts and manage groups without leaving Desk; Connect stays the system of
// record. Every route resolves a staff/admin `actor` from a Hub user id (a
// parent/unknown id → 403) and hard-scopes every target to the actor's school.
// Responses carry only counts / display names — never pupil or parent PII.
// ============================================================================

// Coerce a request-body value into a clean, de-duplicated string-id array.
function toIdArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim()))]
}

// --- Broadcast -------------------------------------------------------------

// Send a native broadcast to one or more audiences within the actor's school.
//
//   POST /api/partner/messages
//   { hub_user_id, title, content, audience: { classHubIds?, wholeSchool?,
//     yearGroupId?, groupIds? }, isUrgent?, scheduledAt?, expiresAt?,
//     attachments?: [{ fileName, fileUrl, fileType, fileSize }] }
//
// `Message` is single-target per row, so we FAN OUT: one row per class, one per
// group, one per year-group, plus one for whole-school. Every target is
// validated to the actor's school UP FRONT — a single unknown/cross-school
// target rejects the whole broadcast (400) and creates no rows. Each row mirrors
// the native create (sanitized content, its own attachments, a `sendNotification`
// with that row's target). Partner broadcasts are never pinned.
//
// NOTE (Connect-side follow-on, ADR 0004 — flagged, NOT fixed here): the
// class/year-group fan-out inside `notify.ts` reads the legacy `Child` table, so
// Desk/Hub-provisioned pupils (who live only in `Student`/`ParentStudentLink`)
// are NOT reached via the class/year path until that service is modernised. The
// `groupId` path already uses the modern tables, so group broadcasts fan out
// fully. We mirror native behaviour exactly and leave the caveat as-is.
router.post('/messages', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, title, content, audience, isUrgent, scheduledAt, expiresAt, attachments, channel, department } = req.body ?? {}
    // A department sending from Desk — the clinic, accounts — files its message
    // under Admin Notices rather than the feed. Same targeting, same row; only
    // where a parent finds it differs.
    const isNotice = channel === 'ADMIN_NOTICE'
    const noticeDepartment = isNotice && typeof department === 'string' && department.trim()
      ? department.trim().slice(0, 60)
      : null
    const actor = await resolveStaffActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '', schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' })
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'content required' })

    const aud = (audience && typeof audience === 'object') ? audience as Record<string, unknown> : {}
    const classHubIds = toIdArray(aud.classHubIds)
    const groupIds = toIdArray(aud.groupIds)
    const yearGroupId = typeof aud.yearGroupId === 'string' && aud.yearGroupId.trim() ? aud.yearGroupId.trim() : null
    const wholeSchool = aud.wholeSchool === true

    if (classHubIds.length === 0 && groupIds.length === 0 && !yearGroupId && !wholeSchool) {
      return res.status(400).json({ error: 'audience required' })
    }

    // Validate EVERY target belongs to the actor's school before creating rows.
    let resolvedClasses: { id: string; name: string }[] = []
    if (classHubIds.length > 0) {
      resolvedClasses = await prisma.class.findMany({
        where: { hubClassId: { in: classHubIds }, schoolId: actor.schoolId },
        select: { id: true, name: true },
      })
      if (resolvedClasses.length !== classHubIds.length) {
        return res.status(400).json({ error: 'unknown or cross-school class in audience' })
      }
    }

    let resolvedGroups: { id: string; name: string }[] = []
    if (groupIds.length > 0) {
      resolvedGroups = await prisma.group.findMany({
        where: { id: { in: groupIds }, schoolId: actor.schoolId },
        select: { id: true, name: true },
      })
      if (resolvedGroups.length !== groupIds.length) {
        return res.status(400).json({ error: 'unknown or cross-school group in audience' })
      }
    }

    let resolvedYearGroup: { id: string; name: string } | null = null
    if (yearGroupId) {
      resolvedYearGroup = await prisma.yearGroup.findFirst({
        where: { id: yearGroupId, schoolId: actor.schoolId },
        select: { id: true, name: true },
      })
      if (!resolvedYearGroup) {
        return res.status(400).json({ error: 'unknown or cross-school year group in audience' })
      }
    }

    // Build one fan-out target per resolved audience (class → group → year → school).
    const targets: { targetClass: string; classId?: string; yearGroupId?: string; groupId?: string }[] = []
    for (const c of resolvedClasses) targets.push({ targetClass: c.name, classId: c.id })
    for (const g of resolvedGroups) targets.push({ targetClass: g.name, groupId: g.id })
    if (resolvedYearGroup) targets.push({ targetClass: resolvedYearGroup.name, yearGroupId: resolvedYearGroup.id })
    if (wholeSchool) targets.push({ targetClass: 'Whole School' })

    // Desk sends markdown; convert → sanitized HTML so parents see formatting
    // (the broadcast render path is HTML, shared with the admin composer).
    const safeContent = markdownToSafeHtml(content)
    const cleanTitle = title.trim()
    const scheduledDate = typeof scheduledAt === 'string' && scheduledAt ? new Date(scheduledAt) : null
    const broadcastLiveNow = !scheduledDate || scheduledDate <= new Date()
    const expiresDate = typeof expiresAt === 'string' && expiresAt ? new Date(expiresAt) : null
    const attachmentRows = Array.isArray(attachments) ? attachments : []

    // `sendNotification` currently ignores `req`, but the native route passes it
    // (for future sender-exclusion / socket / audit). The partner path has no
    // `req.user`, so we stamp the resolved actor onto `req` to mirror the native
    // contract and stay forward-compatible.
    ;(req as unknown as { user: StaffActor }).user = actor

    for (const t of targets) {
      const message = await prisma.message.create({
        data: {
          title: cleanTitle,
          content: safeContent,
          targetClass: t.targetClass,
          classId: t.classId ?? null,
          yearGroupId: t.yearGroupId ?? null,
          groupId: t.groupId ?? null,
          schoolId: actor.schoolId,
          senderId: actor.id,
          senderName: actor.name,
          isPinned: false,
          isUrgent: isUrgent === true,
          scheduledAt: scheduledDate,
          // Live now → stamped; future-dated → null, and the sweep owes it.
          notifiedAt: broadcastLiveNow ? new Date() : null,
          channel: isNotice ? 'ADMIN_NOTICE' : 'FEED',
          department: noticeDepartment,
          expiresAt: expiresDate,
        },
      })

      if (attachmentRows.length > 0) {
        await prisma.messageAttachment.createMany({
          data: attachmentRows.map((a: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => ({
            messageId: message.id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            fileType: a.fileType,
            fileSize: a.fileSize,
          })),
        })
      }

      // Same rule as the native create: announce only what is live now. A
      // future-dated broadcast is picked up by the publishScheduledMessages
      // sweep when its time arrives, and `notifiedAt` staying null is the marker.
      if (broadcastLiveNow) {
        const target = {
          targetClass: t.targetClass,
          classId: t.classId,
          yearGroupId: t.yearGroupId,
          groupId: t.groupId,
          schoolId: actor.schoolId,
        }
        if (isNotice) {
          // Quiet in the app, but always signalled by email — that is what
          // makes a section outside the feed discoverable. The email carries
          // the department and nothing else, never the content.
          await signalAdminNotice({ schoolId: actor.schoolId, department: noticeDepartment, target })
          // Escalation is the sender's call: a whole-school health message
          // pushes, a fee reminder does not.
          if (isUrgent === true) {
            await sendNotification({
              req, type: 'MESSAGE',
              title: noticeDepartment || 'Admin notice',
              body: cleanTitle,
              resourceType: 'MESSAGE', resourceId: message.id, target,
            })
          }
        } else {
          await sendNotification({
            req, type: 'MESSAGE',
            title: cleanTitle,
            body: safeContent.substring(0, 200),
            resourceType: 'MESSAGE', resourceId: message.id, target,
          })
        }
      }
    }

    res.status(201).json({ created: targets.length })
  } catch (error) {
    console.error('Error creating partner broadcast:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// This sender's recent broadcasts, newest first (cap 50). Display-only: a title,
// the row's audience label, when it was sent, and `ackCount` — the number of
// MessageAcknowledgment rows, i.e. how many parents have "seen"/acknowledged it.
//
//   GET /api/partner/messages/sent?hub_user_id=<Hub user id>
// ─── What parents have been told, school-wide ────────────────────────────────
//
//   GET /api/partner/messages?school_id=<hub or connect id>&limit=60
//     → { messages: [...] }
//
// Distinct from /messages/sent below, which is one staff member's own outbox
// (scoped to senderId). This is the school's record, which is what Desk needs
// to answer "what have we already told parents" without anyone opening Connect.
//
// Deliberately read-only and school-wide: no sender filter, no edit, no delete,
// no parent-level read receipts. Desk asked for none of those and should not be
// able to change a parent-facing record it did not create.
router.get('/messages', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) return res.status(400).json({ error: 'school_id required' })

    const school = await partnerSchool(schoolIdParam)
    // Unknown school is not an error — Desk probes ids across products.
    if (!school) return res.json({ messages: [] })

    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '60'), 10) || 60))

    // Over-fetch the flat rows: a multi-class broadcast is several Message rows
    // and collapses into one entry below, so `limit` entries need more rows.
    const rows = await prisma.message.findMany({
      where: { schoolId: school.id },
      select: {
        id: true, title: true, content: true, targetClass: true,
        classId: true, yearGroupId: true, groupId: true,
        senderId: true, senderName: true,
        channel: true, department: true,
        scheduledAt: true, notifiedAt: true, createdAt: true,
        sender: { select: { name: true } },
        class: { select: { name: true, hubClassId: true } },
        yearGroup: { select: { name: true } },
        group: { select: { name: true } },
        _count: { select: { acknowledgments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 4,
    })

    // One entry per broadcast, not per fan-out row. Connect's own composer
    // writes a single row, but a partner send writes one per target, so the
    // same broadcast appears several times. Grouped on sender + title + the
    // minute it was written, which is what Desk's own merge already does.
    const groups = new Map<string, typeof rows>()
    for (const m of rows) {
      const minute = new Date(m.createdAt).toISOString().slice(0, 16)
      const key = `${m.senderId}|${m.title}|${minute}`
      const existing = groups.get(key)
      if (existing) existing.push(m)
      else groups.set(key, [m])
    }

    const messages = [...groups.values()].slice(0, limit).map(members => {
      const head = members[0]
      // Hub class ids, never Connect's internal ones — Desk cannot resolve those.
      const classHubIds = [...new Set(
        members.map(m => m.class?.hubClassId).filter((h): h is string => !!h),
      )]
      const groupIds = [...new Set(members.map(m => m.groupId).filter((g): g is string => !!g))]
      const yearGroupId = members.find(m => m.yearGroupId)?.yearGroupId ?? null
      const wholeSchool = members.some(m => m.targetClass === 'Whole School')

      // The chip Desk renders. Built from the parts rather than taken from one
      // row's targetClass, which only describes that row's slice of the send.
      const labelParts: string[] = []
      if (wholeSchool) labelParts.push('Whole School')
      const classNames = [...new Set(members.map(m => m.class?.name).filter((n): n is string => !!n))]
      if (classNames.length) labelParts.push(classNames.join(', '))
      const yearGroupName = members.find(m => m.yearGroup)?.yearGroup?.name
      if (yearGroupName) labelParts.push(yearGroupName)
      const groupNames = [...new Set(members.map(m => m.group?.name).filter((n): n is string => !!n))]
      if (groupNames.length) labelParts.push(groupNames.join(', '))

      return {
        id: head.id,
        title: head.title,
        content: head.content,
        // A notice is shown as coming from its department, matching what the
        // parent sees; an ordinary post from the person who sent it.
        senderName: head.department || head.sender?.name || head.senderName,
        channel: head.channel,
        department: head.department,
        audience: { wholeSchool, classHubIds, groupIds, yearGroupId },
        audienceLabel: labelParts.join(' · ') || head.targetClass,
        // When parents were actually told. NULL means it has not gone out yet —
        // read with scheduledAt, this distinguishes queued from sent without
        // Desk having to compare a date to the clock.
        sentAt: head.notifiedAt ? head.notifiedAt.toISOString() : null,
        scheduledAt: head.scheduledAt ? head.scheduledAt.toISOString() : null,
        createdAt: head.createdAt.toISOString(),
        // Summed across the fan-out rows, so a three-class broadcast reports
        // the acknowledgements for the whole thing.
        ackCount: members.reduce((n, m) => n + m._count.acknowledgments, 0),
      }
    })

    res.json({ messages })
  } catch (error) {
    // Never an empty list on failure: Desk's original read swallowed a 404 into
    // [] and told a school with total confidence that nothing had ever been
    // sent to parents. An error must be an error on this side too.
    console.error('Error building partner school messages:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

router.get('/messages/sent', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveStaffActor(hubUserId, schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const rows = await prisma.message.findMany({
      where: { senderId: actor.id, schoolId: actor.schoolId },
      select: {
        id: true,
        title: true,
        targetClass: true,
        createdAt: true,
        _count: { select: { acknowledgments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    res.json({
      messages: rows.map(m => ({
        id: m.id,
        title: m.title,
        audienceLabel: m.targetClass,
        sentAt: m.createdAt.toISOString(),
        ackCount: m._count.acknowledgments,
      })),
    })
  } catch (error) {
    console.error('Error building partner sent messages:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// --- Groups ----------------------------------------------------------------

// Active groups for a school, with a member count each.
//
//   GET /api/partner/groups?school_id=<Hub school id | Connect id>
router.get('/groups', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) return res.status(400).json({ error: 'school_id required' })

    const school = await prisma.school.findFirst({
      where: { OR: [{ hubSchoolId: schoolIdParam }, { id: schoolIdParam }] },
      select: { id: true },
    })
    // Unknown school is not an error — Desk may probe ids we don't host.
    if (!school) return res.json({ groups: [] })

    const groups = await prisma.group.findMany({
      where: { schoolId: school.id, isActive: true },
      select: { id: true, name: true, _count: { select: { studentMembers: true } } },
      orderBy: { name: 'asc' },
    })

    res.json({ groups: groups.map(g => ({ id: g.id, name: g.name, memberCount: g._count.studentMembers })) })
  } catch (error) {
    console.error('Error building partner groups list:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// Resolve a set of Hub pupil ids to same-school internal Student ids. Desk keys
// pupils on `Student.hubPupilId` (the Hub MIS link) and never sees our internal
// ids, so this is the boundary map — same pattern as hubClassId→Class. Returns
// the internal ids, or null if ANY id is unknown/cross-school (caller → 400).
/**
 * Hub pupil ids → internal Student ids, and which ones didn't resolve.
 *
 * The old version returned null on any miss, so the route answered "unknown or
 * cross-school pupil" for a roster of eighty without saying which one — leaving
 * the caller to bisect. It also failed the whole request over a single pupil
 * who had left, which is a normal thing for a roster to contain.
 *
 * Now it reports: callers accept what resolved and name what didn't, the way
 * the communication-intents endpoint already does.
 */
async function resolvePupilHubIds(
  pupilHubIds: string[],
  schoolId: string,
): Promise<{ studentIds: string[]; unknownPupilIds: string[] }> {
  if (pupilHubIds.length === 0) return { studentIds: [], unknownPupilIds: [] }
  const students = await prisma.student.findMany({
    where: { hubPupilId: { in: pupilHubIds }, schoolId },
    select: { id: true, hubPupilId: true },
  })
  const found = new Set(students.map(s => s.hubPupilId))
  return {
    studentIds: students.map(s => s.id),
    // Deduped, and in the order the caller sent them, so the response reads
    // against the request rather than against our query.
    unknownPupilIds: [...new Set(pupilHubIds)].filter(id => !found.has(id)),
  }
}

// Create a group in the actor's school with an initial pupil roster. Desk sends
// Hub pupil ids (`pupilHubIds`); we map them to internal Student ids at the
// boundary and store StudentGroupLink rows on the internal ids.
//
//   POST /api/partner/groups  { hub_user_id, name, pupilHubIds: string[] }
router.post('/groups', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, name, pupilHubIds, categoryId, externalRef } = req.body ?? {}
    const actor = await resolveStaffActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '', schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' })

    // A category the caller asked for must belong to this school; silently
    // dropping a cross-school one would file a squad under another school's
    // heading.
    const category = typeof categoryId === 'string' && categoryId.trim()
      ? await prisma.groupCategory.findFirst({
          where: { id: categoryId.trim(), schoolId: actor.schoolId },
          select: { id: true },
        })
      : null
    if (typeof categoryId === 'string' && categoryId.trim() && !category) {
      return res.status(400).json({ error: 'unknown category for this school' })
    }

    // Accept what resolved and report what didn't, rather than refusing the
    // whole roster over one pupil. A published roster containing someone who
    // has left is ordinary, and "unknown or cross-school pupil" with no id left
    // the caller to bisect eighty pupils to find which.
    const { studentIds, unknownPupilIds } = await resolvePupilHubIds(toIdArray(pupilHubIds), actor.schoolId)

    const ref = typeof externalRef === 'string' && externalRef.trim() ? externalRef.trim() : null

    // Idempotent on externalRef where the caller supplies one: re-publishing the
    // same roster updates it instead of colliding with @@unique([schoolId, name]),
    // which is what forced callers to mangle names like "Football (Autumn Term)"
    // to stay unique.
    let group: { id: string }
    const existing = ref
      ? await prisma.group.findFirst({ where: { externalRef: ref, schoolId: actor.schoolId }, select: { id: true } })
      : null
    try {
      group = existing
        ? await prisma.group.update({
            where: { id: existing.id },
            data: { name: name.trim(), ...(category ? { categoryId: category.id } : {}) },
            select: { id: true },
          })
        : await prisma.group.create({
            data: {
              name: name.trim(),
              schoolId: actor.schoolId,
              ...(category ? { categoryId: category.id } : {}),
              ...(ref ? { externalRef: ref } : {}),
            },
            select: { id: true },
          })
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        return res.status(409).json({
          error: 'a group with this name already exists',
          // Naming the way out: a caller sending externalRef gets an upsert and
          // never sees this.
          hint: 'send an externalRef to make this call idempotent instead',
        })
      }
      throw error
    }

    if (studentIds.length > 0) {
      await prisma.studentGroupLink.createMany({
        data: studentIds.map(studentId => ({ studentId, groupId: group.id })),
        skipDuplicates: true,
      })
    }

    res.status(201).json({
      id: group.id,
      added: studentIds.length,
      // Present only when something didn't resolve, so a clean call stays clean.
      ...(unknownPupilIds.length > 0 ? { unknownPupilIds } : {}),
    })
  } catch (error) {
    console.error('Error creating partner group:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// One group with its members (display-only: name + class, no other pupil PII).
//
//   GET /api/partner/groups/:id?hub_user_id=<Hub user id>
router.get('/groups/:id', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveStaffActor(hubUserId, schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const group = await prisma.group.findFirst({
      where: { id: req.params.id, schoolId: actor.schoolId },
      include: {
        studentMembers: {
          include: {
            student: {
              select: { hubPupilId: true, firstName: true, lastName: true, class: { select: { name: true } } },
            },
          },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    })

    if (!group) return res.status(404).json({ error: 'not_found' })

    // Members are keyed on the Hub pupil id (Desk's world), never our internal
    // Student id — the boundary map. Display fields only, no other pupil PII.
    res.json({
      id: group.id,
      name: group.name,
      members: group.studentMembers.map(m => ({
        pupilHubId: m.student.hubPupilId,
        studentName: `${m.student.firstName} ${m.student.lastName}`.trim(),
        className: m.student.class?.name ?? null,
      })),
    })
  } catch (error) {
    console.error('Error fetching partner group:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// Rename and/or add/remove members. Every mutation is gated to the actor's
// school; add/remove pupils are Hub pupil ids mapped to same-school Students at
// the boundary; a rename clash → 409.
//
//   PATCH /api/partner/groups/:id
//   { hub_user_id, name?, addPupilHubIds?: string[], removePupilHubIds?: string[] }
router.patch('/groups/:id', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, name, addPupilHubIds, removePupilHubIds } = req.body ?? {}
    const actor = await resolveStaffActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '', schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const { id } = req.params
    const group = await prisma.group.findFirst({
      where: { id, schoolId: actor.schoolId },
      select: { id: true },
    })
    if (!group) return res.status(404).json({ error: 'not_found' })

    // Both sets resolved up front (read-only). Unknown ids are reported rather
    // than rejecting the patch: a roster update naming one pupil who has left
    // should still move the other twenty-nine.
    const add = await resolvePupilHubIds(toIdArray(addPupilHubIds), actor.schoolId)
    const remove = await resolvePupilHubIds(toIdArray(removePupilHubIds), actor.schoolId)
    const addStudentIds = add.studentIds
    const removeStudentIds = remove.studentIds
    const unknownPupilIds = [...new Set([...add.unknownPupilIds, ...remove.unknownPupilIds])]

    if (typeof name === 'string' && name.trim()) {
      try {
        await prisma.group.update({ where: { id }, data: { name: name.trim() } })
      } catch (error: unknown) {
        if ((error as { code?: string })?.code === 'P2002') {
          return res.status(409).json({ error: 'a group with this name already exists' })
        }
        throw error
      }
    }

    if (addStudentIds.length > 0) {
      await prisma.studentGroupLink.createMany({
        data: addStudentIds.map(studentId => ({ studentId, groupId: id })),
        skipDuplicates: true,
      })
    }

    if (removeStudentIds.length > 0) {
      await prisma.studentGroupLink.deleteMany({
        where: { groupId: id, studentId: { in: removeStudentIds } },
      })
    }

    res.json({
      ok: true,
      added: addStudentIds.length,
      removed: removeStudentIds.length,
      ...(unknownPupilIds.length > 0 ? { unknownPupilIds } : {}),
    })
  } catch (error) {
    console.error('Error patching partner group:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// Archive a group (isActive:false) rather than hard-delete — a group may be
// referenced by messages/events. Archived groups drop out of GET /groups.
//
//   DELETE /api/partner/groups/:id  { hub_user_id }
router.delete('/groups/:id', requirePartner, async (req, res) => {
  try {
    const { hub_user_id } = req.body ?? {}
    const actor = await resolveStaffActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '', schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const { id } = req.params
    const group = await prisma.group.findFirst({
      where: { id, schoolId: actor.schoolId },
      select: { id: true },
    })
    if (!group) return res.status(404).json({ error: 'not_found' })

    await prisma.group.update({ where: { id }, data: { isActive: false } })

    res.json({ ok: true })
  } catch (error) {
    console.error('Error archiving partner group:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// Attachment upload for Desk — the requirePartner twin of the native staff
// `POST /messages/upload`. Desk can't store parent-facing files (Connect is the
// record), so it uploads here and passes the returned descriptor as a
// pre-hosted attachment on the inbox-send or broadcast routes. Same validation,
// storage, and 16MB limit as the native route.
//
//   POST /api/partner/inbox/upload  (multipart/form-data, field "file")
//     → { fileName, fileUrl, fileType, fileSize }
router.post('/inbox/upload', requirePartner, attachmentUpload.single('file'), async (req, res) => {
  try {
    const uploaded = req.file
    if (!uploaded) {
      return res.status(400).json({ error: 'file required' })
    }
    const check = checkUpload(uploaded.buffer, uploaded.mimetype, uploaded.originalname, ATTACHMENT_MIME_TYPES)
    if (!check.valid) {
      return res.status(400).json({ error: `file rejected: ${check.reason}` })
    }
    const key = generateKey('message-attachments', uploaded.originalname)
    const fileUrl = await uploadFile(uploaded.buffer, key, uploaded.mimetype)
    res.json({
      fileName: uploaded.originalname,
      fileUrl,
      fileType: uploaded.mimetype,
      fileSize: uploaded.size,
    })
  } catch (error) {
    console.error('Error uploading partner attachment:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// ─── School services: the directory, the register, and the door ──────────────
//
// Desk surfacing of Connect's School Services (Early Bird, Homework Club and
// the like). Three shapes: what the school runs, who is coming, and signing a
// child up at the door.
//
// Reads take the partner token and a school_id, matching /attendance/today.
// Writes additionally need `hub_user_id` — registering a child is an act by a
// named member of staff, and the parent gets told it happened.
//
// Pupils are addressed by Hub pupil id throughout; Connect's internal Student
// id never crosses.

// Mirrors the admin routes' allowlists, and the Prisma enums behind them.
const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'PARTIAL', 'WAIVED']
const REGISTRATION_STATUSES = ['PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED']

/** JSON-array columns on SchoolService (days, eligibleClasses, eligibleYears). */
function parseJsonList(value: string | null): string[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** A registration as Desk sees it. Deliberately NOT schoolServices.ts's
 *  serializeRegistration, which attaches parentName and parentEmail — parent
 *  contact details must never cross the partner surface. */
function serializePartnerRegistration(r: {
  id: string; studentName: string; className: string; days: string
  status: string; paymentStatus: string; notes: string | null; startDate: string | null
  createdAt: Date
  student?: { hubPupilId: string | null } | null
}) {
  return {
    id: r.id,
    pupilId: r.student?.hubPupilId ?? null,
    pupilName: r.studentName,
    className: r.className,
    days: parseJsonList(r.days) ?? [],
    status: r.status,
    paymentStatus: r.paymentStatus,
    // Dietary requirements and allergies, as the parent wrote them. Present
    // because a staff member handing out breakfast needs it — a register that
    // withholds this is less safe than the paper one it replaces.
    notes: r.notes,
    startDate: r.startDate,
    registeredAt: r.createdAt.toISOString(),
  }
}

/** Resolve the school from a Hub or Connect id, the way every partner route does. */
async function partnerSchool(schoolIdParam: string) {
  return prisma.school.findFirst({
    where: { OR: [{ hubSchoolId: schoolIdParam }, { id: schoolIdParam }] },
    select: { id: true },
  })
}

//   GET /api/partner/services?school_id=<hub or connect id>
//     → { services: [...] }
router.get('/services', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) return res.status(400).json({ error: 'school_id required' })

    const school = await partnerSchool(schoolIdParam)
    // Unknown school is not an error — Desk may probe ids we don't host.
    if (!school) return res.json({ services: [] })

    const services = await prisma.schoolService.findMany({
      // DRAFT is the school still writing it; it is not a thing that exists yet.
      where: { schoolId: school.id, status: { not: 'DRAFT' } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { registrations: { where: { status: { not: 'CANCELLED' } } } } },
      },
    })

    res.json({
      services: services.map(sv => ({
        id: sv.id,
        name: sv.name,
        description: sv.description,
        details: sv.details,
        days: parseJsonList(sv.days) ?? [],
        startTime: sv.startTime,
        endTime: sv.endTime,
        location: sv.location,
        collectionLocation: sv.collectionLocation,
        staffName: sv.staffName,
        status: sv.status,
        registrationOpens: sv.registrationOpens?.toISOString() ?? null,
        registrationCloses: sv.registrationCloses?.toISOString() ?? null,
        serviceStarts: sv.serviceStarts,
        serviceEnds: sv.serviceEnds,
        cost: {
          perSession: sv.costPerSession,
          perWeek: sv.costPerWeek,
          perTerm: sv.costPerTerm,
          description: sv.costDescription,
          isFrom: sv.costIsFrom,
          currency: sv.currency,
          paymentMethod: sv.paymentMethod,
        },
        capacity: sv.capacity,
        registeredCount: sv._count.registrations,
        // null capacity means unlimited, which is not the same as "no places".
        spotsLeft: sv.capacity == null ? null : Math.max(0, sv.capacity - sv._count.registrations),
        eligibleClasses: parseJsonList(sv.eligibleClasses),
        eligibleYears: parseJsonList(sv.eligibleYears),
      })),
    })
  } catch (error) {
    console.error('Partner services list error:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

//   GET /api/partner/services/:id/registrations?school_id=&day=Monday
//     → { service: {...}, registrations: [...] }
router.get('/services/:id/registrations', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) return res.status(400).json({ error: 'school_id required' })
    const school = await partnerSchool(schoolIdParam)
    if (!school) return res.status(404).json({ error: 'service_not_found' })

    const service = await prisma.schoolService.findFirst({
      where: { id: req.params.id, schoolId: school.id, status: { not: 'DRAFT' } },
      select: { id: true, name: true, days: true, startTime: true, endTime: true, location: true, collectionLocation: true },
    })
    if (!service) return res.status(404).json({ error: 'service_not_found' })

    const registrations = await prisma.serviceRegistration.findMany({
      where: {
        serviceId: service.id,
        // A cancelled registration is not a register entry.
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true, studentId: true, studentName: true, className: true, days: true,
        status: true, paymentStatus: true, notes: true, startDate: true, createdAt: true,
      },
      orderBy: { studentName: 'asc' },
    })

    // ServiceRegistration.studentId is a bare column with no relation, so the
    // Hub pupil ids — and the Test Student exclusion Desk-facing lists need —
    // come from a second pass rather than an include.
    const students = await prisma.student.findMany({
      where: { id: { in: registrations.map(r => r.studentId) }, isTest: false },
      select: { id: true, hubPupilId: true },
    })
    const hubPupilById = new Map(students.map(st => [st.id, st.hubPupilId]))

    // `day` narrows to one session's register — the Tuesday list, not everyone
    // who is on the books. Filtered here because days is a JSON column.
    const day = typeof req.query.day === 'string' ? req.query.day.trim() : ''
    const rows = registrations
      // A registration whose student is missing here is a Test Student.
      .filter(r => hubPupilById.has(r.studentId))
      .map(r => serializePartnerRegistration({ ...r, student: { hubPupilId: hubPupilById.get(r.studentId) ?? null } }))
    const filtered = day ? rows.filter(r => r.days.includes(day)) : rows

    res.json({
      service: {
        id: service.id,
        name: service.name,
        days: parseJsonList(service.days) ?? [],
        startTime: service.startTime,
        endTime: service.endTime,
        location: service.location,
        collectionLocation: service.collectionLocation,
      },
      registrations: filtered,
    })
  } catch (error) {
    console.error('Partner service registrations error:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

//   POST /api/partner/services/:id/registrations
//     { hub_user_id, school_id, pupil_id, days: [...], notes?, start_date? }
//     → the created registration
router.post('/services/:id/registrations', requirePartner, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const hubUserId = typeof body.hub_user_id === 'string' ? body.hub_user_id.trim() : ''
    if (!hubUserId) return res.status(400).json({ error: 'hub_user_id required' })

    const staff = await resolveStaffActor(hubUserId, schoolHintOf(req))
    if (!staff) return res.status(403).json({ error: 'not_staff' })

    const pupilId = typeof body.pupil_id === 'string' ? body.pupil_id.trim() : ''
    const days = Array.isArray(body.days) ? (body.days as unknown[]).filter(d => typeof d === 'string') as string[] : []
    if (!pupilId) return res.status(400).json({ error: 'pupil_id required' })
    if (days.length === 0) return res.status(400).json({ error: 'days required' })

    const service = await prisma.schoolService.findFirst({
      where: { id: req.params.id, schoolId: staff.schoolId },
    })
    if (!service) return res.status(404).json({ error: 'service_not_found' })
    // Staff may sign a child up outside the parent-facing registration window —
    // that is much of the point of doing it at the door — but never onto a
    // service the school has not finished writing.
    if (service.status === 'DRAFT') {
      return res.status(409).json({ error: 'service_not_open' })
    }

    const student = await prisma.student.findFirst({
      where: { hubPupilId: pupilId, schoolId: staff.schoolId, isTest: false },
      select: { id: true, firstName: true, lastName: true, classId: true, class: { select: { name: true, yearGroup: { select: { name: true } } } } },
    })
    if (!student) return res.status(404).json({ error: 'pupil_not_found' })

    // Same eligibility rules the parent flow enforces — a service restricted to
    // Year 1 is restricted however the registration is made.
    const eligibleClasses = parseJsonList(service.eligibleClasses)
    if (eligibleClasses?.length && !eligibleClasses.includes(student.class.name)) {
      return res.status(409).json({ error: 'pupil_not_eligible', reason: 'class' })
    }
    const eligibleYears = parseJsonList(service.eligibleYears)
    const yearGroupName = student.class.yearGroup?.name
    if (eligibleYears?.length && yearGroupName && !eligibleYears.includes(yearGroupName)) {
      return res.status(409).json({ error: 'pupil_not_eligible', reason: 'year_group' })
    }

    // ServiceRegistration.parentId is required, and the parent is who gets told
    // and who owns it in the parent app. A pupil with no linked guardian cannot
    // be registered from Desk — saying so beats inventing an owner.
    const link = await prisma.parentStudentLink.findFirst({
      where: { studentId: student.id },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!link) return res.status(409).json({ error: 'no_linked_parent' })

    const existing = await prisma.serviceRegistration.findUnique({
      where: { serviceId_studentId: { serviceId: service.id, studentId: student.id } },
    })
    if (existing && existing.status !== 'CANCELLED') {
      return res.status(409).json({ error: 'already_registered' })
    }

    // Over capacity goes to the waitlist rather than being refused, matching the
    // parent flow — Desk should show which one it got.
    let status: 'PENDING' | 'WAITLISTED' = 'PENDING'
    if (service.capacity) {
      const count = await prisma.serviceRegistration.count({
        where: { serviceId: service.id, status: { not: 'CANCELLED' } },
      })
      if (count >= service.capacity) status = 'WAITLISTED'
    }

    const studentName = `${student.firstName} ${student.lastName}`.trim()
    const data = {
      parentId: link.userId,
      studentName,
      className: student.class.name,
      days: JSON.stringify(days),
      status,
      paymentStatus: 'UNPAID' as const,
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
      startDate: typeof body.start_date === 'string' && body.start_date ? body.start_date : null,
    }

    const registration = existing
      ? await prisma.serviceRegistration.update({ where: { id: existing.id }, data })
      : await prisma.serviceRegistration.create({
          data: { ...data, serviceId: service.id, studentId: student.id },
        })

    // The parent is told, exactly as if they had registered themselves. A place
    // taken on their behalf that they never hear about is how a child turns up
    // to a club nobody expected to pay for.
    const paymentRequired = service.paymentMethod === 'ONLINE' || service.paymentMethod === 'CASH_ONLY'
    const title = status === 'WAITLISTED' ? 'Added to waitlist' : 'Registration confirmed'
    const notificationBody = status === 'WAITLISTED'
      ? `${studentName} has been added to the waitlist for ${service.name} by ${staff.name}. We'll let you know if a place opens up.`
      : `${studentName} has been registered for ${service.name} by ${staff.name}.${paymentRequired ? ' Payment is required to confirm the place.' : ''}`

    // sendNotification targets an audience (class / year / group); this is one
    // parent, so it goes the same way the parent-facing registration does.
    await prisma.notification.create({
      data: {
        userId: link.userId,
        type: 'SCHOOL_SERVICE',
        title,
        body: notificationBody,
        resourceType: 'SCHOOL_SERVICE',
        resourceId: service.id,
        schoolId: staff.schoolId,
      },
    })
    const tokens = await prisma.deviceToken.findMany({
      where: { userId: link.userId },
      select: { token: true },
    })
    if (tokens.length > 0) {
      await enqueuePush(staff.schoolId, {
        tokens: tokens.map(t => t.token),
        title,
        body: notificationBody,
        data: { type: 'SCHOOL_SERVICE', resourceType: 'SCHOOL_SERVICE', resourceId: service.id },
      })
    }

    res.status(201).json(
      serializePartnerRegistration({
        ...registration,
        student: { hubPupilId: pupilId },
      }),
    )
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'already_registered' })
    }
    console.error('Partner service registration error:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

//   PATCH /api/partner/services/registrations/:regId
//     { hub_user_id, school_id, payment_status?, status? }
//
// Accounts work in Desk and have no Connect login, so marking a place paid has
// to be possible from there — Connect consumes the sign-up, Desk runs the money
// and the approvals. Both fields are optional; send either or both.
router.patch('/services/registrations/:regId', requirePartner, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const hubUserId = typeof body.hub_user_id === 'string' ? body.hub_user_id.trim() : ''
    if (!hubUserId) return res.status(400).json({ error: 'hub_user_id required' })
    const staff = await resolveStaffActor(hubUserId, schoolHintOf(req))
    if (!staff) return res.status(403).json({ error: 'not_staff' })

    const paymentStatus = typeof body.payment_status === 'string' ? body.payment_status : undefined
    const status = typeof body.status === 'string' ? body.status : undefined
    if (paymentStatus === undefined && status === undefined) {
      return res.status(400).json({ error: 'payment_status or status required' })
    }
    if (paymentStatus !== undefined && !PAYMENT_STATUSES.includes(paymentStatus)) {
      return res.status(400).json({ error: 'invalid_payment_status' })
    }
    if (status !== undefined && !REGISTRATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'invalid_status' })
    }

    const owned = await prisma.serviceRegistration.findFirst({
      where: { id: req.params.regId, service: { schoolId: staff.schoolId } },
      select: { id: true, studentId: true, paymentStatus: true, status: true, service: { select: { name: true } } },
    })
    if (!owned) return res.status(404).json({ error: 'registration_not_found' })

    const updated = await prisma.serviceRegistration.update({
      where: { id: owned.id },
      data: {
        ...(paymentStatus !== undefined && { paymentStatus: paymentStatus as 'UNPAID' }),
        ...(status !== undefined && { status: status as 'PENDING' }),
      },
      select: {
        id: true, studentId: true, studentName: true, className: true, days: true,
        status: true, paymentStatus: true, notes: true, startDate: true, createdAt: true,
      },
    })

    // Money changing state is the kind of thing someone asks about months later,
    // and the person who did it has no Connect session to trace back to. Written
    // against the RESOLVED actor, the way every partner write does it — the
    // shared logAudit helper needs a req.user a partner request never has.
    await prisma.auditLog.create({
      data: {
        userId: staff.id,
        userName: staff.name,
        action: 'UPDATE',
        resourceType: 'SCHOOL_SERVICE',
        resourceId: owned.id,
        metadata: { via: 'partner', service: owned.service.name },
        changes: {
          ...(paymentStatus !== undefined && { paymentStatus: { from: owned.paymentStatus, to: paymentStatus } }),
          ...(status !== undefined && { status: { from: owned.status, to: status } }),
        },
        schoolId: staff.schoolId,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
      },
    })

    const student = await prisma.student.findFirst({
      where: { id: updated.studentId },
      select: { hubPupilId: true },
    })
    res.json(serializePartnerRegistration({ ...updated, student: { hubPupilId: student?.hubPupilId ?? null } }))
  } catch (error) {
    console.error('Partner registration update error:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

//   DELETE /api/partner/services/registrations/:regId?hub_user_id=&school_id=
router.delete('/services/registrations/:regId', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    if (!hubUserId) return res.status(400).json({ error: 'hub_user_id required' })
    const staff = await resolveStaffActor(hubUserId, schoolHintOf(req))
    if (!staff) return res.status(403).json({ error: 'not_staff' })

    const registration = await prisma.serviceRegistration.findFirst({
      where: { id: req.params.regId, service: { schoolId: staff.schoolId } },
      select: { id: true, status: true },
    })
    if (!registration) return res.status(404).json({ error: 'registration_not_found' })

    // Cancelled, not deleted — the same thing the parent-facing cancel does, so
    // the history of who was on the books survives.
    if (registration.status !== 'CANCELLED') {
      await prisma.serviceRegistration.update({
        where: { id: registration.id },
        data: { status: 'CANCELLED' },
      })
    }
    res.json({ message: 'Registration cancelled' })
  } catch (error) {
    console.error('Partner service cancel error:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// ─── Transport: Desk pushes a leg's assignments ──────────────────────────────
//
// Desk is the system of record for the bus roster; Connect stores and displays
// it to a child's own guardians. See docs/adr/0001 for why this lands flat and
// why there is no staff-facing transport surface in Connect.
//
//   PUT /api/partner/transport/assignments
//     { school_id, leg: 'AM'|'PM',
//       routes: [ { id, name, code?,
//                   stops: [ { id, name, time_local, hide_stop_name?,
//                              pupils: [ { hub_pupil_id } ] } ] } ] }
//     → { updated, removed, skippedUnknownPupil }
//
// Full replacement for that leg, and idempotent: re-sending the same payload is
// a no-op beyond timestamps. Anything absent is DELETED, not flagged — a
// retained row here is a child's home address nobody meant to keep.
router.put('/transport/assignments', requirePartner, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const schoolIdParam = typeof body.school_id === 'string' ? body.school_id.trim() : ''
    if (!schoolIdParam) return res.status(400).json({ error: 'school_id required' })

    const leg = body.leg
    if (leg !== 'AM' && leg !== 'PM') return res.status(400).json({ error: "leg must be 'AM' or 'PM'" })

    const school = await partnerSchool(schoolIdParam)
    if (!school) return res.status(404).json({ error: 'school_not_found' })

    // Flatten the route → stop → pupil tree into the one line each child needs.
    // A pupil listed twice in a leg keeps the first stop; the alternative is a
    // unique-constraint failure that fails the whole push over one bad row.
    type Row = { hubPupilId: string; routeName: string; routeCode: string | null; stopName: string; timeLocal: string; hideStopName: boolean }
    const rows = new Map<string, Row>()
    const routes = Array.isArray(body.routes) ? body.routes : []
    for (const route of routes as Array<Record<string, unknown>>) {
      const routeName = typeof route?.name === 'string' ? route.name.trim() : ''
      if (!routeName) continue
      const routeCode = typeof route?.code === 'string' && route.code.trim() ? route.code.trim() : null
      const stops = Array.isArray(route?.stops) ? route.stops : []
      for (const stop of stops as Array<Record<string, unknown>>) {
        const hideStopName = stop?.hide_stop_name === true
        const stopName = typeof stop?.name === 'string' ? stop.name.trim() : ''
        const timeLocal = typeof stop?.time_local === 'string' ? stop.time_local.trim() : ''
        // A suppressed stop legitimately arrives with no name. Desk withholds
        // the address rather than sending it beside a "don't show this" flag —
        // stronger than this brief asked for, because the address then never
        // enters another system's database or logs at all.
        //
        // So a missing name is only a reason to skip when the stop is NOT
        // suppressed. Requiring one unconditionally silently dropped every
        // pupil at a suppressed stop: the children of separated families, who
        // are exactly the ones the flag exists to protect, would have got no
        // bus information whatsoever.
        if (!timeLocal) continue
        if (!stopName && !hideStopName) continue
        const pupils = Array.isArray(stop?.pupils) ? stop.pupils : []
        for (const pupil of pupils as Array<Record<string, unknown>>) {
          const hubPupilId = typeof pupil?.hub_pupil_id === 'string' ? pupil.hub_pupil_id.trim() : ''
          if (!hubPupilId || rows.has(hubPupilId)) continue
          rows.set(hubPupilId, { hubPupilId, routeName, routeCode, stopName, timeLocal, hideStopName })
        }
      }
    }

    // Resolve Hub pupil ids to this school's children. A pupil Connect has not
    // synced yet is counted and skipped, never guessed at.
    const students = await prisma.student.findMany({
      where: { hubPupilId: { in: [...rows.keys()] }, schoolId: school.id },
      select: { id: true, hubPupilId: true },
    })
    const studentIdByHubId = new Map(students.map(st => [st.hubPupilId as string, st.id]))
    const skippedUnknownPupil = rows.size - studentIdByHubId.size

    const keptStudentIds: string[] = []
    for (const [hubPupilId, row] of rows) {
      const studentId = studentIdByHubId.get(hubPupilId)
      if (!studentId) continue
      keptStudentIds.push(studentId)
      const data = {
        routeName: row.routeName,
        routeCode: row.routeCode,
        stopName: row.stopName,
        timeLocal: row.timeLocal,
        hideStopName: row.hideStopName,
      }
      await prisma.transportAssignment.upsert({
        where: { studentId_leg: { studentId, leg } },
        create: { ...data, studentId, leg, schoolId: school.id },
        update: data,
      })
    }

    // Everything for this leg that the push did not mention is gone from the
    // roster, so it goes from here. Hard delete: see the migration's note.
    const removed = await prisma.transportAssignment.deleteMany({
      where: { schoolId: school.id, leg, studentId: { notIn: keptStudentIds } },
    })

    // Counts only — never a stop name or a child's name.
    logger.info(
      { schoolId: school.id, leg, updated: keptStudentIds.length, removed: removed.count, skippedUnknownPupil },
      'transport assignments replaced',
    )

    res.json({ updated: keptStudentIds.length, removed: removed.count, skippedUnknownPupil })
  } catch (error) {
    console.error('Partner transport push error:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
