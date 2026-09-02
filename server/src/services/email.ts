// Email service with Resend integration
// Falls back to console logging if RESEND_API_KEY is not set

import { Resend } from 'resend'

interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
}

interface MagicLinkEmailParams {
  to: string
  magicLink: string
  schoolName: string
  childrenNames?: string[]
  isRegistration?: boolean
}

let resendClient: Resend | null = null

function getResendClient(): Resend | null {
  if (resendClient) return resendClient

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null

  resendClient = new Resend(apiKey)
  return resendClient
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || 'Wasil <notifications@wasil.app>'
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<boolean> {
  const client = getResendClient()

  console.log(`[Email] Attempting to send email to ${to}, subject: "${subject}"`)
  console.log(`[Email] Resend client configured: ${!!client}`)

  if (!client) {
    console.log('=== EMAIL (Resend not configured) ===')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Body: ${text || html.substring(0, 200)}...`)
    console.log('======================================')
    return true
  }

  const fromEmail = getFromEmail()
  console.log(`[Email] Sending from: ${fromEmail}`)

  try {
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text,
    })

    if (error) {
      console.error('[Email] Resend error:', error)
      return false
    }

    console.log(`[Email] Successfully sent! ID: ${data?.id}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send email:', error)
    return false
  }
}

export async function sendMagicLinkEmail({
  to,
  magicLink,
  schoolName,
  childrenNames = [],
  isRegistration = false,
}: MagicLinkEmailParams): Promise<boolean> {
  const subject = isRegistration
    ? `Complete your registration for ${schoolName}`
    : `Sign in to ${schoolName}`

  const childrenList = childrenNames.length > 0
    ? `<p style="color: #4b5563; margin-top: 16px;">Your children: <strong>${childrenNames.join(', ')}</strong></p>`
    : ''

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color: #111827; font-size: 24px; margin: 0 0 24px 0; text-align: center;">
      ${schoolName}
    </h1>

    <p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 24px 0;">
      ${isRegistration
        ? 'Click the button below to complete your registration and access the parent portal.'
        : 'Click the button below to sign in to the parent portal.'}
    </p>

    ${childrenList}

    <div style="text-align: center; margin: 32px 0;">
      <a href="${magicLink}"
         style="display: inline-block; background-color: #7f0029; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        ${isRegistration ? 'Complete Registration' : 'Sign In'}
      </a>
    </div>

    <p style="color: #6b7280; font-size: 14px; line-height: 20px; margin: 24px 0 0 0;">
      This link will expire in 15 minutes. If you didn't request this email, you can safely ignore it.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
      Powered by Wasil
    </p>
  </div>
</body>
</html>
`

  const text = `
${schoolName}

${isRegistration
  ? 'Click the link below to complete your registration:'
  : 'Click the link below to sign in:'}

${magicLink}

${childrenNames.length > 0 ? `Your children: ${childrenNames.join(', ')}` : ''}

This link will expire in 15 minutes.
`

  return sendEmail({ to, subject, html, text })
}

// Passwordless sign-in: email the parent their short-lived 6-digit code.
// The code itself is the secret — no link, no token — so it works identically
// on iOS/Android/PWA/desktop with no deep-link plumbing.
export async function sendLoginCodeEmail({
  to,
  code,
  schoolName,
  appName = 'Wasil',
  ttlMinutes = 10,
}: {
  to: string
  code: string
  schoolName?: string
  appName?: string
  ttlMinutes?: number
}): Promise<boolean> {
  const subject = `Your ${appName} sign-in code is ${code} — expires in ${ttlMinutes} minutes`
  const heading = schoolName || appName

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color: #111827; font-size: 24px; margin: 0 0 24px 0; text-align: center;">${heading}</h1>
    <p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 16px 0;">Enter this code to sign in:</p>
    <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="font-family: monospace; font-size: 34px; font-weight: bold; color: #111827; text-align: center; margin: 0; letter-spacing: 8px;">${code}</p>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 20px; margin: 24px 0 0 0;">This code expires in ${ttlMinutes} minutes and can be used once. If you didn't request it, you can safely ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Powered by ${appName}</p>
  </div>
</body>
</html>`

  const text = `${heading}\n\nYour ${appName} sign-in code is ${code}\n\nEnter this code to sign in. It expires in ${ttlMinutes} minutes and can be used once.\n\nIf you didn't request it, you can safely ignore this email.`

  return sendEmail({ to, subject, html, text })
}

// Admin "invite parents": welcome a pre-provisioned parent and point them at the
// passwordless front door. Deliberately does NOT embed a live code — a bulk send
// would expire before the parent acts; they request a fresh code in the app.
export async function sendParentWelcomeEmail({
  to,
  schoolName,
  appName = 'Wasil Connect',
  appUrl = process.env.PARENT_APP_URL || 'https://app.wasilconnect.com',
  // Absolute URLs (email clients can't render bundled/relative assets). Served
  // from the parent app's public/ at the app domain. Per-school logo can be
  // passed once branding is multi-tenant.
  schoolLogoUrl = `${process.env.PARENT_APP_URL || 'https://app.wasilconnect.com'}/school-logo.png`,
  wasilLogoUrl = `${process.env.PARENT_APP_URL || 'https://app.wasilconnect.com'}/wasil-logo-grey.png`,
}: {
  to: string
  schoolName: string
  appName?: string
  appUrl?: string
  schoolLogoUrl?: string
  wasilLogoUrl?: string
}): Promise<boolean> {
  const subject = `Welcome to ${schoolName} — set up your ${appName} sign-in`
  const BURGUNDY = '#7F0029'

  // Email-safe: table layout, inline styles, web-safe fonts, absolute image URLs.
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background-color:#F4EFEC;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EFEC;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px -16px rgba(74,20,35,0.18);">
        <tr><td style="height:5px;background-color:${BURGUNDY};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:34px 40px 8px 40px;">
          <img src="${schoolLogoUrl}" width="76" alt="${schoolName} crest" style="display:block;width:76px;height:auto;margin:0 auto 14px auto;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:0.4px;color:${BURGUNDY};font-weight:bold;">${schoolName}</div>
        </td></tr>
        <tr><td style="padding:18px 40px 0 40px;">
          <h1 style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:23px;line-height:1.3;color:#2A2024;text-align:center;font-weight:700;">You're set up on ${appName}</h1>
          <p style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#4A3E43;">${schoolName} has added you to ${appName} — one place for messages, events, forms and more from your child's school.</p>
          <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#4A3E43;">To sign in, open the app and enter <strong>this email address</strong> — we'll send you a <strong>6-digit code</strong> to type in. No password to remember.</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 40px 8px 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td align="center" bgcolor="${BURGUNDY}" style="border-radius:12px;">
              <a href="${appUrl}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">Open ${appName}</a>
            </td>
          </tr></table>
          <div style="margin-top:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.5;color:#A8929A;">If the button doesn't work, use this link:<br><a href="${appUrl}" target="_blank" style="color:${BURGUNDY};font-weight:600;text-decoration:none;">${appUrl.replace(/^https?:\/\//, '')}</a></div>
        </td></tr>
        <tr><td style="padding:16px 40px 0 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF6F3;border:1px solid #F0E3E6;border-radius:12px;">
            <tr><td style="padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#7A6469;">
              <strong style="color:${BURGUNDY};">Tip —</strong> add it to your home screen for one-tap access: open the link above, then <strong>Share&nbsp;→ Add to Home Screen</strong> (iPhone) or the <strong>&#8942; menu&nbsp;→ Install app</strong> (Android).
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:26px 40px 32px 40px;">
          <div style="border-top:1px solid #EFE3E6;margin-bottom:18px;font-size:0;line-height:0;">&nbsp;</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="center">
              <img src="${wasilLogoUrl}" width="96" alt="${appName}" style="display:block;width:96px;height:auto;margin:0 auto 6px auto;opacity:0.8;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#A8929A;">Powered by ${appName}</div>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `Welcome to ${schoolName}

${schoolName} has added you to ${appName} — one place for messages, events, forms and more from your child's school.

To sign in, open the app and enter this email address — we'll send you a 6-digit code to type in. No password to remember.

Open ${appName}: ${appUrl}
(If the button doesn't work, use this link: ${appUrl})

Tip: add it to your home screen for one-tap access — open the link, then Share > Add to Home Screen (iPhone) or the menu > Install app (Android).

Powered by ${appName}`

  return sendEmail({ to, subject, html, text })
}

/**
 * The chase email for a parent who has never signed in.
 *
 * Different job from the welcome: they have already been told the app exists,
 * so repeating the setup instructions louder achieves nothing. This one leads
 * with what they are actually missing — the messages and notices that have gone
 * out to everyone else since — and keeps the how-to short underneath.
 *
 * `missedCount` is what makes it land. Where the number is unknown, the copy
 * falls back to a plainer line rather than inventing one.
 */
export function buildParentNudgeEmail({
  to,
  schoolName,
  missedCount,
  appName = 'Wasil Connect',
  appUrl = process.env.PARENT_APP_URL || 'https://app.wasilconnect.com',
  schoolLogoUrl = `${process.env.PARENT_APP_URL || 'https://app.wasilconnect.com'}/school-logo.png`,
  wasilLogoUrl = `${process.env.PARENT_APP_URL || 'https://app.wasilconnect.com'}/wasil-logo-grey.png`,
}: {
  to: string
  schoolName: string
  missedCount?: number
  appName?: string
  appUrl?: string
  schoolLogoUrl?: string
  wasilLogoUrl?: string
}): { subject: string; html: string; text: string } {
  const subject = `You're missing out on updates from ${schoolName}`
  const BURGUNDY = '#7F0029'

  const missedLine =
    missedCount && missedCount > 0
      ? `There ${missedCount === 1 ? 'is' : 'are'} <strong>${missedCount} message${missedCount === 1 ? '' : 's'}</strong> waiting for you on ${appName} — notices, reminders and updates that have gone out to ${schoolName} families since you were added.`
      : `Messages, notices and reminders from ${schoolName} are going out on ${appName}, and you haven't seen any of them yet.`

  const missedLineText =
    missedCount && missedCount > 0
      ? `There ${missedCount === 1 ? 'is' : 'are'} ${missedCount} message${missedCount === 1 ? '' : 's'} waiting for you on ${appName} — notices, reminders and updates that have gone out to ${schoolName} families since you were added.`
      : `Messages, notices and reminders from ${schoolName} are going out on ${appName}, and you haven't seen any of them yet.`

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background-color:#F4EFEC;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EFEC;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px -16px rgba(74,20,35,0.18);">
        <tr><td style="height:5px;background-color:${BURGUNDY};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:34px 40px 8px 40px;">
          <img src="${schoolLogoUrl}" width="76" alt="${schoolName} crest" style="display:block;width:76px;height:auto;margin:0 auto 14px auto;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:0.4px;color:${BURGUNDY};font-weight:bold;">${schoolName}</div>
        </td></tr>
        <tr><td style="padding:18px 40px 0 40px;">
          <h1 style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:23px;line-height:1.3;color:#2A2024;text-align:center;font-weight:700;">You're missing out</h1>
          <p style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#4A3E43;">${missedLine}</p>
          <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#4A3E43;">Signing in takes about a minute. Open the app, enter <strong>this email address</strong>, and we'll send you a <strong>6-digit code</strong> to type in. There's no password to set up or remember.</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 40px 8px 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td align="center" bgcolor="${BURGUNDY}" style="border-radius:12px;">
              <a href="${appUrl}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">See what you've missed</a>
            </td>
          </tr></table>
          <div style="margin-top:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.5;color:#A8929A;">If the button doesn't work, use this link:<br><a href="${appUrl}" target="_blank" style="color:${BURGUNDY};font-weight:600;text-decoration:none;">${appUrl.replace(/^https?:\/\//, '')}</a></div>
        </td></tr>
        <tr><td style="padding:16px 40px 0 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF6F3;border:1px solid #F0E3E6;border-radius:12px;">
            <tr><td style="padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.6;color:#7A6469;">
              <strong style="color:${BURGUNDY};">Already tried and got stuck?</strong> Reply to this email and the school office will help you in.
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:26px 40px 32px 40px;">
          <div style="border-top:1px solid #EFE3E6;margin-bottom:18px;font-size:0;line-height:0;">&nbsp;</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="center">
              <img src="${wasilLogoUrl}" width="96" alt="${appName}" style="display:block;width:96px;height:auto;margin:0 auto 6px auto;opacity:0.8;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#A8929A;">Powered by ${appName}</div>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `You're missing out

${missedLineText}

Signing in takes about a minute. Open the app, enter this email address, and we'll send you a 6-digit code to type in. There's no password to set up or remember.

See what you've missed: ${appUrl}

Already tried and got stuck? Reply to this email and the school office will help you in.

Powered by ${appName}`

  return { subject, html, text }
}

/** Sends exactly what `buildParentNudgeEmail` renders — the admin preview calls
 *  the builder directly, so what is previewed is what is sent. */
export async function sendParentNudgeEmail(
  params: Parameters<typeof buildParentNudgeEmail>[0],
): Promise<boolean> {
  const { subject, html, text } = buildParentNudgeEmail(params)
  return sendEmail({ to: params.to, subject, html, text })
}

/**
 * "You have a notice from the School Clinic."
 *
 * Deliberately says nothing about the notice itself — not the body, and not the
 * title either. A clinic's subject line ("Amina's inhaler has run out") or an
 * accounts one ("Overdue fees") discloses as much as the message does, and
 * email is the least private channel we have: forwarded, synced to work
 * laptops, read on a shared screen. The signal goes to the mailbox; the content
 * stays behind a sign-in.
 *
 * This is the reason Admin Notices can stay out of the feed without going
 * unread — email is how a parent finds out there is something to open.
 */
export async function sendAdminNoticeSignalEmail({
  to,
  schoolName,
  department,
  appName = 'Wasil Connect',
  appUrl = process.env.PARENT_APP_URL || 'https://app.wasilconnect.com',
  schoolLogoUrl = `${process.env.PARENT_APP_URL || 'https://app.wasilconnect.com'}/school-logo.png`,
  wasilLogoUrl = `${process.env.PARENT_APP_URL || 'https://app.wasilconnect.com'}/wasil-logo-grey.png`,
}: {
  to: string
  schoolName: string
  /** e.g. "School Clinic". Falls back to the school when a sender gave none. */
  department?: string | null
  appName?: string
  appUrl?: string
  schoolLogoUrl?: string
  wasilLogoUrl?: string
}): Promise<boolean> {
  const from = department?.trim() || schoolName
  const subject = `You have a notice from ${from}`
  const BURGUNDY = '#7F0029'

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background-color:#F4EFEC;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EFEC;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px -16px rgba(74,20,35,0.18);">
        <tr><td style="height:5px;background-color:${BURGUNDY};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:34px 40px 8px 40px;">
          <img src="${schoolLogoUrl}" width="76" alt="${schoolName} crest" style="display:block;width:76px;height:auto;margin:0 auto 14px auto;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:0.4px;color:${BURGUNDY};font-weight:bold;">${schoolName}</div>
        </td></tr>
        <tr><td style="padding:18px 40px 0 40px;">
          <h1 style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:#2A2024;text-align:center;font-weight:700;">A notice from ${from}</h1>
          <p style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#4A3E43;">There's a message waiting for you in <strong>Admin Notices</strong> on ${appName}.</p>
          <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#7A6469;">We don't include these in email — open the app to read it.</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 40px 8px 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td align="center" bgcolor="${BURGUNDY}" style="border-radius:12px;">
              <a href="${appUrl}/admin-notices" target="_blank" style="display:inline-block;padding:14px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">Read it in ${appName}</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:26px 40px 32px 40px;">
          <div style="border-top:1px solid #EFE3E6;margin-bottom:18px;font-size:0;line-height:0;">&nbsp;</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="center">
              <img src="${wasilLogoUrl}" width="96" alt="${appName}" style="display:block;width:96px;height:auto;margin:0 auto 6px auto;opacity:0.8;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#A8929A;">Powered by ${appName}</div>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `A notice from ${from}

There's a message waiting for you in Admin Notices on ${appName}.

We don't include these in email — open the app to read it:
${appUrl}/admin-notices

Powered by ${appName}`

  return sendEmail({ to, subject, html, text })
}

export async function sendInvitationEmail({
  to,
  magicLink,
  accessCode,
  schoolName,
  childrenNames,
}: {
  to: string
  magicLink: string
  accessCode: string
  schoolName: string
  childrenNames: string[]
}): Promise<boolean> {
  const subject = `You're invited to join ${schoolName} on Wasil`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color: #111827; font-size: 24px; margin: 0 0 24px 0; text-align: center;">
      Welcome to ${schoolName}
    </h1>

    <p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 16px 0;">
      You've been invited to join the ${schoolName} parent portal to stay connected with your child's school.
    </p>

    <p style="color: #4b5563; margin: 16px 0;">
      <strong>Your children:</strong> ${childrenNames.join(', ')}
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${magicLink}"
         style="display: inline-block; background-color: #7f0029; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Complete Registration
      </a>
    </div>

    <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-align: center;">
        Or enter this code manually:
      </p>
      <p style="font-family: monospace; font-size: 24px; font-weight: bold; color: #111827; text-align: center; margin: 0; letter-spacing: 2px;">
        ${accessCode}
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px; line-height: 20px; margin: 24px 0 0 0;">
      This invitation will expire in 90 days.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
      Powered by Wasil
    </p>
  </div>
</body>
</html>
`

  const text = `
Welcome to ${schoolName}

You've been invited to join the ${schoolName} parent portal.

Your children: ${childrenNames.join(', ')}

Click here to complete your registration:
${magicLink}

Or enter this code manually: ${accessCode}

This invitation will expire in 90 days.
`

  return sendEmail({ to, subject, html, text })
}

/**
 * Send batch emails via Resend batch API.
 * Sends up to 100 emails per batch call.
 * Returns { sent: number, failed: number }
 */
export async function sendBatchEmails(
  emails: Array<{ to: string; subject: string; html: string; text?: string }>
): Promise<{ sent: number; failed: number }> {
  const client = getResendClient()
  if (!client || emails.length === 0) {
    return { sent: 0, failed: emails.length }
  }

  const fromEmail = getFromEmail()
  let totalSent = 0
  let totalFailed = 0

  // Resend batch API supports up to 100 emails per call
  const BATCH_SIZE = 100
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    try {
      const { data, error } = await (client as any).batch.send(
        batch.map(email => ({
          from: fromEmail,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }))
      )

      if (error) {
        console.error(`[Email] Batch send error (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error)
        totalFailed += batch.length
      } else {
        totalSent += data?.data?.length || batch.length
        console.log(`[Email] Batch sent ${batch.length} emails successfully`)
      }
    } catch (error) {
      console.error(`[Email] Batch send failed (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error)
      totalFailed += batch.length
    }
  }

  return { sent: totalSent, failed: totalFailed }
}

/**
 * Build invitation email HTML/text for a given invitation.
 * Used by both single and batch sends.
 */
export function buildInvitationEmail({
  accessCode,
  schoolName,
  childrenNames,
  parentAppUrl,
}: {
  accessCode: string
  schoolName: string
  childrenNames: string[]
  parentAppUrl: string
}): { subject: string; html: string; text: string } {
  const magicLink = `${parentAppUrl}/register?code=${accessCode}`
  const subject = `You're invited to join ${schoolName} on Wasil`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color: #111827; font-size: 24px; margin: 0 0 24px 0; text-align: center;">Welcome to ${schoolName}</h1>
    <p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 16px 0;">You've been invited to join the ${schoolName} parent portal to stay connected with your child's school.</p>
    <p style="color: #4b5563; margin: 16px 0;"><strong>Your children:</strong> ${childrenNames.join(', ')}</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${magicLink}" style="display: inline-block; background-color: #7f0029; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Complete Registration</a>
    </div>
    <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-align: center;">Or enter this code manually:</p>
      <p style="font-family: monospace; font-size: 24px; font-weight: bold; color: #111827; text-align: center; margin: 0; letter-spacing: 2px;">${accessCode}</p>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 20px; margin: 24px 0 0 0;">This invitation will expire in 90 days.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Powered by Wasil</p>
  </div>
</body>
</html>`

  const text = `Welcome to ${schoolName}\n\nYou've been invited to join the ${schoolName} parent portal.\n\nYour children: ${childrenNames.join(', ')}\n\nClick here to complete your registration:\n${magicLink}\n\nOr enter this code manually: ${accessCode}\n\nThis invitation will expire in 90 days.`

  return { subject, html, text }
}
