import twilio from 'twilio'

const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER
const TWILIO_WHATSAPP = process.env.TWILIO_WHATSAPP_NUMBER // e.g., '+14155238886'

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return twilio(sid, token)
}

export async function sendSMS(to: string, body: string): Promise<{ sid: string } | null> {
  const client = getClient()
  if (!client || !TWILIO_PHONE) return null
  try {
    const message = await client.messages.create({
      body,
      from: TWILIO_PHONE,
      to,
    })
    return { sid: message.sid }
  } catch (error) {
    console.error('SMS send failed:', error)
    return null
  }
}

export async function sendWhatsApp(to: string, body: string): Promise<{ sid: string } | null> {
  const client = getClient()
  if (!client || !TWILIO_WHATSAPP) return null
  try {
    const message = await client.messages.create({
      body,
      from: `whatsapp:${TWILIO_WHATSAPP}`,
      to: `whatsapp:${to}`,
    })
    return { sid: message.sid }
  } catch (error) {
    console.error('WhatsApp send failed:', error)
    return null
  }
}

export function isTwilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
}
