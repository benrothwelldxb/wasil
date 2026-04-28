import { google } from 'googleapis'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:4000/auth/google-calendar/callback'

function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

export function getGoogleAuthUrl(schoolId: string): string {
  const client = getOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: schoolId,
  })
}

export async function exchangeGoogleCode(code: string): Promise<{ refreshToken: string; email: string }> {
  const client = getOAuth2Client()
  const { tokens } = await client.getToken(code)

  // Get user email
  client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data } = await oauth2.userinfo.get()

  return {
    refreshToken: tokens.refresh_token!,
    email: data.email!,
  }
}

export async function createGoogleMeetEvent(params: {
  refreshToken: string
  summary: string
  description?: string
  startTime: string // ISO string
  endTime: string   // ISO string
  attendees?: string[]
}): Promise<{ meetLink: string; eventId: string } | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null

  try {
    const client = getOAuth2Client()
    client.setCredentials({ refresh_token: params.refreshToken })

    const calendar = google.calendar({ version: 'v3', auth: client })

    const event = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.startTime },
        end: { dateTime: params.endTime },
        attendees: params.attendees?.map(email => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: `wasil-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    })

    const meetLink = event.data.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video'
    )?.uri

    return meetLink ? { meetLink, eventId: event.data.id! } : null
  } catch (error) {
    console.error('Failed to create Google Meet event:', error)
    return null
  }
}

export function isGoogleCalendarConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET)
}
