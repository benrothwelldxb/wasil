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
import { singleAttachment } from '../middleware/attachmentUpload.js'
import { marked } from 'marked'
import prisma from '../services/prisma.js'
import { requirePartner } from '../middleware/partnerAuth.js'
import { resolveHubStaffMembership } from '../services/hubStaffActor.js'
import { todayInTimezone, parseWallClockForSchool, parseExpiryForSchool } from '../services/dateTime.js'
import { sendPushNotification, removeInvalidTokens } from '../services/firebase.js'
import { getPushBadgeCount } from '../services/unreadCount.js'
import { resolveIlsa } from '../services/ilsaResolution.js'
import { withdrawMessage, WITHDRAW_WINDOW_MS } from '../services/messageWithdrawal.js'
import {
  normaliseMeetings, timeSlotFor, genderFor, activityTypeFor, capacityFor,
  statusFor, parseVersion, isNewer, hubYearGroupIdsOf,
} from '../services/activityPush.js'
import { sendNotification, resolveAudienceParentIds } from '../services/notify.js'
import { signalAdminNotice } from '../services/adminNotices.js'
import logger from '../services/logger.js'
import { enqueuePush } from '../services/outbox.js'
import { notifyAttendanceReviewed } from '../services/attendanceReviewNotify.js'
import { sanitizeRichText } from '../services/htmlSanitizer.js'
import { uploadFile, generateKey } from '../services/storage.js'
import { checkUpload, ATTACHMENT_MIME_TYPES } from '../services/uploadValidation.js'
import { ALLOWED_REACTION_EMOJIS } from './inbox.js'
import { refreshServiceGroup, refreshServiceGroupsForSchool } from '../services/serviceGroups.js'

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Attachment upload — same allowlist + limits as the native staff route
// (messages.ts). Desk authors in markdown everywhere; on the broadcast path we
// convert that markdown to HTML and run it through the SAME sanitizer the admin
// composer uses, so a partner broadcast stores the same safe-HTML content model
// as a native one (bold/italic/lists survive; anything unsafe is discarded).

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
  // The rules live in one place, shared with the ILSA sync, so the sync can
  // check that an ILSA it just provisioned can actually message — and so the
  // two can never disagree about what "resolvable" means.
  const r = await resolveIlsa(hubUserId)
  return r.ok ? r.actor : null
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
    // Unknown user is not an error — Desk polls many ids, some unmapped, and a
    // 403 here would turn ordinary polling into a stream of failures.
    //
    // But a bare `{ unread: 0 }` reads exactly like a real zero, so an ILSA who
    // cannot be resolved at all shows a calm empty badge instead of a problem —
    // which is how one of them stayed unresolvable for weeks while every other
    // route 403'd. `known: false` is the difference between "nothing waiting"
    // and "we have never heard of this person".
    if (!staff) return res.json({ unread: 0, known: false })

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
    res.json({ unread, known: true })
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
type ThreadRowMessages = { messages: { senderId: string; readAt: Date | null; createdAt: Date }[] }
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
  const inbound = c.messages.filter((m) => m.senderId !== actorId)
  const unread = useParticipant
    ? inbound.filter((m) => (myPart!.lastReadAt ? m.createdAt > myPart!.lastReadAt : true)).length
    : inbound.filter((m) => m.readAt === null).length

  // "Have they read the one I sent?" — the actor's own most recent message and
  // whether the parent has opened the thread since. Scannable from the list, so
  // a teacher chasing a reply can see which families have seen the question and
  // which have not, without opening every thread.
  const mine = c.messages.filter((m) => m.senderId === actorId)
  const lastMine = mine.length > 0
    ? mine.reduce((latest, m) => (m.createdAt > latest.createdAt ? m : latest))
    : null
  return {
    id: c.id,
    parentName: c.parent.name,
    studentName: c.student ? `${c.student.firstName} ${c.student.lastName}`.trim() : null,
    hubClassId: c.student?.class?.hubClassId ?? null,
    className: c.student?.class?.name ?? null,
    lastMessageText: c.lastMessageText,
    lastMessageAt: c.lastMessageAt.toISOString(),
    // Absent when the actor has never written in this thread — which is a
    // different thing from having written and not been read, and must not
    // render as "unread".
    yourLastMessage: lastMine
      ? { sentAt: lastMine.createdAt.toISOString(), readAt: lastMine.readAt?.toISOString() ?? null }
      : undefined,
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
            where: { deletedAt: null },
            select: { senderId: true, readAt: true, createdAt: true },
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

    // Narrow to one child, for a "message this family" jump from another app
    // (SEND's Inclusion record) into this staff member's threads about that
    // pupil. A Hub pupil id, symmetrical with `class_id` above — no Connect
    // thread id needs to leave Connect, and a child normally has SEVERAL
    // threads (one per staff member or office contact), so this is a filter
    // rather than a lookup of "the" thread, which does not exist.
    //
    // Same fail-closed rule as class: an unknown pupil returns nothing, never
    // an unfiltered inbox. Staff-branch only — an ILSA already has exactly one
    // pupil, so there is nothing for it to narrow.
    const pupilIdParam = typeof req.query.pupil_id === 'string' ? req.query.pupil_id.trim() : ''
    if (pupilIdParam) {
      const pupil = await prisma.student.findFirst({
        where: { hubPupilId: pupilIdParam, schoolId: staff.schoolId },
        select: { id: true },
      })
      if (!pupil) return res.json({ threads: [] })
      where.studentId = pupil.id
    }

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        ...THREAD_LIST_INCLUDE,
        messages: {
          // Both directions now: inbound drives the unread count, outbound
          // answers "have they read mine yet".
          where: { deletedAt: null },
          select: { senderId: true, readAt: true, createdAt: true },
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
        // Additional staff CC'd onto this thread (empty on an ordinary thread,
        // and always empty on an ILSA thread — no teacher is ever on one).
        //
        // Objects rather than names, matching POST /inbox/threads/:id/staff.
        // `userId` is not decoration: a picker offering colleagues to add has to
        // exclude the ones already here, and doing that by display name fails
        // the day a school has two people called Rob Davies — silently, by
        // hiding the wrong person from the list.
        ccStaff: conversation.participants
          .filter((p) => p.role === 'STAFF')
          .map((p) => ({ userId: p.userId, name: p.user.name })),
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
          // When the OTHER party opened the thread after this was sent. On a
          // message the actor sent, that is the parent — which is the whole
          // question. Null means not yet.
          //
          // It survives a withdrawal: whether a parent saw something before it
          // was taken back is exactly what a teacher needs to know afterwards,
          // and is the one fact about a tombstone worth keeping.
          readAt: m.readAt?.toISOString() ?? null,
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
          // `messageId` so a withdrawal in Connect can find and rewrite this
          // row — a message sent from Desk is withdrawn through Connect, so
          // the notification it raised has to be addressable the same way.
          data: { conversationId: id, messageId: message.id, route: `/inbox/${id}` },
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
      // An ILSA's thread is pinned to the primary guardian. A caller naming a
      // DIFFERENT guardian is refused rather than quietly given guardian A —
      // silently substituting the recipient of a message about a child is the
      // worst available outcome, and matches the studentId mismatch above.
      if (parentId && parentId !== guardianId) {
        return res.status(400).json({ error: 'could not resolve parent' })
      }

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
        where: {
          id: parentId,
          schoolId: staff.schoolId,
          role: 'PARENT',
          // A parent of THIS child, not merely a parent at this school. Without
          // the link check, any school parent could be paired with any school
          // pupil, and the thread is created carrying both — so a caller bug
          // puts one family's child in front of another family. Nothing
          // exploited it while no caller sent parentId; returning every
          // guardian on the recipients route makes it a live path, so it
          // closes in the same change.
          ...(studentId ? { studentLinks: { some: { studentId } } } : {}),
        },
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


// Put a colleague on a thread: an inclusion teacher bringing in the SENDCO, a
// class teacher bringing in a head of year.
//
//   POST /api/partner/inbox/threads/:id/staff   { hub_user_id, userId }
//   → { ccStaff: [{ userId, name }] }
//
// WHO MAY BE ADDED: any STAFF/ADMIN/SUPER_ADMIN at this school. Deliberately
// NOT isStaffContactableByParent, which gates the parent-initiated CC on the
// parent's own children's classes and timetabled specialists. That set is built
// from the PARENT's relationships, and this caller's whole purpose is involving
// people the parent has no timetabled relationship with — a SENDCO, a head of
// year, a safeguarding lead. Applying it here would refuse exactly the
// colleagues the feature exists to add, and refuse them with an error about the
// parent. Ben's decision, taken as a policy question rather than a code one.
//
// The narrowing that does the work is the CALLER, not the target: `staffThreadWhere`
// requires the actor to be the thread's staff party or already CC'd onto it. A
// teacher who can already read the conversation showing it to a colleague is an
// ordinary professional act; a teacher reaching into a thread she is not on is
// the thing to prevent, and that is what is prevented.
//
// What makes it fair rather than merely convenient is downstream: `addedById`
// is recorded, and the parent's thread view already renders who added whom, so
// a new name arrives labelled as the school's doing rather than unexplained.
// The parent can also remove a CC'd staff member through the existing
// parent-side route, so this is not one-way.
//
// No DELETE here on purpose. The parent can already remove someone, and a
// teacher un-CCing another teacher mid-conversation is a different feature
// nobody has asked for.
router.post('/inbox/threads/:id/staff', requirePartner, async (req, res) => {
  try {
    const { id } = req.params
    const { hub_user_id, userId } = req.body ?? {}
    const actor = await resolveActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '', schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    // An ILSA thread is private to the one guardian by design (ADR 0006), and
    // an ILSA is engaged by the parent rather than employed by the school.
    // Refused outright rather than ignored, so Desk cannot believe it CC'd
    // someone onto a thread it did not.
    if (actor.kind === 'ILSA') return res.status(403).json({ error: 'forbidden' })

    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'userId is required' })
    }
    const staff = actor.staff

    const conversation = await prisma.conversation.findFirst({
      where: staffThreadWhere(id, staff),
      include: {
        participants: { select: { userId: true, role: true, user: { select: { name: true } } } },
      },
    })
    // 404 on a miss, never 403 — a staff member who cannot see a thread is not
    // told it exists.
    if (!conversation) return res.status(404).json({ error: 'not_found' })

    const ccStaff = (c: typeof conversation) =>
      c.participants
        .filter((pt) => pt.role === 'STAFF')
        .map((pt) => ({ userId: pt.userId, name: pt.user.name }))

    if (userId === conversation.staffId) {
      return res.status(400).json({ error: 'That staff member is already on this conversation' })
    }
    // Idempotent: adding someone already there is a success with no second row.
    if (conversation.participants.some((pt) => pt.userId === userId)) {
      return res.json({ ccStaff: ccStaff(conversation) })
    }

    // Any colleague at this school — but a colleague. An ILSA is pupil-scoped
    // and is not staff (ADR 0006); a parent is obviously not one either, and
    // the role check is what stops a mistyped id putting a family on the thread.
    const target = await prisma.user.findFirst({
      where: {
        id: userId,
        schoolId: staff.schoolId,
        role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },
        isTest: false,
      },
      select: { id: true },
    })
    if (!target) {
      return res.status(400).json({ error: 'Not a staff member at this school' })
    }

    await prisma.conversationParticipant.create({
      data: {
        conversationId: id,
        userId,
        role: 'STAFF',
        // Who did it. The parent's thread view reads this to say the school
        // added a colleague rather than leaving a name to be worked out.
        addedById: staff.id,
      },
    })

    // Audited: the question after something goes wrong is who decided, and the
    // answer should not require reading the database.
    await prisma.auditLog.create({
      data: {
        userId: staff.id,
        userName: staff.name,
        action: 'CREATE',
        resourceType: 'CONVERSATION',
        resourceId: id,
        metadata: { event: 'STAFF_CC_ADDED_BY_STAFF', addedUserId: userId },
        schoolId: staff.schoolId,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
      },
    })

    const refreshed = await prisma.conversation.findFirst({
      where: { id },
      include: {
        participants: { select: { userId: true, role: true, user: { select: { name: true } } } },
      },
    })
    res.json({ ccStaff: refreshed ? ccStaff(refreshed as typeof conversation) : [] })
  } catch (error) {
    console.error('Error adding staff to partner thread:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})


// 4b. Add a second guardian to a thread — the joint-guardian conversation.
//
// Desk asked for this once and withdrew it, on the grounds that co-guardian
// sharing is the parent's own opt-in and a teacher must not make it for them.
// Ben has reversed that: for most families a joint message is the normal and
// courteous thing, and the old design made the ordinary case impossible in
// order to protect the exceptional one.
//
// The safeguard has not disappeared, it has MOVED — from the system to a named
// person ticking a box in Desk. That is a weaker guarantee, deliberately
// accepted, and it is why the provenance half of this matters more than the
// route: `addedById` records the staff member, and the parent app reads it back
// so a mother sees "your child's teacher added Omar" rather than meeting her
// co-guardian for the first time in a reply.
//
//   POST /api/partner/inbox/threads/:id/guardians
//   { hub_user_id, userId }  →  { sharedWith: ["Omar Hassan"] }
//
// Idempotent: adding someone already on the thread is a no-op success, as the
// parent-side route is.
router.post('/inbox/threads/:id/guardians', requirePartner, async (req, res) => {
  try {
    const { id } = req.params
    const { hub_user_id, userId, jointConfirmed } = req.body ?? {}
    const actor = await resolveActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '', schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    // An ILSA thread is private to the one guardian by design (ADR 0006), and
    // an ILSA is engaged by that parent rather than employed by the school.
    // Refused outright rather than ignored — quietly doing nothing here would
    // leave Desk believing it had shared a thread it had not.
    if (actor.kind === 'ILSA') return res.status(403).json({ error: 'forbidden' })

    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'userId is required' })
    }

    // Was a named person asked before two guardians are put in a thread
    // together? Required, and stored — see the column comment. Strictly `true`:
    // a truthy string or a 1 is not a confirmation, and a caller that has not
    // built the tick yet should be refused rather than half-accepted.
    if (jointConfirmed !== true) {
      return res.status(400).json({ error: 'jointConfirmed is required' })
    }
    const staff = actor.staff

    // The caller must be ON the thread — its staff party, or CC'd onto it. A
    // teacher may not join two guardians into somebody else's conversation.
    // `kind: 'STAFF'` also keeps an ILSA thread unreachable from here even if
    // the actor resolution above ever changed.
    const conversation = await prisma.conversation.findFirst({
      where: staffThreadWhere(id, staff),
      include: {
        participants: { select: { userId: true, role: true, user: { select: { name: true } } } },
      },
    })
    // 404 on a miss, never 403 — the same rule as every other thread route:
    // a staff member who cannot see a thread is not told it exists.
    if (!conversation) return res.status(404).json({ error: 'not_found' })

    if (!conversation.studentId) {
      return res.status(400).json({ error: 'This conversation is not about a student and cannot be shared' })
    }
    if (userId === conversation.parentId) {
      return res.status(400).json({ error: 'Cannot add the primary parent' })
    }

    const sharedNames = (c: typeof conversation) =>
      c.participants.filter((p) => p.role !== 'STAFF').map((p) => p.user.name)

    // Already there: success, and no second row.
    if (conversation.participants.some((p) => p.userId === userId)) {
      return res.json({ sharedWith: sharedNames(conversation) })
    }

    // A guardian OF THIS CHILD, not merely a parent at this school. Desk only
    // ever sends an id from that pupil's own `guardians` array, so this is the
    // backstop rather than the filter — the thing that stops a Desk-side bug
    // putting one family's correspondence in front of another.
    const link = await prisma.parentStudentLink.findFirst({
      where: {
        userId,
        studentId: conversation.studentId,
        user: { schoolId: staff.schoolId, role: 'PARENT' },
      },
      select: { id: true },
    })
    if (!link) {
      return res.status(400).json({ error: 'User is not a linked guardian of this student' })
    }

    await prisma.conversationParticipant.create({
      data: {
        conversationId: id,
        userId,
        role: 'PARENT',
        // The acting STAFF member, which is what makes this visible downstream.
        // Every row before this one held a parent.
        addedById: staff.id,
        jointConfirmed: true,
      },
    })

    // Audited. The question after something goes wrong is who decided, and the
    // answer should not require reading the database.
    await prisma.auditLog.create({
      data: {
        userId: staff.id,
        userName: staff.name,
        action: 'CREATE',
        resourceType: 'CONVERSATION',
        resourceId: id,
        metadata: {
          event: 'GUARDIAN_ADDED_BY_STAFF',
          addedUserId: userId,
          studentId: conversation.studentId,
          jointConfirmed: true,
        },
        schoolId: staff.schoolId,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
      },
    })

    const refreshed = await prisma.conversation.findFirst({
      where: { id },
      include: {
        participants: { select: { userId: true, role: true, user: { select: { name: true } } } },
      },
    })
    res.json({ sharedWith: refreshed ? sharedNames(refreshed as typeof conversation) : [] })
  } catch (error) {
    console.error('Error adding guardian to partner thread:', error)
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
// yet" rather than "unavailable". `parentName` is the first ParentStudentLink,
// exactly as the start-thread route resolves it, so every returned studentId
// round-trips.
//
// Each row carries BOTH ids, because they answer different questions and a
// caller needs both at once: `studentId` is Connect's own, and is what
// POST /inbox/threads wants back; `hubPupilId` is the same child on the Hub
// wire, and is what an inbound deep link carries (see the pupil filter on
// /inbox/threads). Without the second, a caller holding a Hub id has no way to
// bridge it to a row here — so a "message this family" jump from another app
// lands on a composer that cannot name the child it was opened for, and the
// staff member re-finds them in a type-ahead, which is the step the jump
// existed to remove. Null for a pupil Connect created itself; explicitly null,
// never absent, so "this child has no Hub id" and "this build doesn't send one"
// don't read the same.
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
          hubPupilId: true,
          firstName: true,
          lastName: true,
          class: { select: { name: true } },
          parentLinks: {
            select: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
            // Still ONE, unlike the staff branch below. An ILSA reaches the
            // primary guardian and nobody else (ADR 0006) — a second guardian
            // comes to them via the parent's own opt-in sharing, or by starting
            // their own thread. Listing guardians an ILSA cannot write to would
            // advertise a recipient the start-thread route then refuses.
            take: 1,
          },
        },
      })
      // Link points at a pupil we can't load (e.g. mid-unlink) → empty, not error.
      const recipients = student
        ? [{
            studentId: student.id,
            hubPupilId: student.hubPupilId,
            studentName: `${student.firstName} ${student.lastName}`.trim(),
            className: student.class?.name ?? null,
            parentName: student.parentLinks[0]?.user?.name ?? null,
            // One entry, or none — see the `take: 1` above.
            guardians: student.parentLinks.map((l) => ({ userId: l.user.id, name: l.user.name })),
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
        hubPupilId: true,
        firstName: true,
        lastName: true,
        class: { select: { name: true } },
        parentLinks: {
          // EVERY guardian, not just the first. A teacher who needs to tell the
          // second guardian something had no route to it except asking the
          // first to pass it on — the row carried one unnamed-in-id name, so a
          // composer could not offer anyone else.
          select: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
    })

    const recipients = students.map((s) => ({
      studentId: s.id,
      hubPupilId: s.hubPupilId,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      className: s.class?.name ?? null,
      // Unchanged, and deliberately: the first link by createdAt, exactly as
      // before, so a caller that hasn't adopted `guardians` yet is unaffected.
      parentName: s.parentLinks[0]?.user?.name ?? null,
      // `guardians[0]` IS that same first-linked guardian, in the same order —
      // a caller relies on the first entry meaning "who you'd have got before".
      // A pupil with no links gets [], matching parentName: null.
      guardians: s.parentLinks.map((l) => ({ userId: l.user.id, name: l.user.name })),
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

// A pupil's school↔parent correspondence, for an inspection evidence pack.
//
//   GET /api/partner/oversight/parent-threads?hub_user_id=<admin>&pupil_id=<hubPupilId>
//     [&school_id=<Hub school id | Connect id>]
//
// The same gate as /oversight/ilsa-threads above, for the same reason: this is a
// bulk read of a family's private correspondence, so it is admin-only, scoped to
// one pupil in the admin's own school, and audited with a named actor every
// time. `hub_user_id` MUST resolve to an ADMIN/SUPER_ADMIN (any other actor →
// 403); an unknown pupil → 404; a `school_id` resolving elsewhere → 403.
//
// Deliberately NOT the working inbox. GET /inbox/threads gives a staff member
// their OWN threads and gives admins school-wide only as an explicit, logged
// sweep — a principal does not get everyone's conversations just by opening
// Desk. An evidence pack IS that sweep, narrowed to one child, so it inherits
// that gate rather than reusing the inbox.
//
// `kind: 'STAFF'` — ILSA threads are excluded and must stay excluded. A parent↔
// ILSA thread is private by design (ADR 0006), and an ILSA is engaged and paid
// by the pupil's parent rather than employed by the school: their conversation
// is not the school's correspondence and has no business in a school's
// inspection evidence. The ILSA oversight route above exists for the one case
// that IS the school's business — safeguarding — and audits itself separately.
router.get('/oversight/parent-threads', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveStaffActor(hubUserId, schoolHintOf(req))
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
      select: {
        id: true, firstName: true, lastName: true, externalId: true,
        class: { select: { name: true } },
      },
    })
    if (!pupil) return res.status(404).json({ error: 'not_found' })

    const threads = await prisma.conversation.findMany({
      where: { schoolId: actor.schoolId, kind: 'STAFF', studentId: pupil.id },
      include: {
        parent: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        participants: { select: { userId: true, role: true, user: { select: { name: true } } } },
        messages: {
          include: { sender: { select: { name: true } }, attachments: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    // AUDIT first-class, not a side note: this is the record that a named person
    // pulled a family's correspondence on a given day, which is what makes the
    // pack evidence rather than an export.
    await prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        action: 'CREATE',
        // The existing type for "an admin read staff↔parent threads beyond
        // their own". This IS that act, narrowed to one pupil, so it belongs in
        // the same bucket rather than inventing a type (and a migration) to say
        // the same thing. `event` is what tells the two apart in the log.
        resourceType: 'CONVERSATION',
        resourceId: pupil.id,
        metadata: {
          event: 'EVIDENCE_ACCESS',
          pupilHubId,
          threadCount: threads.length,
          messageCount: threads.reduce((n, c) => n + c.messages.length, 0),
        },
        schoolId: actor.schoolId,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
      },
    })

    // Identify the pupil, for a consumer that cross-checks before printing this
    // into a document with a child's name on the cover. The three signals are
    // NOT equally strong and a caller should not treat them as if they were:
    //
    //   misId (the school MIS Student ID / UPN, from Hub) is the one worth
    //     alarming on. It is a DIFFERENT field from the one this was looked up
    //     by, and a consumer mirroring Hub holds it independently — so a
    //     mismatch means the two mirrors disagree about who this pupil is.
    //     Null when Hub has never sent us one, which is "cannot cross-check",
    //     not "mismatch".
    //
    //   hubPupilId is an echo of what was asked for, and cannot be anything
    //     else: the lookup matched on it. It catches a request paired with the
    //     wrong response — a cache, a proxy, a client bug — and nothing about
    //     scoping. Cheap, and worth exactly that much.
    //
    //   studentName and className are for a human reading the output. They
    //     drift benignly between two mirrors: Hub carries a preferredName that
    //     Connect does not store, so a child enrolled as Alexander who goes by
    //     Alex differs here for good reasons on both sides, forever. A class
    //     changes mid-year, legitimately. Blocking on these is defensible;
    //     raising a safeguarding alarm on them is not, and a check that cries
    //     wolf is switched off before the case it exists for arrives.
    res.json({
      pupil: {
        hubPupilId: pupilHubId,
        misId: pupil.externalId,
        studentName: `${pupil.firstName} ${pupil.lastName}`.trim(),
        className: pupil.class?.name ?? null,
      },
      threads: threads.map((c) => ({
        id: c.id,
        staffName: c.staff.name,
        guardianName: c.parent.name,
        // Co-guardians the thread was shared with, and CC'd staff, kept apart:
        // "who else could see this" is a different fact from "who else at the
        // school was on it", and a pack that merges them misreports both.
        sharedWith: c.participants.filter((p) => p.role !== 'STAFF').map((p) => p.user.name),
        // Objects, as on the thread detail and the add route — see the note there.
        ccStaff: c.participants
          .filter((p) => p.role === 'STAFF')
          .map((p) => ({ userId: p.userId, name: p.user.name })),
        createdAt: c.createdAt.toISOString(),
        lastMessageAt: c.lastMessageAt.toISOString(),
        messages: c.messages.map((m) => {
          // Withdrawn messages stay as tombstones — blank content, the sender
          // kept. A pack may well choose not to print them, but a message that
          // was sent and withdrawn happened, and silently dropping the row
          // would make the record of the correspondence untrue.
          const isDeleted = !!m.deletedAt
          return {
            id: m.id,
            senderName: m.sender.name,
            senderRole: m.senderId === c.staffId ? 'STAFF' : 'GUARDIAN',
            content: isDeleted ? '' : m.content,
            deleted: isDeleted || undefined,
            deletedAt: m.deletedAt?.toISOString() || null,
            sentAt: m.createdAt.toISOString(),
            // Names only. A pack needs to say a file was sent, not to keep a
            // withdrawn or private attachment fetchable from an evidence PDF.
            attachments: isDeleted ? [] : m.attachments.map((a) => ({ name: a.fileName, type: a.fileType, size: a.fileSize })),
          }
        }),
      })),
    })
  } catch (error) {
    console.error('Error building partner parent-thread evidence:', error)
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



/** Shared validation for the two run endpoints, so a mark and its withdrawal
 *  can never disagree about which row they mean. */
async function parseRunBody(
  req: { body?: unknown },
): Promise<
  | { error: string; status: number }
  | { school: { id: string }; routeId: string; leg: 'AM' | 'PM' | 'FRI_PM'; dateLocal: string; markedAt: Date | null; dueAt: string | null }
> {
  const body = (req.body ?? {}) as Record<string, unknown>
  const schoolIdParam = typeof body.school_id === 'string' ? body.school_id.trim() : ''
  if (!schoolIdParam) return { error: 'school_id required', status: 400 }

  const routeId = typeof body.route_id === 'string' ? body.route_id.trim() : ''
  if (!routeId) return { error: 'route_id required', status: 400 }

  const leg = body.leg
  if (leg !== 'AM' && leg !== 'PM' && leg !== 'FRI_PM') {
    return { error: "leg must be 'AM', 'PM' or 'FRI_PM'", status: 400 }
  }

  const dateLocal = typeof body.date_local === 'string' ? body.date_local.trim() : ''
  if (!DATE_RE.test(dateLocal)) return { error: 'date_local must be YYYY-MM-DD', status: 400 }

  // An unparseable instant is rejected rather than silently becoming "now":
  // the whole value of this row is that it says when the bus actually went.
  let markedAt: Date | null = null
  if (body.marked_at !== undefined && body.marked_at !== null) {
    if (typeof body.marked_at !== 'string') return { error: 'marked_at must be an ISO instant', status: 400 }
    const parsedAt = new Date(body.marked_at)
    if (Number.isNaN(parsedAt.getTime())) return { error: 'marked_at must be an ISO instant', status: 400 }
    markedAt = parsedAt
  }
  // A marked_at that is absent or explicitly null is a WITHDRAWAL, not an
  // error — Desk's brief allows either spelling, and the POST handler treats a
  // null mark as a delete.

  // A wall clock on a route, never an instant — "15:40" as the driver reads it.
  const dueAt = typeof body.due_at === 'string' && body.due_at.trim() ? body.due_at.trim() : null

  const school = await partnerSchool(schoolIdParam)
  if (!school) return { error: 'school_not_found', status: 404 }

  return { school, routeId, leg, dateLocal, markedAt, dueAt }
}

/**
 * Notify the guardians of the children on one bus.
 *
 * The audience is the assignment table joined by routeId + leg, so it is
 * exactly the families whose child rides that bus on that leg — not a class,
 * not the school. A child with no assignment for the leg hears nothing.
 *
 * The body carries the wording, because a push has no app to do it: AM arrives,
 * PM and FRI_PM depart. Lateness is stated only where Desk recorded an expected
 * time; with none, the honest sentence simply ends.
 */
async function notifyTransportRun(run: {
  schoolId: string
  routeId: string
  leg: 'AM' | 'PM' | 'FRI_PM'
  markedAt: Date
  dueAt: string | null
}): Promise<void> {
  const assignments = await prisma.transportAssignment.findMany({
    where: { schoolId: run.schoolId, routeId: run.routeId, leg: run.leg },
    select: { studentId: true, routeName: true },
  })
  if (assignments.length === 0) return

  const school = await prisma.school.findUnique({
    where: { id: run.schoolId },
    select: { transportEnabled: true, timezone: true },
  })
  // A school still testing transport in Desk must not have its parents told
  // anything. The read is gated the same way; this is the same gate on the push.
  if (!school?.transportEnabled) return

  const routeName = assignments[0].routeName
  const at = formatWallClock(run.markedAt, school.timezone ?? 'UTC')
  const verb = run.leg === 'AM' ? 'arrived at school' : 'left school'
  const lateness = run.dueAt ? describeLateness(at, run.dueAt) : null

  await sendNotification({
    type: 'TRANSPORT_RUN',
    title: `${routeName} ${verb}`,
    body: lateness ? `${at} — ${lateness}` : `${at}`,
    resourceType: 'TRANSPORT_RUN',
    resourceId: `${run.routeId}:${run.leg}`,
    target: {
      targetClass: 'Transport',
      schoolId: run.schoolId,
      studentIds: assignments.map(a => a.studentId),
    },
  })
}

/** "15:42" in the school's own zone — the clock the parent and driver read. */
function formatWallClock(instant: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(instant)
  } catch {
    // An unknown zone must not cost the parent the notification.
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(instant)
  }
}

/**
 * "4 minutes late" / "2 minutes early" / "on time", from two wall clocks.
 *
 * Returns null when the expected time cannot be read, rather than guessing:
 * with no usable comparison there is no lateness to state, and saying "on time"
 * would be an assertion nobody made.
 */
function describeLateness(actual: string, due: string): string | null {
  const toMinutes = (hhmm: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    if (h > 23 || min > 59) return null
    return h * 60 + min
  }
  const a = toMinutes(actual)
  const d = toMinutes(due)
  if (a === null || d === null) return null

  const diff = a - d
  if (diff === 0) return 'on time'
  const mins = Math.abs(diff)
  const unit = mins === 1 ? 'minute' : 'minutes'
  return diff > 0 ? `${mins} ${unit} late` : `${mins} ${unit} early`
}

// A bus marked away: "Bus 14 left at 15:42".
//
//   POST   /api/partner/transport/runs
//   DELETE /api/partner/transport/runs     (withdrawal — same body, no marked_at)
//
//   { school_id, route_id, leg: "AM"|"PM"|"FRI_PM", date_local: "2026-09-17",
//     marked_at: "2026-09-17T11:42:00Z",   // the instant it happened
//     due_at: "15:40" | null }             // school-local wall clock
//
// Two deliberate omissions, both load-bearing:
//
// Connect stores the TIMES and never a sentence. Desk knows both numbers and
// could send "2 minutes late" ready-made; it does not, because this app has its
// own voice and translates for families who need it, and a finished English
// sentence is the one thing translation handles worst.
//
// And the wording is per leg, opposite between them: a morning bus ARRIVES at
// school, an afternoon or Friday one DEPARTS from it. Same row, opposite
// journey. Desk's board said "arrived" for all three until the office noticed
// it was reading back the wrong journey — so the leg travels with the mark and
// the app does the words.
//
// `due_at` may be null and often is. Then there is no lateness to state, and it
// must never default to on-time.
//
// Idempotent per (school, route, leg, date) — the office re-marking after a
// correction overwrites rather than duplicating. Withdrawal matters as much as
// the mark: a bus marked away by mistake is a parent told their child has left
// when they have not, so DELETE removes it and the parent app stops saying it.
router.post('/transport/runs', requirePartner, async (req, res) => {
  try {
    const parsed = await parseRunBody(req)
    if ('error' in parsed) return res.status(parsed.status).json({ error: parsed.error })
    const { school, routeId, leg, dateLocal, markedAt, dueAt } = parsed

    // A withdrawal sent as a POST with no mark, which Desk's brief allows.
    if (!markedAt) {
      const removed = await prisma.transportRun.deleteMany({
        where: { schoolId: school.id, routeId, leg, dateLocal },
      })
      return res.json({ withdrawn: removed.count })
    }

    const run = await prisma.transportRun.upsert({
      where: { schoolId_routeId_leg_dateLocal: { schoolId: school.id, routeId, leg, dateLocal } },
      create: { schoolId: school.id, routeId, leg, dateLocal, markedAt, dueAt },
      update: { markedAt, dueAt },
    })

    // Tell the families on that bus — and only them. Notifying is best-effort:
    // the mark itself is the record, and a push that fails must not fail the
    // office's action or make Desk retry a mark it already landed.
    notifyTransportRun({ schoolId: school.id, routeId, leg, markedAt, dueAt }).catch(err =>
      console.error('Transport run notify failed:', err),
    )

    res.json({ id: run.id, marked: true })
  } catch (error) {
    console.error('Partner transport run error:', error)
    res.status(500).json({ error: 'Failed to record transport run' })
  }
})

router.delete('/transport/runs', requirePartner, async (req, res) => {
  try {
    const parsed = await parseRunBody(req)
    if ('error' in parsed) return res.status(parsed.status).json({ error: parsed.error })
    const { school, routeId, leg, dateLocal } = parsed

    const removed = await prisma.transportRun.deleteMany({
      where: { schoolId: school.id, routeId, leg, dateLocal },
    })
    // No notification on withdrawal. A correction within the office's grace
    // window is usually seconds; a second push saying "ignore that" would be
    // louder than the mistake. The parent app simply stops showing it.
    res.json({ withdrawn: removed.count })
  } catch (error) {
    console.error('Partner transport run withdraw error:', error)
    res.status(500).json({ error: 'Failed to withdraw transport run' })
  }
})


// The principal's weekly update, for Desk's "Sent to parents" view.
//
//   GET /api/partner/weekly-messages?school_id=<Hub school id | Connect id>&limit=<n>
//   → { enabled, messages: [ { id, title, content, weekOf, imageUrl,
//                              publishedAt, scheduledAt, hearts } ] }
//
// `enabled` exists because an empty list means two different things and the
// reader cannot tell them apart. A school with the module OFF has not adopted
// this, and a section headed "no update this week" invents a feature they do
// not use; a school with it ON and nothing written has a real absence somebody
// might chase. Returning [] for both makes the wrong guess the likely one, and
// the wrong guess in the worse direction — implying a principal is failing to
// write something he never undertook to.
//
// Desk already merges Connect's admin posts into that view, on the principle
// that staff should see what families have been told. It reads
// /api/partner/messages, which queries the Message model — and the weekly
// update is WeeklyMessage, a different model entirely. So it has never come
// through, and nothing said it was missing: a teacher asked "what did the
// principal say about sports day" had no answer but "open the parent app".
//
// PUBLISHEDAT IS DERIVED, because there is no such column. A weekly message is
// visible to parents when its scheduledAt has passed, or immediately if it has
// none — the same rule the parent read applies. So:
//
//   no scheduledAt          → published when it was created
//   scheduledAt in the past → published then
//   scheduledAt in future   → NOT published; publishedAt is null
//
// The distinction is the point rather than a detail. A staff bulletin saying
// "the principal told parents X" when he has not yet is worse than saying
// nothing, so a scheduled update arrives visibly unsent rather than absent.
//
// HEARTS AS A COUNT. WeeklyMessageHeart carries userId, and which parents
// reacted is not Desk's business — but the number is the only feedback signal
// on that message, and it has until now been visible nowhere but Connect's
// admin. The integer, never the identities.
//
// CONTENT AS WRITTEN. Markdown, with ADR 0003 staff mentions intact and
// deliberately NOT translated: the parent routes translate per reader, and
// Desk's reader is a staff member who wrote it. Mentions render inert outside
// the parent app — /inbox/new?staff= is a parent-app route and a teacher
// clicking it in Desk would 404.
router.get('/weekly-messages', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) return res.status(400).json({ error: 'school_id required' })

    const limitRaw = Number.parseInt(String(req.query.limit ?? ''), 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20

    const school = await prisma.school.findFirst({
      where: { OR: [{ hubSchoolId: schoolIdParam }, { id: schoolIdParam }] },
      select: { id: true, weeklyUpdatesEnabled: true },
    })
    // Unknown school is not an error — Desk may probe ids we don't host.
    // A school we do not host is not a school with the feature on and nothing
    // written, so it reads as disabled rather than as empty.
    if (!school) return res.json({ enabled: false, messages: [] })
    // A school with the module off gets an empty list rather than rows Desk
    // would then have to make a judgement about — and `enabled: false` so it
    // shows no section at all rather than an empty one.
    if (!school.weeklyUpdatesEnabled) return res.json({ enabled: false, messages: [] })

    const rows = await prisma.weeklyMessage.findMany({
      where: { schoolId: school.id },
      orderBy: [{ weekOf: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        content: true,
        weekOf: true,
        imageUrl: true,
        scheduledAt: true,
        createdAt: true,
        _count: { select: { hearts: true } },
      },
    })

    const now = new Date()
    res.json({
      enabled: true,
      messages: rows.map(m => ({
        id: m.id,
        title: m.title,
        content: m.content,
        weekOf: m.weekOf.toISOString().split('T')[0],
        imageUrl: m.imageUrl,
        publishedAt: m.scheduledAt
          ? (m.scheduledAt <= now ? m.scheduledAt.toISOString() : null)
          : m.createdAt.toISOString(),
        scheduledAt: m.scheduledAt?.toISOString() || null,
        hearts: m._count.hearts,
      })),
    })
  } catch (error) {
    console.error('Error fetching partner weekly messages:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// The staff a Desk broadcast may @mention, with the ids that mentions resolve
// against.
//
//   GET /api/partner/staff/mentionable?school_id=<Hub school id | Connect id>
//   → { staff: [ { userId, name, role, position } ] }
//
// Desk holds Hub user ids and nothing else; the Hub→Connect mapping lives on
// this side, so a mention cannot be built there without asking. `userId` is the
// Connect `User.id` that goes into the mention link — see
// docs/adr/0003-staff-mentions-are-markdown-links.md.
//
// The role filter (STAFF/ADMIN/SUPER_ADMIN) is applied HERE rather than shipping
// a wider list for Desk to filter. That rule is part of the mention contract,
// and a second copy of it in another repo would drift from the day it was
// written. ILSAs are excluded deliberately: an ILSA is scoped to one pupil
// (ADR 0006), so they are not a whole-school broadcast's business.
//
// Returns display data only — no email, no password state, no last-login. A
// composer needs to tell two people named Rob apart and nothing more. Unknown
// school → empty list, not an error, matching the other partner reads.
router.get('/staff/mentionable', requirePartner, async (req, res) => {
  try {
    const schoolIdParam = typeof req.query.school_id === 'string' ? req.query.school_id.trim() : ''
    if (!schoolIdParam) {
      return res.status(400).json({ error: 'school_id required' })
    }

    // Accept the Hub school id (Desk's world) or a Connect school id.
    const school = await prisma.school.findFirst({
      where: { OR: [{ hubSchoolId: schoolIdParam }, { id: schoolIdParam }] },
      select: { id: true },
    })
    if (!school) return res.json({ staff: [] })

    const staff = await prisma.user.findMany({
      where: {
        schoolId: school.id,
        role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },
        // Test accounts stay out of every staff enumeration.
        isTest: false,
      },
      select: { id: true, name: true, role: true, position: true },
      orderBy: { name: 'asc' },
    })

    res.json({
      staff: staff.map(s => ({
        userId: s.id,
        name: s.name,
        role: s.role,
        position: s.position || null,
      })),
    })
  } catch (error) {
    console.error('Error fetching mentionable staff:', error)
    res.status(500).json({ error: 'Failed to fetch mentionable staff' })
  }
})


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
// The response reports BOTH numbers, because they are different facts and one
// of them has already been mistaken for the other: `created` counts fan-out
// ROWS (five classes = 5, the whole school = 1), `parents` counts distinct
// PEOPLE. A caller that renders `created` as a headcount tells a teacher who
// messaged five classes that 5 parents have it.
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
    // Distinct parent users across the whole send — see the resolve below.
    const audienceParentIds = new Set<string>()
    // The row a tapped notification opens. With several rows there is no single
    // right answer, so the first is used — every one carries the same content,
    // and the alternative is a notification that opens nothing.
    let firstMessageId: string | null = null
    for (const c of resolvedClasses) targets.push({ targetClass: c.name, classId: c.id })
    for (const g of resolvedGroups) targets.push({ targetClass: g.name, groupId: g.id })
    if (resolvedYearGroup) targets.push({ targetClass: resolvedYearGroup.name, yearGroupId: resolvedYearGroup.id })
    if (wholeSchool) targets.push({ targetClass: 'Whole School' })

    // Desk sends markdown; convert → sanitized HTML so parents see formatting
    // (the broadcast render path is HTML, shared with the admin composer).
    const safeContent = markdownToSafeHtml(content)
    const cleanTitle = title.trim()
    // Desk sends proper ISO, which carries its own offset and is honoured as
    // sent. A bare wall clock ("2026-09-11T11:30") is read as the school's local
    // time rather than the server's — the same rule the admin composer uses, so
    // the two cannot disagree about what 11:30 means.
    const scheduledDate = typeof scheduledAt === 'string' && scheduledAt
      ? await parseWallClockForSchool(scheduledAt, actor.schoolId)
      : null
    const broadcastLiveNow = !scheduledDate || scheduledDate <= new Date()
    // Same rule as the admin composer: a bare date runs to the end of that day
    // in the school's zone; anything more specific is taken as sent.
    const expiresDate = typeof expiresAt === 'string' && expiresAt
      ? await parseExpiryForSchool(expiresAt, actor.schoolId)
      : null
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

      const target = {
        targetClass: t.targetClass,
        classId: t.classId,
        yearGroupId: t.yearGroupId,
        groupId: t.groupId,
        schoolId: actor.schoolId,
      }

      // The real headcount, which this route computed and threw away. Resolved
      // for EVERY target, including a scheduled one — the audience as it stands
      // at queue time is the honest answer to "who is this going to", and a
      // caller can label it as expected rather than delivered.
      //
      // A UNION across the whole send, never a per-target sum: a parent with a
      // child in two of the targeted classes is one person who was told once,
      // and summing per-target totals is the same error one layer down.
      //
      // Counted BEFORE the notification-preference filter, deliberately. A
      // parent who muted push still has the message in front of them in the
      // app; "we didn't buzz their phone" is a different fact from "they
      // weren't told", and this number answers the second.
      //
      // Resolved here as well as inside sendNotification rather than threading
      // a count back out of it: that function is called from a dozen places and
      // its contract is worth more than the duplicate query.
      for (const id of await resolveAudienceParentIds(target)) audienceParentIds.add(id)

      // The announcement itself is sent ONCE for the whole fan-out, after this
      // loop — see below. Only the row and its audience are built here.
      firstMessageId = firstMessageId ?? message.id
    }

    // ONE announcement, however many rows it became.
    //
    // This used to sit inside the loop, so a parent with children in two of the
    // targeted classes had their phone buzz twice for one thing the school
    // said. The union was already being computed here — for the headcount in
    // the response — and then not used for the send, which is the whole bug in
    // one sentence.
    //
    // Same rule as the native create: announce only what is live now. A
    // future-dated broadcast is picked up by the publishScheduledMessages
    // sweep when its time arrives, and `notifiedAt` staying null is the marker.
    if (broadcastLiveNow && firstMessageId) {
      const target = {
        // A label for the send rather than a selector: the audience is the
        // resolved list, and targetClass is only what a notification says it
        // is about when there is one target.
        targetClass: targets.length === 1 ? targets[0].targetClass : 'Several classes',
        parentUserIds: [...audienceParentIds],
        schoolId: actor.schoolId,
      }
      if (isNotice) {
        // Quiet in the app, but always signalled by email — that is what makes
        // a section outside the feed discoverable. The email carries the
        // department and nothing else, never the content.
        await signalAdminNotice({ schoolId: actor.schoolId, department: noticeDepartment, target })
        // Escalation is the sender's call: a whole-school health message
        // pushes, a fee reminder does not.
        if (isUrgent === true) {
          await sendNotification({
            req, type: 'MESSAGE',
            title: noticeDepartment || 'Admin notice',
            body: cleanTitle,
            resourceType: 'MESSAGE', resourceId: firstMessageId, target,
          })
        }
      } else {
        await sendNotification({
          req, type: 'MESSAGE',
          title: cleanTitle,
          body: safeContent.substring(0, 200),
          resourceType: 'MESSAGE', resourceId: firstMessageId, target,
        })
      }
    }

    // `created` = fan-out rows, unchanged. `parents` = distinct people. Zero is
    // a real answer and says so: an empty class is a thing a sender needs told.
    res.status(201).json({ created: targets.length, parents: audienceParentIds.size })
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

    // Service groups are recomputed at the point of use, so what Desk shows is
    // who is in the service NOW. Without this the composer reported the count
    // from whenever the group was last touched: a Friday aftercare group read
    // four children while six had signed up, and nothing on the screen said so.
    //
    // The SEND was always right — resolveAudienceParentIds refreshes before it
    // resolves — so this was a lie in the display rather than a delivery fault.
    // That is the worse half of the two: a coordinator who believes the number
    // does not go looking, and a coordinator who mistrusts it stops trusting
    // the send as well.
    await refreshServiceGroupsForSchool(school.id)

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

/**
 * Find a group by Connect id, falling back to its externalRef.
 *
 * A publisher stores the Connect id from the create response and normally
 * addresses by it. This is for recovery: if it loses the id, its only other
 * move is to create again and hope the upsert reunites them. The ref it chose
 * is already unique per school, so it can re-address the group we hold.
 *
 * Id wins when both could match, so an id never silently resolves to some other
 * school's idea of a ref. Both lookups are school-scoped.
 */
async function findGroupByIdOrRef(idOrRef: string, schoolId: string) {
  const byId = await prisma.group.findFirst({ where: { id: idOrRef, schoolId }, select: { id: true } })
  if (byId) return byId
  // Guarded on non-empty: `where: { externalRef: '' }` is a real query, but an
  // empty path segment can't reach here anyway — Express won't route it.
  if (!idOrRef) return null
  return prisma.group.findFirst({ where: { externalRef: idOrRef, schoolId }, select: { id: true } })
}

/**
 * A category by name, for callers that have no way to know our ids.
 *
 * GroupCategory is per-school free text — one school's "Sports" is another's
 * "Sport" and a third has none — so there is no shared vocabulary to publish
 * against. A caller sends the word it uses; we match an existing category
 * exactly (case- and space-insensitively) or file the group under nothing and
 * say so. We do not create categories on a partner's say-so, and we do not
 * guess: a squad under the wrong heading is worse than a squad under none.
 */
async function resolveCategoryName(categoryName: string, schoolId: string) {
  const wanted = categoryName.trim().toLowerCase()
  if (!wanted) return null
  const categories = await prisma.groupCategory.findMany({
    where: { schoolId },
    select: { id: true, name: true },
  })
  return categories.find(c => c.name.trim().toLowerCase() === wanted) ?? null
}

// Create a group in the actor's school with an initial pupil roster. Desk sends
// Hub pupil ids (`pupilHubIds`); we map them to internal Student ids at the
// boundary and store StudentGroupLink rows on the internal ids.
//
//   POST /api/partner/groups  { hub_user_id, name, pupilHubIds: string[] }
router.post('/groups', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, name, pupilHubIds, categoryId, categoryName, externalRef } = req.body ?? {}
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

    // `categoryName` is the alternative for callers with no way to know our ids.
    // Unlike a bad categoryId this is not an error — the caller can't be
    // expected to know a given school's headings — so an unmatched name leaves
    // the group uncategorised and is reported back.
    const wantsName = !category && typeof categoryName === 'string' && !!categoryName.trim()
    const named = wantsName ? await resolveCategoryName(categoryName, actor.schoolId) : null
    const resolvedCategory = category ?? named
    const unmatchedCategoryName = wantsName && !named ? categoryName.trim() : null

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
            data: { name: name.trim(), ...(resolvedCategory ? { categoryId: resolvedCategory.id } : {}) },
            select: { id: true },
          })
        : await prisma.group.create({
            data: {
              name: name.trim(),
              schoolId: actor.schoolId,
              ...(resolvedCategory ? { categoryId: resolvedCategory.id } : {}),
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
      ...(unmatchedCategoryName ? { unmatchedCategoryName } : {}),
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

    const addressed = await findGroupByIdOrRef(req.params.id, actor.schoolId)
    if (!addressed) return res.status(404).json({ error: 'not_found' })

    // As on the list: the members Desk shows are the service's members now, not
    // the ones stored when the group was last written. A no-op for an ordinary
    // group, whose membership is nobody's to recompute.
    //
    // Swallowed deliberately. refreshServiceGroup has no error handling of its
    // own (refreshServiceGroupsForSchool does), and a read that 500s because a
    // recompute failed is worse than a read that serves a slightly stale list:
    // the coordinator loses the whole screen instead of a few minutes' accuracy.
    try {
      await refreshServiceGroup(addressed.id)
    } catch (err) {
      console.error('Group refresh failed, serving stored membership:', err)
    }

    const group = await prisma.group.findFirst({
      where: { id: addressed.id, schoolId: actor.schoolId },
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

    // `:id` is a Connect group id or, for a caller recovering from a lost id,
    // the externalRef it published under.
    const group = await findGroupByIdOrRef(req.params.id, actor.schoolId)
    if (!group) return res.status(404).json({ error: 'not_found' })
    const id = group.id

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
router.post('/inbox/upload', requirePartner, singleAttachment(), async (req, res) => {
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
//     { school_id, leg: 'AM'|'PM'|'FRI_PM',
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

    // FRI_PM is the consolidated Friday afternoon service — a distinct run, not
    // a re-timed PM. Replacement is still per leg, so pushing FRI_PM never
    // disturbs a school's ordinary AM/PM rows and a school with no Friday
    // service simply never sends one.
    const leg = body.leg
    if (leg !== 'AM' && leg !== 'PM' && leg !== 'FRI_PM') {
      return res.status(400).json({ error: "leg must be 'AM', 'PM' or 'FRI_PM'" })
    }

    const school = await partnerSchool(schoolIdParam)
    if (!school) return res.status(404).json({ error: 'school_not_found' })

    // Flatten the route → stop → pupil tree into the one line each child needs.
    // A pupil listed twice in a leg keeps the first stop; the alternative is a
    // unique-constraint failure that fails the whole push over one bad row.
    type Row = { hubPupilId: string; routeId: string | null; routeName: string; routeCode: string | null; stopName: string; timeLocal: string; hideStopName: boolean }
    const rows = new Map<string, Row>()
    const routes = Array.isArray(body.routes) ? body.routes : []
    for (const route of routes as Array<Record<string, unknown>>) {
      const routeName = typeof route?.name === 'string' ? route.name.trim() : ''
      if (!routeName) continue
      // Desk's own route id. Always sent, never read until runs needed a key to
      // join "Bus 3 has left" to the children on Bus 3.
      const routeId = typeof route?.id === 'string' && route.id.trim() ? route.id.trim() : null
      const routeCode = typeof route?.code === 'string' && route.code.trim() ? route.code.trim() : null
      const stops = Array.isArray(route?.stops) ? route.stops : []
      for (const stop of stops as Array<Record<string, unknown>>) {
        const hideStopName = stop?.hide_stop_name === true
        // A suppressed stop's name is dropped AT THE DOOR, not merely hidden on
        // read. ADR 0001's strongest claim is that a withheld address never
        // enters this database or its backups at all — and until now that rested
        // on Desk choosing to send an empty name, not on anything here. A flag
        // arriving beside a populated name is a mistake somewhere upstream, and
        // the safe reading of it is the one that cannot disclose an address.
        const sentName = typeof stop?.name === 'string' ? stop.name.trim() : ''
        const stopName = hideStopName ? '' : sentName
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
          rows.set(hubPupilId, { hubPupilId, routeId, routeName, routeCode, stopName, timeLocal, hideStopName })
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
        routeId: row.routeId,
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

// ─── Catalogue push ─────────────────────────────────────────────────────────
//
// An outside system (Active) publishes its activities into Connect so parents
// see the school's programme in the app they already use. Connect DISPLAYS
// these: it does not run the choice, the ranking or the allocation, and it
// deliberately cannot show places remaining, because a publish-only consumer
// has no way to know it and a wrong number looks exactly like a right one.
//
//   PUT /api/partner/activities/:externalRef
//
// Addressed by the publisher's own ref so a rename edits the activity instead
// of creating a second one. Idempotent, and safe to retry out of order: a push
// is applied only when strictly newer than the version we last accepted.
router.put('/activities/:externalRef', requirePartner, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const actor = await resolveStaffActor(
      typeof body.hub_user_id === 'string' ? body.hub_user_id.trim() : '',
      schoolHintOf(req),
    )
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const externalRef = (req.params.externalRef ?? '').trim()
    if (!externalRef) return res.status(400).json({ error: 'externalRef required' })

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return res.status(400).json({ error: 'name required' })

    // No version, no write. Accepting an unversioned push would let a stalled
    // retry silently revert a newer edit, which is the one thing the version
    // exists to prevent.
    const version = parseVersion(body.version)
    if (!version) return res.status(400).json({ error: 'version required (ISO-8601)' })

    const existing = await prisma.ecaActivity.findFirst({
      where: { schoolId: actor.schoolId, externalRef },
      select: { id: true, sourceVersion: true, providerId: true },
    })

    // A published ref must never land on a provider-run club. The refs are
    // namespaced so this shouldn't collide, but the cost of being wrong is
    // overwriting a club parents have paid for, so it's checked rather than
    // assumed.
    if (existing?.providerId) {
      return res.status(409).json({ error: 'ref belongs to a provider-run club' })
    }

    if (existing && !isNewer(version, existing.sourceVersion)) {
      // Not an error: an out-of-order retry recomputing to older state is
      // ordinary, and the publisher should mark the row delivered.
      return res.json({ id: existing.id, ignored: true, reason: 'stale_version' })
    }

    // Hub owns term identity; Connect syncs it. We don't invent a term from a
    // partner push — a term conjured here would be a second, competing record
    // of something Hub already owns. Until the sync has run there is nowhere
    // correct to file the activity, so say so and let the retry succeed later.
    const hubTermId = typeof body.hubTermId === 'string' ? body.hubTermId.trim() : ''
    if (!hubTermId) return res.status(400).json({ error: 'hubTermId required' })
    const term = await prisma.ecaTerm.findFirst({
      where: { schoolId: actor.schoolId, hubTermId },
      select: { id: true },
    })
    if (!term) {
      return res.status(409).json({
        error: 'unknown_term',
        hubTermId,
        hint: 'this term has not synced from Hub into Connect yet — retry after the next sync',
      })
    }

    // Unknown year groups are reported, not fatal: a programme naming one year
    // group we haven't synced should still publish for the other four.
    const wantedYearGroups = hubYearGroupIdsOf(body.eligibleYearGroups)
    const yearGroups = wantedYearGroups.length
      ? await prisma.yearGroup.findMany({
          where: { schoolId: actor.schoolId, hubYearGroupId: { in: wantedYearGroups } },
          select: { id: true, hubYearGroupId: true },
        })
      : []
    const foundYearGroups = new Set(yearGroups.map(y => y.hubYearGroupId))
    const unknownYearGroupIds = wantedYearGroups.filter(id => !foundYearGroups.has(id))

    // Same rule as the groups API: match a heading this school actually has, or
    // file under none and say which word missed.
    const categoryWord = typeof body.category === 'string' ? body.category : ''
    const category = categoryWord ? await resolveCategoryName(categoryWord, actor.schoolId) : null
    const unmatchedCategoryName = categoryWord && !category ? categoryWord.trim() : null

    // A group must be this school's, and can back only one activity. A taken
    // one is reported rather than fatal — the catalogue entry is still right.
    let groupId: string | null = null
    let ignoredGroupId: string | null = null
    if (typeof body.groupId === 'string' && body.groupId.trim()) {
      const wanted = body.groupId.trim()
      const group = await prisma.group.findFirst({
        where: { id: wanted, schoolId: actor.schoolId },
        select: { id: true, ecaActivity: { select: { id: true } } },
      })
      const takenByAnother = group?.ecaActivity && group.ecaActivity.id !== existing?.id
      if (group && !takenByAnother) groupId = group.id
      else ignoredGroupId = wanted
    }

    const meetings = normaliseMeetings(body.meetings)
    const first = meetings[0]
    const { minCapacity, maxCapacity } = capacityFor(body.capacity)
    const status = statusFor(body.status)

    const data = {
      name,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      ecaTermId: term.id,
      categoryId: category?.id ?? null,
      location: typeof body.venue === 'string' ? body.venue.trim() || null : null,
      activityType: activityTypeFor(body.inviteOnly),
      eligibleGender: genderFor(body.eligibleGender),
      eligibleYearGroupIds: yearGroups.map(y => y.id),
      minCapacity,
      maxCapacity,
      ...status,
      // Mirrors of the first meeting, so every screen that already reads a
      // single day and time keeps working. `meetings` below is the truth.
      dayOfWeek: first?.dayOfWeek ?? 0,
      timeSlot: first ? timeSlotFor(first.startTime) : undefined,
      customStartTime: first?.startTime ?? null,
      customEndTime: first?.endTime ?? null,
      ...(groupId ? { groupId } : {}),
      source: typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'partner',
      sourceVersion: version,
      // Never set by a push: these are the provider half, and a school-run
      // activity acquiring a payment link because a field arrived would be a
      // payments decision made by accident.
      providerId: null,
      cost: null,
      paymentUrl: null,
    }

    const activity = existing
      ? await prisma.ecaActivity.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.ecaActivity.create({
          data: { ...data, schoolId: actor.schoolId, externalRef, timeSlot: data.timeSlot ?? 'AFTER_SCHOOL' },
          select: { id: true },
        })

    // Replaced wholesale: a meeting has no identity worth preserving, and a
    // club that drops its Wednesday session must actually lose it.
    await prisma.ecaActivityMeeting.deleteMany({ where: { ecaActivityId: activity.id } })
    if (meetings.length > 0) {
      await prisma.ecaActivityMeeting.createMany({
        data: meetings.map(m => ({ ...m, ecaActivityId: activity.id })),
      })
    }

    res.status(existing ? 200 : 201).json({
      id: activity.id,
      created: !existing,
      // Each present only when there is something to say, so a clean publish
      // reads clean.
      ...(unknownYearGroupIds.length > 0 ? { unknownYearGroupIds } : {}),
      ...(unmatchedCategoryName ? { unmatchedCategoryName } : {}),
      ...(ignoredGroupId ? { ignoredGroupId } : {}),
      ...(meetings.length === 0 ? { warning: 'no valid meetings in payload' } : {}),
    })
  } catch (error) {
    console.error('Error consuming partner activity push:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

/**
 * One teacher's consultation slots, in Desk's vocabulary.
 *
 * Scoped to the actor's own ConsultationTeacher rows — a partner token plus
 * someone else's hub_user_id gets that person's grid, never a school-wide read,
 * and never anything a teacher could not already see in Connect.
 *
 * The names and the note travel with a booked slot because the teacher is
 * about to sit down with those people and that note was written for them to
 * read. Nothing else about the parent or the child crosses.
 */
async function consultationSlotsFor(
  actor: { id: string; schoolId: string },
  fromRaw: unknown,
  toRaw: unknown,
) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/
  const from = typeof fromRaw === 'string' && DATE.test(fromRaw) ? fromRaw : null
  const to = typeof toRaw === 'string' && DATE.test(toRaw) ? toRaw : null

  const teacherRows = await prisma.consultationTeacher.findMany({
    where: {
      teacherId: actor.id,
      consultation: { schoolId: actor.schoolId },
    },
    include: {
      consultation: { select: { id: true, title: true, status: true } },
      slots: {
        // Dates are stored YYYY-MM-DD, so a string comparison IS a date
        // comparison — and an undefined bound drops the filter rather than
        // matching null, which would silently return nothing.
        where: from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : undefined,
        include: {
          booking: {
            select: {
              studentName: true,
              notes: true,
              locationType: true,
              meetingLink: true,
              parent: { select: { name: true } },
            },
          },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      },
    },
  })

  const slots = teacherRows.flatMap(t =>
    t.slots.map(s => ({
      event_id: t.consultation.id,
      event_title: t.consultation.title,
      status: t.consultation.status,
      date: s.date,
      start_time: s.startTime,
      end_time: s.endTime,
      location: t.location,
      // What the teacher OFFERS. 'PARENT_CHOICE' means either — which is not a
      // way an appointment can happen, so a booked slot also carries the
      // effective type below. A teacher reading their evening needs to know
      // which of the two THIS parent picked, not that they were offered both.
      location_type: t.locationType,
      is_break: s.isBreak,
      booked: !!s.booking,
      // Present only on a booked slot — an unbooked one has no one to name,
      // and sending nulls would invite a screen that renders an empty name.
      ...(s.booking
        ? {
            student_name: s.booking.studentName,
            parent_name: s.booking.parent?.name ?? null,
            notes: s.booking.notes,
            // Resolved: what this appointment actually is. Falls back to the
            // teacher's setting for every booking made before the choice
            // existed, and for a teacher who does not offer one.
            location_type: s.booking.locationType || t.locationType,
            meeting_link: s.booking.meetingLink,
          }
        : {}),
    })),
  )

  // Across several events, each teacher row was sorted on its own.
  return slots.sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? '') || a.start_time.localeCompare(b.start_time),
  )
}


// ─── Consultations (parents' evening), read-only ────────────────────────────
//
// A teacher's own appointment list, so Desk can show it beside their lessons,
// duties and cover. Connect owns parents' evening end to end — the model, the
// booking, the emails, the reminders, the parent screens — and this is a
// serialiser over it, not a handover.
//
// Deliberately read-only. Desk does not book, cancel or move a slot: a
// parent's booking is Connect's to hold, and two systems able to move the same
// appointment is how a parent turns up to an empty room.
//
//   GET /api/partner/consultations?hub_user_id=<hub user id>&from=&to=
//
// Times are HH:MM and dates YYYY-MM-DD, exactly as stored — no timezone maths
// at the boundary, which is where this usually goes wrong.
router.get('/consultations', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveStaffActor(hubUserId, schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const slots = await consultationSlotsFor(actor, req.query.from, req.query.to)
    res.json({ slots })
  } catch (error) {
    console.error('Error building partner consultations:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// The one-line version, so Desk's "Today" can say "6 of 12 booked" without
// reading every slot.
//
//   GET /api/partner/consultations/summary?hub_user_id=<hub user id>&from=&to=
router.get('/consultations/summary', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveStaffActor(hubUserId, schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const slots = await consultationSlotsFor(actor, req.query.from, req.query.to)
    // Breaks are shown on a teacher's grid but are not appointments, so they
    // count towards neither figure — "6 of 12 booked" should mean twelve
    // families could have come, not twelve rows on a screen.
    const appointments = slots.filter(s => !s.is_break)
    const booked = appointments.filter(s => s.booked)

    res.json({
      next_slot: booked[0] ?? appointments[0] ?? null,
      booked_count: booked.length,
      unbooked_count: appointments.length - booked.length,
    })
  } catch (error) {
    console.error('Error building partner consultation summary:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// 4. Withdraw one of your own messages (mirrors Connect's own delete).
//
// The rules are Connect's and stay Connect's: own messages only, inside fifteen
// minutes, soft delete. Desk hides a button that would fail; it does not get to
// decide the answer.
//
// Calls the SAME path as the native withdrawal rather than repeating the soft
// delete, because a withdrawal is three writes — the message, the thread
// preview, and the notification body that carried the first 200 characters of
// it. An endpoint that did the first two would leave the recipient's bell
// holding text the sender was told had been taken back.
//
//   DELETE /api/partner/inbox/threads/:id/messages/:messageId  { hub_user_id }
router.delete('/inbox/threads/:id/messages/:messageId', requirePartner, async (req, res) => {
  try {
    const hubUserId =
      typeof (req.body as Record<string, unknown> | undefined)?.hub_user_id === 'string'
        ? ((req.body as Record<string, string>).hub_user_id).trim()
        : typeof req.query.hub_user_id === 'string'
          ? req.query.hub_user_id.trim()
          : ''
    const actor = await resolveActor(hubUserId, schoolHintOf(req))
    if (!actor) return res.status(403).json({ error: 'forbidden' })
    const aId = actorUserId(actor)

    const { id, messageId } = req.params

    // The thread must be one this actor can see at all, before we say anything
    // about a message in it — otherwise "not yours" and "doesn't exist" leak
    // the difference to someone who should see neither.
    const thread = await prisma.conversation.findFirst({
      where: threadWhereForActor(id, actor),
      select: { id: true },
    })
    if (!thread) return res.status(404).json({ error: 'not_found' })

    const result = await withdrawMessage({ conversationId: id, messageId, actorId: aId })

    if (!result.ok) {
      // Distinguishable, because they are different sentences to a teacher:
      // one is "that isn't yours", the other is "you've missed the window",
      // and only the second is worth explaining.
      if (result.reason === 'not_found') return res.status(404).json({ error: 'not_found' })
      if (result.reason === 'not_sender') {
        return res.status(403).json({ error: 'not_sender', message: 'Only the sender can withdraw a message' })
      }
      return res.status(409).json({
        error: 'window_expired',
        message: 'A message can only be withdrawn within 15 minutes of sending',
        windowMinutes: WITHDRAW_WINDOW_MS / 60000,
      })
    }

    // The tombstone in the shape Desk already renders, so it can patch the
    // message in place rather than refetch the thread.
    res.json({
      message: {
        id: result.message.id,
        deleted: true,
        content: '',
        deletedAt: result.message.deletedAt.toISOString(),
        sentAt: result.message.createdAt.toISOString(),
        attachments: [],
      },
    })
  } catch (error) {
    console.error('Error withdrawing partner message:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
