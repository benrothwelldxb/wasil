// The principal's weekly update, as an email.
//
// Push alone reaches only families who installed the app and left notifications
// on. For most things that is the right trade — but a weekly update is often
// the one piece of writing a school most wants read, and the parents who miss
// it are disproportionately the ones already hardest to reach.
//
// SENT PER UPDATE, NEVER PER SCHOOL. A principal's Friday round-up and a "the
// boiler is fixed" note are not the same thing, and emailing every family about
// the second is how a school teaches people to filter the first.
//
// THE CONTENT IS RENDERED, NOT FLATTENED. The composer writes markdown and the
// app renders it; an email carrying "**Sports Day is on Thursday**" with the
// asterisks showing reads as a broken system, and one with all emphasis
// stripped loses the part the writer used to say what mattered. Both `marked`
// and `sanitize-html` are already dependencies here, so the email can carry
// what was actually written — through the same sanitiser the rest of the app
// uses, because this HTML is assembled from something a person typed.
import { marked } from 'marked'
import prisma from './prisma.js'
import { enqueueEmail } from './outbox.js'
import { sanitizeRichText } from './htmlSanitizer.js'

export interface WeeklyEmailSummary {
  /** Parents the email was queued to. */
  sent: number
  /** Parents who have turned weekly updates off. Counted, never mailed. */
  optedOut: number
}

/**
 * Email one update to the families who want it.
 *
 * HONOURS THE NOTIFICATION PREFERENCE, and that is a deliberate reading rather
 * than an oversight. The switch a parent turned off is labelled "weekly
 * updates" — it names the CONTENT, not the channel — so treating email as a
 * way around it would be using a technicality against somebody's stated wish.
 * A school that needs to reach a family who has opted out has the office and
 * the telephone.
 *
 * Never throws. An update that reached the app and failed to email is still an
 * update that was published; failing the publish would be the worse outcome.
 */
export async function emailWeeklyMessage(params: {
  schoolId: string
  messageId: string
  title: string
  content: string
}): Promise<WeeklyEmailSummary> {
  const summary: WeeklyEmailSummary = { sent: 0, optedOut: 0 }

  const school = await prisma.school.findUnique({
    where: { id: params.schoolId },
    select: { name: true },
  })

  const parents = await prisma.user.findMany({
    where: {
      schoolId: params.schoolId,
      role: 'PARENT',
      // A test account's mailbox is fake, and bounces to the school's own
      // domain cost sending reputation.
      isTest: false,
      email: { not: '' },
    },
    select: { id: true, email: true },
  })
  if (parents.length === 0) return summary

  const off = await prisma.notificationPreference.findMany({
    where: { userId: { in: parents.map(p => p.id) }, weeklyUpdates: false },
    select: { userId: true },
  })
  const optedOut = new Set(off.map(o => o.userId))
  summary.optedOut = optedOut.size

  const body = sanitizeRichText(await marked.parse(params.content || ''))
  const schoolName = school?.name ?? ''

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #2D2225;">
    <p style="color: #7A6469; font-size: 12px; margin: 0 0 6px;">${escapeHtml(schoolName)}</p>
    <h1 style="color: #2D2225; font-size: 20px; margin: 0 0 16px; line-height: 1.3;">${escapeHtml(params.title)}</h1>
    <div style="color: #3F3236; font-size: 15px; line-height: 1.6;">${body}</div>
    <p style="color: #9A8A8E; font-size: 12px; margin: 28px 0 0; padding-top: 16px; border-top: 1px solid #EFE6E8;">
      You are receiving this because your school emails its weekly update. You can turn these off
      in the app under notification settings.
    </p>
  </body></html>`

  // The plain-text part keeps the markdown as written. A reader on a text-only
  // client sees "**Sports Day**" rather than nothing, which is the less bad of
  // the two — and stripping it here would mean maintaining a second renderer
  // that could disagree with the first.
  const text = `${schoolName}\n${params.title}\n\n${params.content}`
  const subject = schoolName ? `${schoolName}: ${params.title}` : params.title

  for (const parent of parents) {
    if (optedOut.has(parent.id)) continue
    try {
      await enqueueEmail(params.schoolId, { to: parent.email, subject, html, text })
      summary.sent++
    } catch (e) {
      // One bad address must not stop the other three hundred and ninety-nine.
      console.error('[WeeklyMessage] Could not queue email:', e)
    }
  }

  return summary
}

/** The title and the school name are plain text dropped into HTML. Escaped
 *  rather than trusted — an ampersand in "Parents & Carers Evening" is the
 *  common case, and a stray angle bracket should not be able to reshape the
 *  message. The BODY is sanitised instead, because it is meant to carry
 *  markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
