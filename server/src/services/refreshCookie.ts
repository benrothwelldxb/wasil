import type { Response } from 'express'
import { REFRESH_TOKEN_EXPIRY_DAYS } from './authConfig.js'

// The refresh token is mirrored into an httpOnly cookie (in addition to the JSON
// body that localStorage-based clients still read). This is the durable path on
// iOS: WebKit's tracking prevention wipes script-writable storage (localStorage)
// on a ~7-day cap, but a SERVER-set cookie is exempt, so the session survives.
//
// app.wasilconnect.com → api.wasilconnect.com is same-site (shared registrable
// domain), so SameSite=Lax is correct and the cookie is sent on the XHR refresh.
// COOKIE_DOMAIN (".wasilconnect.com") makes it span both subdomains; unset in
// dev so the cookie binds to the API host directly.
export const REFRESH_COOKIE_NAME = 'rt'

const isProd = process.env.NODE_ENV === 'production'
const MAX_AGE_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000

function baseOptions() {
  return {
    httpOnly: true,
    secure: isProd, // over http in dev the browser would drop a Secure cookie
    sameSite: 'lax' as const,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  }
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseOptions(), maxAge: MAX_AGE_MS })
}

// clearCookie must be given the SAME attributes (domain/path/sameSite/secure) it
// was set with, or the browser won't match and remove it.
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions())
}
