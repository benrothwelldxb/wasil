// Admin-only provisioning for "Test Student" backdoor accounts — a flagged
// Test Student enrolled in a real class plus a linked Test Parent that signs in
// with the fixed env-gated TEST_LOGIN_CODE (see /auth/code/verify). These see
// the REAL, LIVE parent app for the class, but are excluded from every staff
// list and all analytics (see the isTest filters across routes/services).
//
// All three routes are isAdmin + hard-scoped to the caller's school.
//   POST   /api/admin/test-accounts/provision  → ensure one pair per class
//   GET    /api/admin/test-accounts            → list existing test parents
//   DELETE /api/admin/test-accounts            → remove them all (reversible)
import { Router, Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

// "FS1 Blue" → "fs1blue" — lowercased, non-alphanumerics stripped.
function classSlug(className: string): string {
  return className.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Domain of the requesting admin's own email — the test parents' fake mailboxes
// live on the school's real domain so they read as belonging to the school.
function emailDomain(adminEmail: string): string {
  return (adminEmail.split('@')[1] || 'example.com').toLowerCase()
}

// POST /api/admin/test-accounts/provision — idempotent find-or-create of one
// Test Student + Test Parent (+ link) for every class in the admin's school.
router.post('/provision', isAdmin, async (req: Request, res: Response) => {
  try {
    const admin = req.user!
    const schoolId = admin.schoolId
    const domain = emailDomain(admin.email)

    // Class has no archived flag in the schema, so every class is live.
    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const provisioned: Array<{ classId: string; className: string; email: string }> = []

    for (const cls of classes) {
      const email = `test.${classSlug(cls.name)}@${domain}`

      // Test Student — deterministic identity is (isTest, classId).
      let student = await prisma.student.findFirst({
        where: { isTest: true, classId: cls.id, schoolId },
        select: { id: true },
      })
      if (!student) {
        student = await prisma.student.create({
          data: {
            firstName: 'Test Student',
            lastName: `(${cls.name})`,
            schoolId,
            classId: cls.id,
            isTest: true,
          },
          select: { id: true },
        })
      }

      // Test Parent — unique by email (find-or-create).
      let parent = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
      if (!parent) {
        parent = await prisma.user.create({
          data: {
            email,
            name: `Test Parent (${cls.name})`,
            role: 'PARENT',
            schoolId,
            isTest: true,
          },
          select: { id: true },
        })
      }

      // Link — unique on (userId, studentId).
      await prisma.parentStudentLink.upsert({
        where: { userId_studentId: { userId: parent.id, studentId: student.id } },
        create: { userId: parent.id, studentId: student.id },
        update: {},
      })

      provisioned.push({ classId: cls.id, className: cls.name, email })
    }

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'USER',
      resourceId: 'test-accounts',
      metadata: { action: 'provision', count: provisioned.length },
    })

    // Never echo the code value — just whether it is configured.
    res.json({ provisioned, loginCode: process.env.TEST_LOGIN_CODE ? 'set' : 'NOT SET' })
  } catch (error) {
    console.error('Error provisioning test accounts:', error)
    res.status(500).json({ error: 'Failed to provision test accounts' })
  }
})

// GET /api/admin/test-accounts — list existing test parents in the school.
router.get('/', isAdmin, async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId

    const parents = await prisma.user.findMany({
      where: { schoolId, role: 'PARENT', isTest: true },
      select: {
        email: true,
        studentLinks: {
          select: {
            student: {
              select: {
                firstName: true,
                lastName: true,
                isTest: true,
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { email: 'asc' },
    })

    const testAccounts = parents.flatMap(p =>
      p.studentLinks
        .filter(l => l.student.isTest)
        .map(l => ({
          classId: l.student.class.id,
          className: l.student.class.name,
          email: p.email,
          studentName: `${l.student.firstName} ${l.student.lastName}`.trim(),
        })),
    )

    res.json({ testAccounts })
  } catch (error) {
    console.error('Error listing test accounts:', error)
    res.status(500).json({ error: 'Failed to list test accounts' })
  }
})

// DELETE /api/admin/test-accounts — remove all test students + test parents for
// the school (+ their links, conversations, tokens, etc.). FK-safe order: clear
// the RESTRICT-referencing rows first, then cascade the rest via Student/User.
router.delete('/', isAdmin, async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId

    const [testUsers, testStudents] = await Promise.all([
      prisma.user.findMany({ where: { schoolId, isTest: true }, select: { id: true, email: true } }),
      prisma.student.findMany({ where: { schoolId, isTest: true }, select: { id: true } }),
    ])
    const userIds = testUsers.map(u => u.id)
    const emails = testUsers.map(u => u.email)
    const studentIds = testStudents.map(s => s.id)

    if (userIds.length === 0 && studentIds.length === 0) {
      return res.json({ removedParents: 0, removedStudents: 0 })
    }

    await prisma.$transaction(async tx => {
      // Conversations these test parents own (and any threads about a test
      // pupil). Delete their messages + participants first (sender/participant
      // FKs are RESTRICT), then the conversations themselves.
      const convos = await tx.conversation.findMany({
        where: { OR: [{ parentId: { in: userIds } }, { studentId: { in: studentIds } }] },
        select: { id: true },
      })
      const convoIds = convos.map(c => c.id)

      await tx.conversationMessage.deleteMany({
        where: { OR: [{ senderId: { in: userIds } }, { conversationId: { in: convoIds } }] },
      })
      await tx.conversationParticipant.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { conversationId: { in: convoIds } }] },
      })
      await tx.conversation.deleteMany({ where: { id: { in: convoIds } } })

      // Other RESTRICT-referencing rows tied to the test parent / pupil.
      await tx.messageReaction.deleteMany({ where: { userId: { in: userIds } } })
      await tx.attendanceRequest.deleteMany({
        where: { OR: [{ parentId: { in: userIds } }, { studentId: { in: studentIds } }] },
      })
      await tx.serviceRegistration.deleteMany({ where: { parentId: { in: userIds } } })
      await tx.consultationBooking.deleteMany({ where: { parentId: { in: userIds } } })
      await tx.alertAcknowledgment.deleteMany({ where: { parentId: { in: userIds } } })
      await tx.alertDelivery.deleteMany({ where: { parentId: { in: userIds } } })
      await tx.studentInvitationLink.deleteMany({ where: { studentId: { in: studentIds } } })

      // Links (also Cascade-covered, but explicit keeps intent clear).
      await tx.parentStudentLink.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { studentId: { in: studentIds } }] },
      })

      // Any passwordless codes minted for the fake mailboxes (keyed by email).
      if (emails.length > 0) await tx.loginCode.deleteMany({ where: { email: { in: emails } } })

      // Students cascade their attendance/reports/IEP/ECA/group rows.
      await tx.student.deleteMany({ where: { id: { in: studentIds } } })
      // Users cascade refresh/device tokens, notifications, acks, RSVPs, etc.
      await tx.user.deleteMany({ where: { id: { in: userIds } } })
    })

    logAudit({
      req,
      action: 'DELETE',
      resourceType: 'USER',
      resourceId: 'test-accounts',
      metadata: { action: 'delete', removedParents: userIds.length, removedStudents: studentIds.length },
    })

    res.json({ removedParents: userIds.length, removedStudents: studentIds.length })
  } catch (error) {
    console.error('Error deleting test accounts:', error)
    res.status(500).json({ error: 'Failed to delete test accounts' })
  }
})

export default router
