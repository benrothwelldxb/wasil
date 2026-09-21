import { google } from 'googleapis'
import { issueOAuthState } from './oauthState.js'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:4000/auth/google-calendar/callback'

function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

export function getGoogleAuthUrl(schoolId: string, userId: string): string {
  const client = getOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: issueOAuthState(schoolId, userId),
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
  /** School's IANA zone. Without it Google reads the naive local strings
   *  against the CALENDAR's zone — the school Google account's — which is
   *  right by luck today and wrong the moment that account is set elsewhere. */
  timeZone?: string
}): Promise<{ meetLink: string; eventId: string } | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null

  try {
    const client = getOAuth2Client()
    client.setCredentials({ refresh_token: params.refreshToken })

    const calendar = google.calendar({ version: 'v3', auth: client })

    const event = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      // Without this the API adds attendees SILENTLY — no invitation, and for
      // anyone outside the school's own Google domain, nothing on their
      // calendar either. The point of naming a teacher as an attendee is that
      // the appointment reaches their calendar, so it has to actually be sent.
      sendUpdates: 'all',
      requestBody: {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.startTime, ...(params.timeZone ? { timeZone: params.timeZone } : {}) },
        end: { dateTime: params.endTime, ...(params.timeZone ? { timeZone: params.timeZone } : {}) },
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

/**
 * Remove a Meet event when the booking it belongs to is cancelled.
 *
 * Without this a cancelled appointment stays in the teacher's and the parent's
 * calendars with a working joining link — so a teacher sits waiting for a
 * family who cancelled a fortnight ago, and neither has reason to doubt it.
 *
 * Best effort by design. A cancellation must not fail because Google is
 * unreachable or the event was already removed by hand: the booking is gone
 * either way, and the calendar entry is a copy of that fact rather than the
 * fact itself. Returns whether it succeeded so the caller can log rather than
 * guess.
 */
export async function deleteGoogleMeetEvent(params: {
  refreshToken: string
  eventId: string
}): Promise<boolean> {
  if (!CLIENT_ID || !CLIENT_SECRET) return false

  try {
    const client = getOAuth2Client()
    client.setCredentials({ refresh_token: params.refreshToken })
    const calendar = google.calendar({ version: 'v3', auth: client })
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: params.eventId,
      // Tell them it is off, for the same reason the invitation was sent.
      sendUpdates: 'all',
    })
    return true
  } catch (error) {
    console.error('Failed to delete Google Meet event:', error)
    return false
  }
}
