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
import prisma from '../services/prisma.js'
import { requirePartner } from '../middleware/partnerAuth.js'
import { todayInTimezone } from '../services/dateTime.js'
import { sendPushNotification, removeInvalidTokens } from '../services/firebase.js'

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A resolved staff/admin actor, shaped exactly like `req.user`, so we can reuse
// the native inbox logic against a partner (Desk) request. `hub_user_id` maps to
// `User.hubUserId` (the Hub SSO identity link). Parents can NEVER be resolved
// here — Desk is a staff-facing surface — so a parent id is treated as "not
// found" and the caller returns 403.
type StaffActor = { id: string; role: string; schoolId: string; name: string }

async function resolveStaffActor(hubUserId: string): Promise<StaffActor | null> {
  if (!hubUserId) return null
  const u = await prisma.user.findUnique({
    where: { hubUserId },
    select: { id: true, role: true, schoolId: true, name: true },
  })
  if (!u || u.role === 'PARENT') return null
  return { id: u.id, role: u.role, schoolId: u.schoolId, name: u.name }
}

function isAdminActor(actor: StaffActor): boolean {
  return actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN'
}

// Gate a per-thread action to the actor's own thread, or — for admins — any
// thread in their school. Deliberately staff-oriented (no `parentId` branch):
// the actor is always staff here. A non-matching thread must 404, never 403, so
// we don't reveal that a thread exists to a staff member who can't see it.
function staffThreadWhere(id: string, actor: StaffActor) {
  return {
    id,
    OR: [
      { staffId: actor.id },
      ...(isAdminActor(actor) ? [{ schoolId: actor.schoolId }] : []),
    ],
  }
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

// Today's parent-reported absences for a school, so Desk can surface them and
// route each to the class teacher (via `hubClassId`).
//
//   GET /api/partner/attendance/today?school_id=<Hub school id>[&date=YYYY-MM-DD]
//
// `school_id` is resolved against the Hub school link (falls back to a Connect
// school id). `date` defaults to today in the school's timezone. Returns every
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
        // Window covers `date`: startDate <= date <= coalesce(endDate, startDate).
        startDate: { lte: date },
        OR: [
          { endDate: { gte: date } },
          { AND: [{ endDate: null }, { startDate: { gte: date } }] },
        ],
      },
      select: {
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

// ============================================================================
// Partner inbox — Desk hosts the 1:1 parent↔staff inbox; Connect stays the
// system of record. All four routes resolve a staff/admin `actor` from a Hub
// user id and reuse the native inbox logic against it. Responses carry DISPLAY
// NAMES ONLY — never parent email/phone, never pupil DOB/UPN/medical/other PII.
// ============================================================================

// 1. List the actor's inbox threads (mirrors GET /staff/conversations).
//
//   GET /api/partner/inbox/threads?hub_user_id=<Hub user id>[&class_id=<Hub class id>]
//
// Admins see every non-archived thread in their school; other staff see only
// their own. `class_id` is an optional Hub class id, resolved to a Connect class
// and used to filter by the thread's student. An unknown class → empty list.
router.get('/inbox/threads', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveStaffActor(hubUserId)
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const isAdmin = isAdminActor(actor)
    const where: Record<string, unknown> = { archivedByStaff: false }
    if (isAdmin) {
      where.schoolId = actor.schoolId
    } else {
      where.staffId = actor.id
    }

    const classIdParam = typeof req.query.class_id === 'string' ? req.query.class_id.trim() : ''
    if (classIdParam) {
      const cls = await prisma.class.findFirst({
        where: { hubClassId: classIdParam, schoolId: actor.schoolId },
        select: { id: true },
      })
      // Unknown / unmapped class → no threads (rather than an unfiltered list).
      if (!cls) return res.json({ threads: [] })
      where.student = { classId: cls.id }
    }

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        parent: { select: { name: true } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            class: { select: { name: true, hubClassId: true } },
          },
        },
        messages: {
          where: { senderId: { not: actor.id }, readAt: null },
          select: { id: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    const threads = conversations.map((c) => ({
      id: c.id,
      parentName: c.parent.name,
      studentName: c.student ? `${c.student.firstName} ${c.student.lastName}`.trim() : null,
      hubClassId: c.student?.class?.hubClassId ?? null,
      className: c.student?.class?.name ?? null,
      lastMessageText: c.lastMessageText,
      lastMessageAt: c.lastMessageAt.toISOString(),
      unread: c.messages.length,
    }))

    res.json({ threads })
  } catch (error) {
    console.error('Error building partner inbox threads:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// 2. Read one thread with its messages (mirrors GET /conversations/:id incl. the
// mark-inbound-read side-effect). Soft-deleted messages are EXCLUDED entirely —
// Desk gets a curated, display-only shape (names only; no reactions / replyTo /
// avatars / readAt). A thread the actor can't see → 404.
router.get('/inbox/threads/:id', requirePartner, async (req, res) => {
  try {
    const hubUserId = typeof req.query.hub_user_id === 'string' ? req.query.hub_user_id.trim() : ''
    const actor = await resolveStaffActor(hubUserId)
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const { id } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: staffThreadWhere(id, actor),
      include: {
        parent: { select: { name: true } },
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        messages: {
          where: { deletedAt: null },
          include: {
            sender: { select: { name: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'not_found' })
    }

    // Mark inbound (non-actor) messages as read — same side-effect as native.
    await prisma.conversationMessage.updateMany({
      where: { conversationId: id, senderId: { not: actor.id }, readAt: null },
      data: { readAt: new Date() },
    })

    res.json({
      thread: {
        id: conversation.id,
        parentName: conversation.parent.name,
        studentName: conversation.student
          ? `${conversation.student.firstName} ${conversation.student.lastName}`.trim()
          : null,
        className: conversation.student?.class?.name ?? null,
      },
      messages: conversation.messages.map((m) => ({
        id: m.id,
        senderName: m.sender.name,
        mine: m.senderId === actor.id,
        content: m.content,
        sentAt: m.createdAt.toISOString(),
        attachments: m.attachments.map((a) => ({
          name: a.fileName,
          url: a.fileUrl,
          type: a.fileType,
          size: a.fileSize,
        })),
      })),
    })
  } catch (error) {
    console.error('Error fetching partner inbox thread:', error)
    res.status(500).json({ error: 'internal_error' })
  }
})

// 3. Send a staff message in a thread (mirrors POST /conversations/:id/messages).
// Attachments must be PRE-HOSTED URLs (Desk can't call the staff-JWT upload
// route). Runs the same recipient fan-out — a Notification row + FCM push to the
// parent (respecting mutedByParent). The sender is staff, so there is no
// parent→teacher email branch.
router.post('/inbox/threads/:id/messages', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, content, attachments } = req.body ?? {}
    const actor = await resolveStaffActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '')
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const { id } = req.params
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content required' })
    }

    const conversation = await prisma.conversation.findFirst({
      where: staffThreadWhere(id, actor),
      include: {
        parent: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        schoolContact: { select: { name: true } },
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'not_found' })
    }

    const message = await prisma.conversationMessage.create({
      data: { conversationId: id, senderId: actor.id, content: content.trim() },
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

    // Recipient fan-out — sender is staff, so the recipient is the parent.
    const recipientId = conversation.parentId
    const senderDisplayName = conversation.schoolContact
      ? `${conversation.staff.name} (via ${conversation.schoolContact.name})`
      : conversation.staff.name

    // Notification row is always created regardless of mute.
    await prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'DIRECT_MESSAGE',
        title: `Message from ${senderDisplayName}`,
        body: content.trim().substring(0, 200),
        resourceType: 'CONVERSATION',
        resourceId: id,
        data: { conversationId: id, route: `/inbox/${id}` },
        schoolId: conversation.schoolId,
      },
    })

    // FCM push only if the parent hasn't muted this thread.
    if (!conversation.mutedByParent) {
      const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId: recipientId },
        select: { token: true },
      })
      if (deviceTokens.length > 0) {
        const tokens = deviceTokens.map((dt) => dt.token)
        const result = await sendPushNotification(tokens, {
          title: `Message from ${senderDisplayName}`,
          body: content.trim().substring(0, 200),
          data: {
            type: 'DIRECT_MESSAGE',
            resourceType: 'CONVERSATION',
            resourceId: id,
            route: `/inbox/${id}`,
          },
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
// /staff/conversations). The parent is identified directly (parentId) or via a
// student (first ParentStudentLink). Re-opening un-archives the actor's side.
router.post('/inbox/threads', requirePartner, async (req, res) => {
  try {
    const { hub_user_id, studentId, parentId } = req.body ?? {}
    const actor = await resolveStaffActor(typeof hub_user_id === 'string' ? hub_user_id.trim() : '')
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    // Resolve the parent, verifying they are a same-school PARENT either way.
    let resolvedParentId: string | null = null
    if (parentId) {
      const parentUser = await prisma.user.findFirst({
        where: { id: parentId, schoolId: actor.schoolId, role: 'PARENT' },
        select: { id: true },
      })
      if (parentUser) resolvedParentId = parentUser.id
    } else if (studentId) {
      const link = await prisma.parentStudentLink.findFirst({
        where: { studentId },
        select: { userId: true },
      })
      if (link) {
        const parentUser = await prisma.user.findFirst({
          where: { id: link.userId, schoolId: actor.schoolId, role: 'PARENT' },
          select: { id: true },
        })
        if (parentUser) resolvedParentId = parentUser.id
      }
    }

    if (!resolvedParentId) {
      return res.status(400).json({ error: 'could not resolve parent' })
    }

    const existing = await prisma.conversation.findFirst({
      where: {
        parentId: resolvedParentId,
        staffId: actor.id,
        studentId: studentId || null,
        schoolContactId: null,
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
        schoolId: actor.schoolId,
        parentId: resolvedParentId,
        staffId: actor.id,
        studentId: studentId || null,
        schoolContactId: null,
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
    const actor = await resolveStaffActor(hubUserId)
    if (!actor) return res.status(403).json({ error: 'forbidden' })

    const scope = req.query.scope === 'school' ? 'school' : 'own'

    let classFilter: { classId: { in: string[] } } | undefined
    if (scope === 'own') {
      const assignments = await prisma.staffClassAssignment.findMany({
        where: { userId: actor.id, class: { schoolId: actor.schoolId } },
        select: { classId: true },
      })
      const classIds = assignments.map((a) => a.classId)
      // No class assigned yet → empty (valid), not an error.
      if (classIds.length === 0) return res.json({ recipients: [] })
      classFilter = { classId: { in: classIds } }
    }

    const students = await prisma.student.findMany({
      // Always hard-scoped to the actor's school — scope=school never crosses it.
      where: { schoolId: actor.schoolId, ...(classFilter ?? {}) },
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

export default router
