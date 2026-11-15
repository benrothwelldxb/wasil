import type { Prisma } from '@prisma/client'
import prisma from './prisma.js'
import { sendNotification } from './notify.js'
import logger from './logger.js'

/**
 * When a child's report reaches their parents.
 *
 * A report delivered by another Wasil app (CP-1) may carry a `publishAt`. Until
 * then it is invisible to parents: not on the reports page, not in any count,
 * not announced. Admins see it, marked as scheduled. At `publishAt` it becomes
 * visible and the parents are told: told at RELEASE, never on arrival, so a
 * class set uploaded on Thursday for Monday does not notify on Thursday.
 *
 * Holding a report back for unpaid fees is not modelled here at all. The
 * sending app simply does not send it until it should be seen; Connect holds
 * no fee information.
 */

/** Every parent-facing read of StudentReport goes through this. A report with
 *  no publishAt is visible on arrival (every admin upload, and a partner
 *  report sent "now"). */
export function parentVisibleReportWhere(now: Date = new Date()): Prisma.StudentReportWhereInput {
  return { OR: [{ publishAt: null }, { publishAt: { lte: now } }] }
}

export function isVisibleToParents(report: { publishAt: Date | null }, now: Date = new Date()): boolean {
  return !report.publishAt || report.publishAt.getTime() <= now.getTime()
}

/**
 * Tell a child's parents about a report: a first release ("new") or a
 * correction to one they can already see ("updated"). Audience is the child's
 * parentStudentLink, nothing the sender says. Respects the parent's "Reports"
 * preference. Never throws (sendNotification swallows its own failures).
 */
export async function announceReport(
  report: { id: string; studentId: string; schoolId: string; title: string | null; reportPeriod: string | null },
  kind: 'new' | 'updated',
): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: report.studentId },
    select: { firstName: true },
  })
  const name = student?.firstName?.trim() || 'your child'
  await sendNotification({
    type: 'STUDENT_REPORT',
    title: kind === 'new' ? `A new report for ${name} is ready` : `An updated report for ${name} is ready`,
    body: report.title || report.reportPeriod || 'Open Reports in the app to read it.',
    resourceType: 'STUDENT_REPORT',
    resourceId: report.id,
    data: { route: '/report-cards' },
    // Label only: the studentIds branch is the audience and never falls wider.
    target: { targetClass: 'Reports', studentIds: [report.studentId], schoolId: report.schoolId },
  })
}

const BATCH = 100

/**
 * Release scheduled reports whose time has come. Runs every minute.
 *
 * Claim-then-send, as for scheduled posts: `notifiedAt` is stamped by a
 * conditional updateMany that only matches a row still unclaimed and still
 * due, so two replicas cannot both announce it, and a report withdrawn or
 * re-scheduled between the read and the claim is simply not matched. A crash
 * between claim and send loses one announcement; the report is still visible.
 * A duplicate is the worse failure.
 *
 * Only partner-delivered rows are ever swept (`sourceApp` set). An admin
 * upload has neither publishAt nor notifiedAt and must never be announced
 * retroactively by this.
 */
export async function releaseDueReports(): Promise<void> {
  const now = new Date()
  const due = await prisma.studentReport.findMany({
    where: { sourceApp: { not: null }, notifiedAt: null, publishAt: { not: null, lte: now } },
    select: { id: true, studentId: true, schoolId: true, title: true, reportPeriod: true },
    orderBy: { publishAt: 'asc' },
    take: BATCH,
  })

  for (const report of due) {
    const claim = await prisma.studentReport.updateMany({
      where: { id: report.id, notifiedAt: null, publishAt: { not: null, lte: now } },
      data: { notifiedAt: new Date() },
    })
    if (claim.count === 0) continue
    try {
      await announceReport(report, 'new')
      logger.info({ reportId: report.id }, 'scheduled report released')
    } catch (err) {
      logger.error({ err, reportId: report.id }, 'scheduled report claimed but not announced')
    }
  }
}
