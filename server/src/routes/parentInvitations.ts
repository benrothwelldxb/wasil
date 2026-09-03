import crypto from 'crypto'
import { formalSchoolName } from '../services/schoolName.js'
import { parentsBySignInStatus } from '../services/parentActivation.js'
import { Router, Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { createLoginCode } from './auth.js'
import {
  generateAccessCode,
  generateMagicToken,
  generateQRCode,
  isInvitationExpired,
  getDefaultExpiryDate,
  parseCSV,
  groupByParent,
} from '../services/invitations.js'

const router = Router()

// Rate limiting state (simple in-memory for now)
const validationAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const attempt = validationAttempts.get(ip)

  if (!attempt || now > attempt.resetAt) {
    validationAttempts.set(ip, { count: 1, resetAt: now + 60000 }) // 1 minute window
    return true
  }

  if (attempt.count >= 5) {
    return false
  }

  attempt.count++
  return true
}

// ============ Admin Endpoints ============

// List all invitations (paginated, filterable)
router.get('/', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { status, search, page = '1', limit = '20' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = Math.min(parseInt(limit as string, 10), 100)
    const skip = (pageNum - 1) * limitNum

    const where: Record<string, unknown> = { schoolId: user.schoolId }

    if (status && status !== 'all') {
      where.status = status
    }

    if (search) {
      const searchStr = search as string
      where.OR = [
        { parentEmail: { contains: searchStr, mode: 'insensitive' } },
        { parentName: { contains: searchStr, mode: 'insensitive' } },
        { accessCode: { contains: searchStr, mode: 'insensitive' } },
        { childLinks: { some: { childName: { contains: searchStr, mode: 'insensitive' } } } },
      ]
    }

    const [invitations, total] = await Promise.all([
      prisma.parentInvitation.findMany({
        where,
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          createdBy: { select: { id: true, name: true } },
          redeemedByUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.parentInvitation.count({ where }),
    ])

    res.json({
      invitations: invitations.map(inv => ({
        id: inv.id,
        accessCode: inv.accessCode,
        parentEmail: inv.parentEmail,
        parentName: inv.parentName,
        children: inv.childLinks.map(cl => ({
          childName: cl.childName,
          className: cl.class.name,
          classId: cl.classId,
        })),
        students: inv.studentLinks.map(sl => ({
          studentId: sl.student.id,
          studentName: `${sl.student.firstName} ${sl.student.lastName}`,
          className: sl.student.class.name,
        })),
        status: inv.status,
        expiresAt: inv.expiresAt?.toISOString(),
        redeemedAt: inv.redeemedAt?.toISOString(),
        redeemedByUser: inv.redeemedByUser
          ? { id: inv.redeemedByUser.id, name: inv.redeemedByUser.name, email: inv.redeemedByUser.email }
          : undefined,
        createdBy: { id: inv.createdBy.id, name: inv.createdBy.name },
        createdAt: inv.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Error fetching invitations:', error)
    res.status(500).json({ error: 'Failed to fetch invitations' })
  }
})

// List registered parents
router.get('/parents', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { search, classId, status, page = '1', limit = '50' } = req.query

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1)
    const limitNum = Math.min(100, parseInt(limit as string, 10) || 50)
    const skip = (pageNum - 1) * limitNum

    // Test Parents are hidden from the staff parent-management list.
    const where: any = { schoolId: user.schoolId, role: 'PARENT', isTest: false }

    // Whether a parent has ever signed in is derived from three sources, not a
    // column, so it cannot be a WHERE clause — resolve the whole roster first
    // and narrow by id. A school's parent list is small enough for that.
    const { signedIn, neverSignedIn } = await parentsBySignInStatus(user.schoolId)
    if (status === 'never') where.id = { in: [...neverSignedIn] }
    else if (status === 'signed-in') where.id = { in: [...signedIn] }

    if (search) {
      // Staff look a parent up by their child — "who are Alya Zaidi's parents"
      // is the question, and the parent's own name is often the thing they are
      // trying to find. So the child's name searches too.
      const term = (search as string).trim()
      // A full name has to match across two columns: "Alya Zaidi" is firstName
      // Alya AND lastName Zaidi, and neither column contains the whole string.
      const parts = term.split(/\s+/).filter(Boolean)
      const studentMatch =
        parts.length > 1
          ? {
              AND: [
                { firstName: { contains: parts[0], mode: 'insensitive' } },
                { lastName: { contains: parts[parts.length - 1], mode: 'insensitive' } },
              ],
            }
          : {
              OR: [
                { firstName: { contains: term, mode: 'insensitive' } },
                { lastName: { contains: term, mode: 'insensitive' } },
              ],
            }

      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { studentLinks: { some: { student: studentMatch } } },
        // The legacy Child rows hold one `name` column rather than two.
        { children: { some: { name: { contains: term, mode: 'insensitive' } } } },
      ]
    }

    const [parents, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          studentLinks: {
            include: { student: { include: { class: { select: { id: true, name: true } } } } },
          },
          children: { include: { class: { select: { id: true, name: true } } } },
        },
        // orderBy below stays name-asc so the chase list reads like the roster.
        orderBy: { name: 'asc' },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ])

    // If classId filter, filter in memory (students are in that class)
    let filtered = parents
    if (classId) {
      filtered = parents.filter(p =>
        p.studentLinks.some(sl => sl.student.classId === classId) ||
        p.children.some(c => c.classId === classId)
      )
    }

    res.json({
      parents: filtered.map(p => ({
        id: p.id,
        email: p.email,
        name: p.name,
        avatarUrl: p.avatarUrl,
        lastLoginAt: p.lastLoginAt?.toISOString() || null,
        lastSeenAt: p.lastSeenAt?.toISOString() || null,
        welcomeSentAt: p.welcomeSentAt?.toISOString() || null,
        lastNudgedAt: p.lastNudgedAt?.toISOString() || null,
        // The honest answer to "has this person ever got in", including the
        // ones let in by a code nobody recorded as an invite.
        hasSignedIn: signedIn.has(p.id),
        hasPassword: !!p.passwordHash,
        createdAt: p.createdAt.toISOString(),
        children: [
          ...p.children.map(c => ({ name: c.name, className: c.class.name, studentId: null as string | null })),
          ...p.studentLinks.map(sl => ({ name: `${sl.student.firstName} ${sl.student.lastName}`, className: sl.student.class.name, studentId: sl.student.id })),
        ],
      })),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
      // Roster-wide, not page-wide — these drive the filter tabs.
      counts: {
        all: signedIn.size + neverSignedIn.size,
        signedIn: signedIn.size,
        neverSignedIn: neverSignedIn.size,
      },
    })
  } catch (error) {
    console.error('Error fetching parents:', error)
    res.status(500).json({ error: 'Failed to fetch parents' })
  }
})

// Delete parent account
router.delete('/parents/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const parent = await prisma.user.findFirst({
      where: { id, schoolId: user.schoolId, role: 'PARENT' },
    })
    if (!parent) return res.status(404).json({ error: 'Parent not found' })

    // Clean up related records
    await prisma.parentStudentLink.deleteMany({ where: { userId: id } })
    await prisma.child.deleteMany({ where: { parentId: id } })
    await prisma.messageAcknowledgment.deleteMany({ where: { userId: id } })
    await prisma.formResponse.deleteMany({ where: { userId: id } })
    await prisma.eventRsvp.deleteMany({ where: { userId: id } })
    await prisma.pulseResponse.deleteMany({ where: { userId: id } })
    await prisma.weeklyMessageHeart.deleteMany({ where: { userId: id } })
    await prisma.notification.deleteMany({ where: { userId: id } })
    await prisma.deviceToken.deleteMany({ where: { userId: id } })
    await prisma.refreshToken.deleteMany({ where: { userId: id } })
    await prisma.conversation.deleteMany({ where: { parentId: id } })
    await prisma.serviceRegistration.deleteMany({ where: { parentId: id } })
    await prisma.consultationBooking.deleteMany({ where: { parentId: id } })
    await prisma.ecaSelection.deleteMany({ where: { parentUserId: id } })
    // Try to delete notification preferences if they exist
    await prisma.notificationPreference.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.alertAcknowledgment.deleteMany({ where: { parentId: id } })

    await prisma.user.delete({ where: { id } })

    logAudit({ req, action: 'DELETE', resourceType: 'PARENT_INVITATION' as any, resourceId: id, metadata: { parentName: parent.name, parentEmail: parent.email } })

    res.json({ message: 'Parent account deleted' })
  } catch (error) {
    console.error('Error deleting parent:', error)
    res.status(500).json({ error: 'Failed to delete parent account' })
  }
})

// Set a new password for a parent (admin)
// Change a parent's email deliberately, as a person rather than a nightly job.
//
// The Hub sync converges most addresses on its own, but declines where the
// account has a credential that is not its email — a password, OAuth, Hub SSO —
// because moving it there could break a way in that does not run through the
// mailbox. That is exactly the case this exists for, plus the case where the
// school simply needs it now rather than at the next sync.
router.post('/parents/:id/email', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const raw = (req.body as { email?: unknown })?.email
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' })
    }

    const parent = await prisma.user.findFirst({
      where: { id: req.params.id, schoolId: user.schoolId, role: 'PARENT' },
      select: { id: true, email: true, name: true },
    })
    if (!parent) return res.status(404).json({ error: 'Parent not found' })
    if (parent.email.toLowerCase() === email) {
      return res.json({ message: 'That is already their address', email: parent.email })
    }

    // User.email is unique across the whole database, not per school, so this
    // has to be a global check — and a clear 409 beats a raw constraint error.
    const taken = await prisma.user.findFirst({ where: { email }, select: { id: true } })
    if (taken) {
      return res.status(409).json({ error: 'Another account already uses that email address' })
    }

    const previousEmail = parent.email
    await prisma.user.update({ where: { id: parent.id }, data: { email } })

    // The address is how this parent signs in, so any code or link already sent
    // to the old one must stop working — otherwise the previous mailbox keeps a
    // usable way in.
    await Promise.all([
      prisma.magicLinkToken.deleteMany({ where: { email: previousEmail } }),
      prisma.loginCode.deleteMany({ where: { email: previousEmail, consumedAt: null } }),
    ])

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: parent.id,
      metadata: { action: 'change-parent-email' },
      changes: { email: { from: previousEmail, to: email } },
    })

    res.json({ message: `Email updated to ${email}`, email })
  } catch (error) {
    console.error('Error changing parent email:', error)
    res.status(500).json({ error: 'Failed to change email' })
  }
})

router.post('/parents/:id/set-password', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { password } = req.body

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const parent = await prisma.user.findFirst({
      where: { id, schoolId: user.schoolId, role: 'PARENT' },
    })
    if (!parent) return res.status(404).json({ error: 'Parent not found' })

    const bcrypt = await import('bcrypt')
    const passwordHash = await bcrypt.default.hash(password, 12)

    // Revoke any existing sessions atomically with the password change so a
    // stolen refresh token from before the change can't outlive it.
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { passwordHash },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: id } }),
    ])

    logAudit({ req, action: 'UPDATE', resourceType: 'USER', resourceId: id, metadata: { action: 'set-password', parentEmail: parent.email } })

    res.json({ message: `Password set for ${parent.email}` })
  } catch (error) {
    console.error('Error setting parent password:', error)
    res.status(500).json({ error: 'Failed to set password' })
  }
})

// Send magic link to reset parent password
router.post('/parents/:id/reset-password', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const parent = await prisma.user.findFirst({
      where: { id, schoolId: user.schoolId, role: 'PARENT' },
    })
    if (!parent) return res.status(404).json({ error: 'Parent not found' })

    // Generate magic link token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await prisma.magicLinkToken.deleteMany({ where: { email: parent.email, type: 'LOGIN' } })
    await prisma.magicLinkToken.create({
      data: { token, email: parent.email, schoolId: user.schoolId, type: 'LOGIN', expiresAt },
    })

    const PARENT_APP_URL = process.env.PARENT_APP_URL || 'http://localhost:3000'
    const magicLink = `${PARENT_APP_URL}/auth/magic?token=${token}`

    const { sendEmail } = await import('../services/email.js')
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, city: true } })

    const emailSent = await sendEmail({
      to: parent.email,
      subject: `${school?.name || 'School'} — Access Your Account`,
      html: `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px;">
        <h2>Access Your Account</h2>
        <p>Your school administrator has sent you a new login link.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${magicLink}" style="display: inline-block; background-color: #C4506E; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">Sign In</a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours.</p>
      </div>`,
      text: `Access your account: ${magicLink}\nThis link expires in 24 hours.`,
    })

    res.json({ message: emailSent ? `Login link sent to ${parent.email}` : 'Failed to send email', emailSent })
  } catch (error) {
    console.error('Error resetting parent password:', error)
    res.status(500).json({ error: 'Failed to send login link' })
  }
})

// Admin-issued one-time sign-in code. For parents whose email blocks/spam-
// filters the passwordless code (locked-down corporate inboxes): the admin
// mints a code here, reads it to the parent by phone/in person, and the parent
// signs in via the normal /auth/code/verify — no email involved. The plaintext
// is returned to the admin ONLY (never emailed). Reuses the shared minting
// helper: single-use, supersedes prior codes for the email, but with a 24-hour
// TTL so a phone/in-person handoff has time to land.
router.post('/parents/:id/sign-in-code', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const parent = await prisma.user.findFirst({
      where: { id, schoolId: user.schoolId, role: 'PARENT' },
    })
    if (!parent) return res.status(404).json({ error: 'Parent not found' })

    // 24-hour TTL, single-use, supersedes any prior codes for this email.
    const { code, expiresAt } = await createLoginCode(parent.email.toLowerCase(), 24 * 60)

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'USER',
      resourceId: id,
      metadata: { action: 'admin-sign-in-code', parentEmail: parent.email, expiresAt: expiresAt.toISOString() },
    })

    res.json({ code, expiresAt: expiresAt.toISOString() })
  } catch (error) {
    console.error('Error generating sign-in code:', error)
    res.status(500).json({ error: 'Failed to generate sign-in code' })
  }
})

// Send passwordless "welcome / you've been added" emails to parents. School-
// scoped: only touches PARENT users in the caller's school. Omit parentUserIds
// to invite every parent with an email; pass a subset to invite a selection.
// Deliberately does NOT embed a live code (a bulk send would expire before use)
// — the email tells them to open the app and request a code. Re-sendable:
// stamps User.welcomeSentAt each time.
// Chase parents who have never signed in. Separate from /send-invites: that is
// the "you've been added" welcome, this is the follow-up for people who got one
// (or a code at the gate) and never used it.
//
// Pass `parentUserIds` to chase a chosen few, or omit it to chase everyone who
// has never signed in. Never-signed-in is recomputed here rather than trusted
// from the client, so a stale page cannot email someone who has since got in.
// What the nudge will actually say, before anyone sends it to fifty families.
// Renders through the SAME builder the send uses, so the preview cannot drift
// from what goes out — and reports who would receive it.
router.get('/nudge/preview', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { neverSignedIn } = await parentsBySignInStatus(user.schoolId)

    const [school, recipients, missedCount] = await Promise.all([
      prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, city: true } }),
      prisma.user.count({
        where: { id: { in: [...neverSignedIn] }, isTest: false, email: { not: '' } },
      }),
      prisma.message.count({ where: { schoolId: user.schoolId, notifiedAt: { not: null } } }),
    ])

    const { buildParentNudgeEmail } = await import('../services/email.js')
    const { subject, html } = buildParentNudgeEmail({
      to: 'preview@example.com',
      schoolName: formalSchoolName(school),
      missedCount,
    })

    res.json({ subject, html, recipientCount: recipients, missedCount })
  } catch (error) {
    console.error('Error building nudge preview:', error)
    res.status(500).json({ error: 'Failed to build preview' })
  }
})

router.post('/nudge', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { parentUserIds } = (req.body || {}) as { parentUserIds?: string[] }

    const { neverSignedIn } = await parentsBySignInStatus(user.schoolId)
    let targetIds = [...neverSignedIn]
    if (Array.isArray(parentUserIds) && parentUserIds.length > 0) {
      const asked = new Set(parentUserIds)
      targetIds = targetIds.filter(id => asked.has(id))
    }

    if (targetIds.length === 0) {
      return res.json({ sent: 0, skippedNoEmail: 0, skippedAlreadySignedIn: parentUserIds?.length ?? 0 })
    }

    const parents = await prisma.user.findMany({
      // isTest is already excluded upstream, repeated here so an explicit id
      // list can never reach a Test Parent's fake mailbox.
      where: { id: { in: targetIds }, schoolId: user.schoolId, role: 'PARENT', isTest: false },
      select: { id: true, email: true },
    })

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { name: true, city: true },
    })
    const schoolName = school?.name || 'School'

    // What they have actually missed — the messages sent to this school since
    // they were added. Counted once for the whole batch: it is the same figure
    // for everyone being chased, and it is what makes the email land.
    const missedCount = await prisma.message.count({
      where: { schoolId: user.schoolId, notifiedAt: { not: null } },
    })

    const { sendParentNudgeEmail } = await import('../services/email.js')

    let sent = 0
    let skippedNoEmail = 0
    const emailedIds: string[] = []

    for (const p of parents) {
      if (!p.email) {
        skippedNoEmail++
        continue
      }
      await sendParentNudgeEmail({ to: p.email, schoolName, missedCount })
      emailedIds.push(p.id)
      sent++
    }

    if (emailedIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: emailedIds } },
        data: { lastNudgedAt: new Date() },
      })
    }

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: parentUserIds?.length === 1 ? parentUserIds[0] : 'bulk',
      metadata: { action: 'nudge-never-signed-in', sent, skippedNoEmail, missedCount },
    })

    res.json({ sent, skippedNoEmail, skippedAlreadySignedIn: (parentUserIds?.length ?? 0) - parents.length })
  } catch (error) {
    console.error('Error nudging parents:', error)
    res.status(500).json({ error: 'Failed to send nudges' })
  }
})

router.post('/send-invites', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { parentUserIds } = (req.body || {}) as { parentUserIds?: string[] }

    // NEVER send welcome/sign-in emails to Test Parents (fake mailboxes) — the
    // isTest:false filter drops them even if their id is passed explicitly.
    const where: Record<string, unknown> = { schoolId: user.schoolId, role: 'PARENT', isTest: false }
    if (Array.isArray(parentUserIds) && parentUserIds.length > 0) {
      where.id = { in: parentUserIds }
    }

    const parents = await prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true },
    })

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { name: true, city: true },
    })
    const schoolName = school?.name || 'School'

    const { sendParentWelcomeEmail } = await import('../services/email.js')

    let sent = 0
    let skipped = 0
    const emailedIds: string[] = []

    for (const p of parents) {
      if (!p.email) {
        skipped++
        continue
      }
      await sendParentWelcomeEmail({ to: p.email, schoolName })
      emailedIds.push(p.id)
      sent++
    }

    if (emailedIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: emailedIds } },
        data: { welcomeSentAt: new Date() },
      })
    }

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: 'bulk',
      metadata: { action: 'send-invites', sent, skipped },
    })

    res.json({ sent, skipped })
  } catch (error) {
    console.error('Error sending parent invites:', error)
    res.status(500).json({ error: 'Failed to send invites' })
  }
})

// Get single invitation details
router.get('/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const invitation = await prisma.parentInvitation.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        childLinks: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
        studentLinks: {
          include: {
            student: {
              include: {
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true } },
        redeemedByUser: { select: { id: true, name: true, email: true } },
        school: { select: { name: true, city: true } },
      },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    const qrUrl = await generateQRCode(
      `${process.env.PARENT_APP_URL}/register?code=${invitation.accessCode}`
    )

    res.json({
      id: invitation.id,
      accessCode: invitation.accessCode,
      magicToken: invitation.magicToken,
      parentEmail: invitation.parentEmail,
      parentName: invitation.parentName,
      children: invitation.childLinks.map(cl => ({
        childName: cl.childName,
        className: cl.class.name,
        classId: cl.classId,
      })),
      students: invitation.studentLinks.map(sl => ({
        studentId: sl.student.id,
        studentName: `${sl.student.firstName} ${sl.student.lastName}`,
        className: sl.student.class.name,
      })),
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString(),
      redeemedAt: invitation.redeemedAt?.toISOString(),
      redeemedByUser: invitation.redeemedByUser
        ? { id: invitation.redeemedByUser.id, name: invitation.redeemedByUser.name, email: invitation.redeemedByUser.email }
        : undefined,
      createdBy: { id: invitation.createdBy.id, name: invitation.createdBy.name },
      createdAt: invitation.createdAt.toISOString(),
      schoolName: formalSchoolName(invitation.school),
      qrCodeUrl: qrUrl,
      registrationUrl: `${process.env.PARENT_APP_URL}/register?code=${invitation.accessCode}`,
      magicLinkUrl: invitation.magicToken
        ? `${process.env.PARENT_APP_URL}/register?token=${invitation.magicToken}`
        : undefined,
    })
  } catch (error) {
    console.error('Error fetching invitation:', error)
    res.status(500).json({ error: 'Failed to fetch invitation' })
  }
})

// Create a new invitation
router.post('/', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { parentEmail, parentName, children, studentIds, includeMagicLink, expiresInDays } = req.body

    // Support both old (children) and new (studentIds) approach
    const hasChildren = children && Array.isArray(children) && children.length > 0
    const hasStudents = studentIds && Array.isArray(studentIds) && studentIds.length > 0

    if (!hasChildren && !hasStudents) {
      return res.status(400).json({ error: 'At least one child or student must be specified' })
    }

    // Validate class IDs if using children approach
    if (hasChildren) {
      const classIds = [...new Set(children.map((c: { classId: string }) => c.classId))]
      const classes = await prisma.class.findMany({
        where: { id: { in: classIds }, schoolId: user.schoolId },
      })
      if (classes.length !== classIds.length) {
        return res.status(400).json({ error: 'One or more class IDs are invalid' })
      }
    }

    // Validate student IDs if using students approach
    let validStudents: Array<{ id: string; firstName: string; lastName: string; class: { id: string; name: string } }> = []
    if (hasStudents) {
      validStudents = await prisma.student.findMany({
        where: { id: { in: studentIds }, schoolId: user.schoolId },
        include: { class: { select: { id: true, name: true } } },
      })
      if (validStudents.length !== studentIds.length) {
        return res.status(400).json({ error: 'One or more student IDs are invalid' })
      }
    }

    // Generate codes
    let accessCode: string
    let attempts = 0
    do {
      accessCode = generateAccessCode()
      const existing = await prisma.parentInvitation.findUnique({ where: { accessCode } })
      if (!existing) break
      attempts++
    } while (attempts < 10)

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate unique access code' })
    }

    const magicToken = includeMagicLink ? generateMagicToken() : null

    // Calculate expiry
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : getDefaultExpiryDate()

    const invitation = await prisma.parentInvitation.create({
      data: {
        schoolId: user.schoolId,
        accessCode,
        magicToken,
        parentEmail: parentEmail || null,
        parentName: parentName || null,
        expiresAt,
        createdById: user.id,
        childLinks: hasChildren
          ? {
              create: children.map((c: { childName: string; classId: string }) => ({
                childName: c.childName,
                classId: c.classId,
              })),
            }
          : undefined,
        studentLinks: hasStudents
          ? {
              create: studentIds.map((studentId: string) => ({
                studentId,
              })),
            }
          : undefined,
      },
      include: {
        childLinks: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
        studentLinks: {
          include: {
            student: {
              include: {
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    })

    // Auto-send invitation email if parent email is provided
    let emailSent = false
    if (parentEmail) {
      try {
        const { buildInvitationEmail } = await import('../services/email.js')
        const { sendEmail } = await import('../services/email.js')
        const PARENT_APP_URL = process.env.PARENT_APP_URL || 'http://localhost:3000'
        const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, city: true } })
        const childrenNames = [
          ...invitation.childLinks.map(cl => cl.childName),
          ...invitation.studentLinks.map(sl => `${sl.student.firstName} ${sl.student.lastName}`),
        ]
        const email = buildInvitationEmail({
          accessCode: invitation.accessCode,
          schoolName: formalSchoolName(school),
          childrenNames,
          parentAppUrl: PARENT_APP_URL,
        })
        emailSent = await sendEmail({ to: parentEmail, ...email })
      } catch (err) {
        console.error('Failed to auto-send invitation email:', err)
      }
    }

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: invitation.id,
      metadata: {
        parentEmail,
        childCount: hasChildren ? children.length : 0,
        studentCount: hasStudents ? studentIds.length : 0,
        emailSent,
      },
    })

    res.status(201).json({
      id: invitation.id,
      accessCode: invitation.accessCode,
      magicToken: invitation.magicToken,
      parentEmail: invitation.parentEmail,
      parentName: invitation.parentName,
      children: invitation.childLinks.map(cl => ({
        childName: cl.childName,
        className: cl.class.name,
        classId: cl.classId,
      })),
      students: invitation.studentLinks.map(sl => ({
        studentId: sl.student.id,
        studentName: `${sl.student.firstName} ${sl.student.lastName}`,
        className: sl.student.class.name,
      })),
      emailSent,
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      registrationUrl: `${process.env.PARENT_APP_URL}/register?code=${invitation.accessCode}`,
      magicLinkUrl: invitation.magicToken
        ? `${process.env.PARENT_APP_URL}/register?token=${invitation.magicToken}`
        : undefined,
    })
  } catch (error) {
    console.error('Error creating invitation:', error)
    res.status(500).json({ error: 'Failed to create invitation' })
  }
})

// Bulk import from CSV
router.post('/bulk', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { csvContent, expiresInDays } = req.body

    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' })
    }

    // Parse CSV (auto-detects UPN vs legacy format)
    const { rows, format } = parseCSV(csvContent)
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid rows found in CSV' })
    }

    // Group by parent
    const grouped = groupByParent(rows)

    // Resolve children — either by UPN or by class name
    let studentsByUPN = new Map<string, { id: string; firstName: string; lastName: string; classId: string; className: string }>()
    let classNameToId = new Map<string, string>()

    if (format === 'upn') {
      // Look up students by externalId (UPN)
      const upns = [...new Set(rows.map(r => r.childUPN).filter(Boolean) as string[])]
      const students = await prisma.student.findMany({
        where: { schoolId: user.schoolId, externalId: { in: upns } },
        include: { class: { select: { id: true, name: true } } },
      })

      students.forEach(s => {
        if (s.externalId) {
          studentsByUPN.set(s.externalId, {
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            classId: s.classId,
            className: s.class.name,
          })
        }
      })

      // Check for missing UPNs
      const missingUPNs = upns.filter(u => !studentsByUPN.has(u))
      if (missingUPNs.length > 0) {
        return res.status(400).json({
          error: `${missingUPNs.length} student UPN(s) not found in the system`,
          missingUPNs,
        })
      }
    } else {
      // Legacy: look up by class name
      const classNames = [...new Set(rows.map(r => r.className).filter(Boolean) as string[])]
      const classes = await prisma.class.findMany({
        where: { schoolId: user.schoolId, name: { in: classNames } },
      })
      classNameToId = new Map(classes.map(c => [c.name, c.id]))

      const missingClasses = classNames.filter(name => !classNameToId.has(name))
      if (missingClasses.length > 0) {
        return res.status(400).json({
          error: 'Some class names not found',
          missingClasses,
        })
      }
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : getDefaultExpiryDate()

    // Create invitations
    const created: Array<{ parentEmail: string; accessCode: string; childCount: number; children: string[] }> = []
    const errors: string[] = []

    for (const group of grouped) {
      try {
        let accessCode: string
        let attempts = 0
        do {
          accessCode = generateAccessCode()
          const existing = await prisma.parentInvitation.findUnique({ where: { accessCode } })
          if (!existing) break
          attempts++
        } while (attempts < 10)

        if (attempts >= 10) {
          errors.push(`${group.parentEmail}: Failed to generate unique code`)
          continue
        }

        const magicToken = generateMagicToken()

        if (format === 'upn') {
          // UPN format: create invitation + link to existing students
          const studentIds: string[] = []
          const childNames: string[] = []
          for (const child of group.children) {
            if (child.childUPN) {
              const student = studentsByUPN.get(child.childUPN)
              if (student) {
                studentIds.push(student.id)
                childNames.push(`${student.firstName} ${student.lastName}`)
              }
            }
          }

          await prisma.parentInvitation.create({
            data: {
              schoolId: user.schoolId,
              accessCode,
              magicToken,
              parentEmail: group.parentEmail,
              parentName: group.parentName || null,
              expiresAt,
              createdById: user.id,
              studentLinks: {
                create: studentIds.map(sid => ({ studentId: sid })),
              },
            },
          })

          created.push({
            parentEmail: group.parentEmail,
            accessCode,
            childCount: studentIds.length,
            children: childNames,
          })
        } else {
          // Legacy format: create with child name + class
          await prisma.parentInvitation.create({
            data: {
              schoolId: user.schoolId,
              accessCode,
              magicToken,
              parentEmail: group.parentEmail,
              parentName: group.parentName || null,
              expiresAt,
              createdById: user.id,
              childLinks: {
                create: group.children.map(c => ({
                  childName: c.childName!,
                  classId: classNameToId.get(c.className!)!,
                })),
              },
            },
          })

          created.push({
            parentEmail: group.parentEmail,
            accessCode,
            childCount: group.children.length,
            children: group.children.map(c => c.childName!),
          })
        }
      } catch (err) {
        console.error(`Error creating invitation for ${group.parentEmail}:`, err)
        errors.push(`${group.parentEmail}: Failed to create invitation`)
      }
    }

    // Send batch invitation emails
    let emailStats = { sent: 0, failed: 0 }
    const emailsToSend = created.filter(inv => inv.parentEmail)
    if (emailsToSend.length > 0) {
      try {
        const { buildInvitationEmail, sendBatchEmails } = await import('../services/email.js')
        const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, city: true } })
        const PARENT_APP_URL = process.env.PARENT_APP_URL || 'http://localhost:3000'

        const emails = emailsToSend.map(inv => {
          const email = buildInvitationEmail({
            accessCode: inv.accessCode,
            schoolName: formalSchoolName(school),
            childrenNames: inv.children,
            parentAppUrl: PARENT_APP_URL,
          })
          return { to: inv.parentEmail, ...email }
        })

        emailStats = await sendBatchEmails(emails)
        console.log(`[Bulk Invite] Batch email: ${emailStats.sent} sent, ${emailStats.failed} failed`)
      } catch (err) {
        console.error('[Bulk Invite] Batch email failed:', err)
        emailStats.failed = emailsToSend.length
      }
    }

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: 'bulk',
      metadata: { count: created.length, format, emailsSent: emailStats.sent, emailsFailed: emailStats.failed },
    })

    res.status(201).json({
      format,
      created: created.length,
      skipped: grouped.length - created.length,
      invitations: created,
      emailsSent: emailStats.sent,
      emailsFailed: emailStats.failed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error bulk importing invitations:', error)
    res.status(500).json({ error: 'Failed to import invitations' })
  }
})

// Revoke a pending invitation
// ─── Sign-up event: a class's worth of sign-in codes ─────────────────────────
//
//   POST /parent-invitations/sign-in-codes/by-class  { classId, expiresInHours }
//
// For a mass sign-up event: a teacher hands a parent their slip and they're in,
// without waiting on an email. These are the SAME 6-digit codes the app already
// signs parents in with (createLoginCode) — printed ahead of time instead of
// emailed on demand — so there's one mechanism to explain and nothing new for a
// parent to learn.
//
// A LoginCode is keyed to an EMAIL, not a user, and minting supersedes any
// earlier code for that address. Two consequences worth knowing: a parent with
// two guardians on file gets a slip each, and if a parent requests their own
// code by email afterwards, the printed one stops working (and vice versa).
//
// A pupil whose guardian has no Connect account can't be given a sign-in code —
// there's nothing to sign in to. Those are returned separately so the office can
// see who still needs an account rather than wondering why a slip is missing.
router.post('/sign-in-codes/by-class', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { classId, expiresInHours } = req.body as { classId?: string; expiresInHours?: number }
    // No classId (or 'all') means the whole school — a school-wide sign-up event
    // shouldn't mean running this sixteen times and collating the stacks.
    const wholeSchool = !classId || classId === 'all'

    const hours = Number(expiresInHours)
    // Bounded deliberately: a printed code is a standing key to an account, and
    // these normally live for minutes. A week is the outside case.
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      return res.status(400).json({ error: 'expiresInHours must be between 1 and 168' })
    }

    let klass: { id: string; name: string } | null = null
    if (!wholeSchool) {
      klass = await prisma.class.findFirst({
        where: { id: classId, schoolId: user.schoolId },
        select: { id: true, name: true },
      })
      if (!klass) return res.status(404).json({ error: 'Class not found' })
    }

    // Test Students never appear on a sign-up sheet.
    const students = await prisma.student.findMany({
      where: {
        schoolId: user.schoolId,
        isTest: false,
        ...(klass ? { classId: klass.id } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        class: { select: { name: true } },
        parentLinks: {
          select: {
            user: { select: { id: true, name: true, email: true, isTest: true, lastLoginAt: true } },
          },
        },
      },
      // Ordered by class so a whole-school run prints as separable stacks.
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
    })

    // One slip per guardian EMAIL, listing every child of theirs in scope. Each
    // child carries its class, because across a whole school a parent's children
    // can sit in different ones — and the slip has to be filed under a class.
    type Child = { name: string; className: string | null }
    const byEmail = new Map<string, { userId: string; name: string; email: string; children: Child[]; hasLoggedIn: boolean }>()
    const withoutAccount: Child[] = []

    for (const s of students) {
      const child: Child = { name: `${s.firstName} ${s.lastName}`.trim(), className: s.class?.name ?? null }
      const guardians = s.parentLinks.map(l => l.user).filter(g => g?.email && !g.isTest)
      if (guardians.length === 0) {
        withoutAccount.push(child)
        continue
      }
      for (const g of guardians) {
        const key = g.email.toLowerCase()
        const existing = byEmail.get(key)
        if (existing) {
          if (!existing.children.some(c => c.name === child.name)) existing.children.push(child)
          continue
        }
        byEmail.set(key, {
          userId: g.id,
          name: g.name,
          email: g.email,
          children: [child],
          hasLoggedIn: !!g.lastLoginAt,
        })
      }
    }

    const codes = []
    for (const g of byEmail.values()) {
      const { code, expiresAt } = await createLoginCode(g.email.toLowerCase(), hours * 60)
      codes.push({
        userId: g.userId,
        parentName: g.name,
        email: g.email,
        code,
        expiresAt: expiresAt.toISOString(),
        children: g.children,
        hasLoggedIn: g.hasLoggedIn,
      })
    }

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'USER',
      resourceId: klass?.id ?? user.schoolId,
      metadata: {
        action: 'sign-in-codes-by-class',
        scope: wholeSchool ? 'whole-school' : 'class',
        className: klass?.name ?? null,
        codes: codes.length,
        pupilsWithoutAccount: withoutAccount.length,
        expiresInHours: hours,
      },
    })

    res.json({
      className: klass?.name ?? null,
      wholeSchool,
      codes,
      pupilsWithoutAccount: withoutAccount,
    })
  } catch (error) {
    console.error('Error minting class sign-in codes:', error)
    res.status(500).json({ error: 'Failed to create sign-in codes' })
  }
})

// Clear EVERY outstanding sign-in code for this school's parents — the tidy-up
// after an event, when the slips are in a bin somewhere and you no longer have
// the batch on screen to revoke it precisely.
//
// Blunt on purpose, and it says so at the confirm: this also clears codes
// parents requested by email themselves in the last few minutes. That costs them
// one tap to request another, which is the right trade against leaving a stack
// of printed keys alive because the precise version was too much faff.
router.post('/sign-in-codes/revoke-all', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!

    // School-scoped by construction: only addresses belonging to THIS school's
    // parents, never a blanket delete of the LoginCode table.
    const parents = await prisma.user.findMany({
      where: { schoolId: user.schoolId, role: 'PARENT' },
      select: { email: true },
    })
    const emails = parents.map(p => p.email.toLowerCase()).filter(Boolean)
    if (emails.length === 0) return res.json({ revoked: 0 })

    const { count } = await prisma.loginCode.deleteMany({ where: { email: { in: emails } } })

    logAudit({
      req,
      action: 'DELETE',
      resourceType: 'USER',
      resourceId: user.schoolId,
      metadata: { action: 'revoke-all-sign-in-codes', parents: emails.length, revoked: count },
    })

    res.json({ revoked: count })
  } catch (error) {
    console.error('Error revoking all sign-in codes:', error)
    res.status(500).json({ error: 'Failed to revoke sign-in codes' })
  }
})

// Kill printed codes early. After an event every unused slip is still a live key
// until it expires, and deleting them one at a time is how they get left alive.
// A code the parent has already used is gone from the table anyway.
router.post('/sign-in-codes/revoke', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { emails } = req.body as { emails?: string[] }
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails is required' })
    }

    const normalized = emails.map(e => String(e).toLowerCase())
    // School-scoped: only addresses belonging to THIS school's parents, so an
    // admin can't clear codes for an account outside their school.
    const mine = await prisma.user.findMany({
      where: { email: { in: normalized }, schoolId: user.schoolId, role: 'PARENT' },
      select: { email: true },
    })
    const allowed = mine.map(m => m.email.toLowerCase())
    if (allowed.length === 0) return res.json({ revoked: 0 })

    const { count } = await prisma.loginCode.deleteMany({ where: { email: { in: allowed } } })

    logAudit({
      req,
      action: 'DELETE',
      resourceType: 'USER',
      resourceId: user.schoolId,
      metadata: { action: 'revoke-printed-sign-in-codes', requested: emails.length, revoked: count },
    })

    res.json({ revoked: count })
  } catch (error) {
    console.error('Error revoking sign-in codes:', error)
    res.status(500).json({ error: 'Failed to revoke sign-in codes' })
  }
})

router.patch('/:id/revoke', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const invitation = await prisma.parentInvitation.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invitations can be revoked' })
    }

    await prisma.parentInvitation.update({
      where: { id },
      data: { status: 'REVOKED' },
    })

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: id,
      metadata: { action: 'revoke' },
    })

    res.json({ message: 'Invitation revoked successfully' })
  } catch (error) {
    console.error('Error revoking invitation:', error)
    res.status(500).json({ error: 'Failed to revoke invitation' })
  }
})

// Regenerate access code for an invitation
router.post('/:id/regenerate', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const invitation = await prisma.parentInvitation.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invitations can be regenerated' })
    }

    let accessCode: string
    let attempts = 0
    do {
      accessCode = generateAccessCode()
      const existing = await prisma.parentInvitation.findUnique({ where: { accessCode } })
      if (!existing) break
      attempts++
    } while (attempts < 10)

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate unique access code' })
    }

    const magicToken = generateMagicToken()

    await prisma.parentInvitation.update({
      where: { id },
      data: { accessCode, magicToken },
    })

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: id,
      metadata: { action: 'regenerate' },
    })

    res.json({
      accessCode,
      magicToken,
      registrationUrl: `${process.env.PARENT_APP_URL}/register?code=${accessCode}`,
      magicLinkUrl: `${process.env.PARENT_APP_URL}/register?token=${magicToken}`,
    })
  } catch (error) {
    console.error('Error regenerating codes:', error)
    res.status(500).json({ error: 'Failed to regenerate codes' })
  }
})

// Resend magic link email (placeholder - would integrate with email service)
router.patch('/:id/resend', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const invitation = await prisma.parentInvitation.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        school: { select: { name: true, city: true } },
        childLinks: true,
        studentLinks: { include: { student: true } },
      },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invitations can be resent' })
    }

    if (!invitation.parentEmail) {
      return res.status(400).json({ error: 'No email address associated with this invitation' })
    }

    // Send invitation email
    const childrenNames = [
      ...invitation.childLinks.map(c => c.childName),
      ...invitation.studentLinks.map(s => `${s.student.firstName} ${s.student.lastName}`),
    ]

    const PARENT_APP_URL = process.env.PARENT_APP_URL || 'http://localhost:3000'
    const magicLink = `${PARENT_APP_URL}/register?code=${invitation.accessCode}`

    const { sendInvitationEmail } = await import('../services/email.js')
    const emailSent = await sendInvitationEmail({
      to: invitation.parentEmail,
      magicLink,
      accessCode: invitation.accessCode,
      schoolName: formalSchoolName(invitation.school),
      childrenNames,
    })

    if (!emailSent) {
      console.error('Failed to send invitation email to', invitation.parentEmail)
    }

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: id,
      metadata: { action: 'resend', email: invitation.parentEmail },
    })

    res.json({ message: 'Invitation email sent successfully' })
  } catch (error) {
    console.error('Error resending invitation:', error)
    res.status(500).json({ error: 'Failed to resend invitation' })
  }
})

// ============ Public/Parent Endpoints ============

// Validate an access code or magic token (rate limited)
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown'

    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
    }

    const { code, token } = req.body

    if (!code && !token) {
      return res.status(400).json({ error: 'Access code or magic token is required' })
    }

    let invitation

    if (token) {
      invitation = await prisma.parentInvitation.findUnique({
        where: { magicToken: token },
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          school: { select: { id: true, name: true, logoUrl: true, brandColor: true } },
        },
      })
    } else {
      // Normalize code: uppercase and add dashes if missing
      const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const formattedCode =
        normalizedCode.length === 9
          ? `${normalizedCode.slice(0, 3)}-${normalizedCode.slice(3, 6)}-${normalizedCode.slice(6, 9)}`
          : code.toUpperCase()

      invitation = await prisma.parentInvitation.findUnique({
        where: { accessCode: formattedCode },
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          school: { select: { id: true, name: true, logoUrl: true, brandColor: true } },
        },
      })
    }

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid access code or link' })
    }

    if (invitation.status === 'REVOKED') {
      return res.status(400).json({ error: 'This invitation has been revoked' })
    }

    if (invitation.status === 'REDEEMED') {
      return res.status(400).json({ error: 'This invitation has already been used' })
    }

    if (invitation.status === 'EXPIRED' || isInvitationExpired(invitation.expiresAt)) {
      return res.status(400).json({ error: 'This invitation has expired' })
    }

    res.json({
      valid: true,
      invitationId: invitation.id,
      parentEmail: invitation.parentEmail,
      school: {
        id: invitation.school.id,
        name: invitation.school.name,
        logoUrl: invitation.school.logoUrl,
        brandColor: invitation.school.brandColor,
      },
      children: invitation.childLinks.map(cl => ({
        childName: cl.childName,
        className: cl.class.name,
      })),
      students: invitation.studentLinks.map(sl => ({
        studentId: sl.student.id,
        studentName: `${sl.student.firstName} ${sl.student.lastName}`,
        className: sl.student.class.name,
      })),
      parentName: invitation.parentName,
    })
  } catch (error) {
    console.error('Error validating invitation:', error)
    res.status(500).json({ error: 'Failed to validate invitation' })
  }
})

// Redeem an invitation (after OAuth)
router.post('/redeem', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { code, token } = req.body

    if (!code && !token) {
      return res.status(400).json({ error: 'Access code or magic token is required' })
    }

    let invitation

    if (token) {
      invitation = await prisma.parentInvitation.findUnique({
        where: { magicToken: token },
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          school: true,
        },
      })
    } else {
      const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const formattedCode =
        normalizedCode.length === 9
          ? `${normalizedCode.slice(0, 3)}-${normalizedCode.slice(3, 6)}-${normalizedCode.slice(6, 9)}`
          : code.toUpperCase()

      invitation = await prisma.parentInvitation.findUnique({
        where: { accessCode: formattedCode },
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          school: true,
        },
      })
    }

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid access code or link' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: `This invitation is ${invitation.status.toLowerCase()}` })
    }

    if (isInvitationExpired(invitation.expiresAt)) {
      await prisma.parentInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      return res.status(400).json({ error: 'This invitation has expired' })
    }

    // Update user's school and role if needed, create children/student links
    await prisma.$transaction(async (tx) => {
      // Update user to be a parent at this school
      await tx.user.update({
        where: { id: user.id },
        data: {
          schoolId: invitation.schoolId,
          role: 'PARENT',
        },
      })

      // Create children (legacy approach)
      for (const childLink of invitation.childLinks) {
        await tx.child.create({
          data: {
            name: childLink.childName,
            parentId: user.id,
            classId: childLink.classId,
          },
        })
      }

      // Create ParentStudentLink records (new approach)
      for (const studentLink of invitation.studentLinks) {
        // Check if link already exists (avoid duplicates)
        const existingLink = await tx.parentStudentLink.findUnique({
          where: {
            userId_studentId: {
              userId: user.id,
              studentId: studentLink.studentId,
            },
          },
        })
        if (!existingLink) {
          await tx.parentStudentLink.create({
            data: {
              userId: user.id,
              studentId: studentLink.studentId,
            },
          })
        }
      }

      // Mark invitation as redeemed
      await tx.parentInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'REDEEMED',
          redeemedAt: new Date(),
          redeemedByUserId: user.id,
        },
      })
    })

    res.json({
      success: true,
      school: {
        id: invitation.school.id,
        name: invitation.school.name,
      },
      children: invitation.childLinks.map(cl => ({
        childName: cl.childName,
        className: cl.class.name,
      })),
      students: invitation.studentLinks.map(sl => ({
        studentId: sl.student.id,
        studentName: `${sl.student.firstName} ${sl.student.lastName}`,
        className: sl.student.class.name,
      })),
    })
  } catch (error) {
    console.error('Error redeeming invitation:', error)
    res.status(500).json({ error: 'Failed to redeem invitation' })
  }
})

// Magic link redirect (redirects to registration page with token)
router.get('/magic/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params

    const invitation = await prisma.parentInvitation.findUnique({
      where: { magicToken: token },
    })

    if (!invitation) {
      return res.redirect(`${process.env.PARENT_APP_URL}/register?error=invalid`)
    }

    if (invitation.status !== 'PENDING') {
      return res.redirect(`${process.env.PARENT_APP_URL}/register?error=${invitation.status.toLowerCase()}`)
    }

    if (isInvitationExpired(invitation.expiresAt)) {
      return res.redirect(`${process.env.PARENT_APP_URL}/register?error=expired`)
    }

    res.redirect(`${process.env.PARENT_APP_URL}/register?token=${token}`)
  } catch (error) {
    console.error('Error processing magic link:', error)
    res.redirect(`${process.env.PARENT_APP_URL}/register?error=server`)
  }
})

export default router
