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

  if (!client) {
    console.log('=== EMAIL (Resend not configured) ===')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Body: ${text || html.substring(0, 200)}...`)
    console.log('======================================')
    return true
  }

  try {
    const { error } = await client.emails.send({
      from: getFromEmail(),
      to,
      subject,
      html,
      text,
    })

    if (error) {
      console.error('Resend error:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to send email:', error)
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
