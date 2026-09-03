import prisma from './prisma.js'
import { formalSchoolName } from './schoolName.js'
import { resolveAudienceParentIds } from './notify.js'
import logger from './logger.js'

/**
 * Admin Notices — messages from a school department (clinic, accounts) that sit
 * in their own section rather than the feed.
 *
 * The whole point of keeping them out of the feed is that a fee reminder and a
 * medication note are not news and should not compete with it. The cost of that
 * is discoverability, which email pays for: a parent gets told there is
 * something waiting, without being told what it says.
 */

/**
 * Tell an audience there is a notice waiting.
 *
 * Content-free by design — the email carries the department and nothing else,
 * not even the title. See sendAdminNoticeSignalEmail for why.
 *
 * Uses the same audience resolution as the push path, so "Year 3" means the
 * same set of people whichever way a message reaches them.
 */
export async function signalAdminNotice(params: {
  schoolId: string
  department: string | null
  target: {
    targetClass: string
    classId?: string
    yearGroupId?: string
    groupId?: string
    schoolId: string
  }
}): Promise<{ sent: number; skippedNoEmail: number }> {
  const parentUserIds = await resolveAudienceParentIds(params.target)
  if (parentUserIds.length === 0) return { sent: 0, skippedNoEmail: 0 }

  const [school, parents] = await Promise.all([
    prisma.school.findUnique({ where: { id: params.schoolId }, select: { name: true, city: true } }),
    prisma.user.findMany({
      // Test Parents have fake mailboxes and must never be emailed.
      where: { id: { in: parentUserIds }, isTest: false },
      select: { id: true, email: true },
    }),
  ])

  const withEmail = parents.filter(p => !!p.email)
  const skippedNoEmail = parents.length - withEmail.length
  if (withEmail.length === 0) return { sent: 0, skippedNoEmail }

  const { sendAdminNoticeSignalEmail } = await import('./email.js')
  const schoolName = formalSchoolName(school)

  let sent = 0
  for (const parent of withEmail) {
    // One failed address must not stop the rest of the audience being told.
    try {
      const ok = await sendAdminNoticeSignalEmail({
        to: parent.email,
        schoolName,
        department: params.department,
      })
      if (ok) sent++
    } catch (err) {
      logger.error({ err, userId: parent.id }, 'admin notice signal email failed')
    }
  }

  // Counts only — never the department's message, and never a recipient.
  logger.info({ schoolId: params.schoolId, sent, skippedNoEmail }, 'admin notice signalled')
  return { sent, skippedNoEmail }
}

/**
 * How many notices this parent has not seen, for the homepage bar.
 *
 * Counted against User.noticesLastSeenAt rather than per-message read rows: the
 * bar needs a number, not per-item state. A parent who has never opened the
 * section sees everything as new, which is correct.
 */
export async function unseenNoticeCount(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { schoolId: true, noticesLastSeenAt: true },
  })
  if (!user) return 0

  const now = new Date()
  return prisma.message.count({
    where: {
      schoolId: user.schoolId,
      channel: 'ADMIN_NOTICE',
      // Same visibility rules the section itself applies — a scheduled notice
      // that has not come due yet is not something to chase someone about.
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      ...(user.noticesLastSeenAt ? { createdAt: { gt: user.noticesLastSeenAt } } : {}),
    },
  })
}
