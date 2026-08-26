// Telling a parent what happened to their absence request.
//
// A parent submitted a request, someone in the office decided on it — and until
// now the parent found out only by opening the app and re-reading the list.
// Nothing was sent. This closes that: the decision reaches them in the app, on
// their phone, and by email, carrying whatever the reviewer wrote.
//
// One function, called by BOTH review paths (Connect's staff route and Desk's
// partner route), so the outcome is identical whichever surface decided it.
// Never throws: a notification failure must not roll back a decision that has
// already been recorded.
import prisma from './prisma.js'
import { enqueuePush, enqueueEmail } from './outbox.js'

export interface AttendanceReviewNotice {
  requestId: string
  schoolId: string
  /** The parent who submitted it — the only recipient. */
  parentId: string
  studentName: string
  type: 'ABSENCE' | 'EARLY_PICKUP' | 'LATE_ARRIVAL' | string
  startDate: string
  endDate: string | null
  status: 'APPROVED' | 'DECLINED'
  /** What the reviewer wrote, if anything — the parent sees it verbatim. */
  reviewNotes: string | null
}

const TYPE_LABEL: Record<string, string> = {
  ABSENCE: 'absence',
  EARLY_PICKUP: 'early pickup',
  LATE_ARRIVAL: 'late arrival',
}

/** "31 Aug 2026", or "31 Aug – 2 Sep 2026" for a range. Dates are YYYY-MM-DD. */
function formatWhen(startDate: string, endDate: string | null): string {
  const fmt = (d: string, withYear: boolean) =>
    new Date(`${d}T00:00:00.000Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
  if (!endDate || endDate === startDate) return fmt(startDate, true)
  return `${fmt(startDate, false)} – ${fmt(endDate, true)}`
}

/** Escape anything that goes into the HTML email — reviewer notes are free text. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function notifyAttendanceReviewed(notice: AttendanceReviewNotice): Promise<void> {
  try {
    const approved = notice.status === 'APPROVED'
    const kind = TYPE_LABEL[notice.type] ?? 'attendance'
    const when = formatWhen(notice.startDate, notice.endDate)

    const title = approved ? 'Absence request approved' : 'Absence request declined'
    // The decision, who it's about, and when — enough to act on from a lock
    // screen without opening the app.
    const decision = `Your ${kind} request for ${notice.studentName} on ${when} has been ${approved ? 'approved' : 'declined'}.`
    const body = notice.reviewNotes ? `${decision} “${notice.reviewNotes}”` : decision

    // In-app: the record the parent can come back to.
    await prisma.notification.create({
      data: {
        userId: notice.parentId,
        type: 'ATTENDANCE_REQUEST',
        title,
        body,
        resourceType: 'ATTENDANCE_REQUEST',
        resourceId: notice.requestId,
        schoolId: notice.schoolId,
      },
    })

    // Push: same words, to whichever devices they've registered.
    const tokens = await prisma.deviceToken.findMany({
      where: { userId: notice.parentId },
      select: { token: true },
    })
    if (tokens.length > 0) {
      await enqueuePush(notice.schoolId, {
        tokens: tokens.map((t) => t.token),
        title,
        body,
        data: {
          type: 'ATTENDANCE_REQUEST',
          resourceType: 'ATTENDANCE_REQUEST',
          resourceId: notice.requestId,
        },
      })
    }

    // Email: the durable copy. enqueueEmail already refuses Test Account
    // mailboxes, so a test parent gets in-app + push and no bounce.
    const [parent, school] = await Promise.all([
      prisma.user.findUnique({ where: { id: notice.parentId }, select: { email: true, name: true } }),
      prisma.school.findUnique({ where: { id: notice.schoolId }, select: { name: true } }),
    ])
    if (!parent?.email) return

    const schoolName = school?.name ?? 'Your school'
    const notesHtml = notice.reviewNotes
      ? `<p style="color:#334155;font-size:14px;line-height:1.55;margin:0 0 16px;padding:12px 14px;background:#F8F5F6;border-radius:10px;white-space:pre-line;">${esc(notice.reviewNotes)}</p>`
      : ''
    const html = `<!DOCTYPE html><html><body style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <p style="color:#475569;font-size:12px;margin:0 0 6px;">${esc(schoolName)}</p>
      <h2 style="color:#0f172a;font-size:18px;margin:0 0 14px;">${title}</h2>
      <p style="color:#334155;font-size:14px;line-height:1.55;margin:0 0 16px;">
        Dear ${esc(parent.name ?? 'parent')},<br><br>
        We have reviewed your ${esc(kind)} request for <strong>${esc(notice.studentName)}</strong> on ${esc(when)}.
        It has been <strong>${approved ? 'approved' : 'declined'}</strong>.
      </p>
      ${notesHtml}
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">You can see this in the app under Attendance. If you have questions, reply through the app or contact the school office.</p>
    </body></html>`
    const text =
      `${schoolName}\n${title}\n\n` +
      `Dear ${parent.name ?? 'parent'},\n\n` +
      `We have reviewed your ${kind} request for ${notice.studentName} on ${when}. ` +
      `It has been ${approved ? 'approved' : 'declined'}.\n` +
      (notice.reviewNotes ? `\n"${notice.reviewNotes}"\n` : '') +
      `\nYou can see this in the app under Attendance.`

    await enqueueEmail(notice.schoolId, {
      to: parent.email,
      subject: `[${schoolName}] ${title}`,
      html,
      text,
    })
  } catch (error) {
    // The decision is already saved — never fail the review over the telling.
    console.error('Failed to notify parent of attendance review:', error)
  }
}
