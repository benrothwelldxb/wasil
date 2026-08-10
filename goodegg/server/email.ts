/**
 * Sending the sign-in code.
 *
 * Railway has no built-in email. If RESEND_API_KEY is set we send via Resend;
 * otherwise we log the code to the server console ("dev mode") so local and
 * first-run deployments work without any email provider configured.
 */
export async function sendLoginCode(email: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'Be a Good Egg <onboarding@resend.dev>'

  if (!key) {
    // Dev mode — never do this in production with real users.
    console.log(`[auth] Sign-in code for ${email}: ${code}`)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Your Be a Good Egg code: ${code}`,
      text: `Your sign-in code is ${code}. It expires in 10 minutes.\n\nLittle surprises. Big smiles. 🥚`,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Failed to send email (${res.status}): ${detail}`)
  }
}
