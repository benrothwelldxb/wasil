import { Capacitor } from '@capacitor/core'
import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported,
  type Messaging,
} from 'firebase/messaging'
import { deviceTokens } from '@wasil/shared'

/**
 * Web (browser / installed-PWA) push via Firebase Cloud Messaging.
 *
 * This module is WEB-ONLY. Every entry point is gated on
 * `!Capacitor.isNativePlatform()`, so the native iOS/Android push path in
 * `services/pushNotifications.ts` is completely untouched — on native these
 * functions all no-op.
 */

// Firebase *client* config — public and safe to ship (matches the server's
// FCM service account project `wasilconnectcoa`).
const firebaseConfig = {
  apiKey: 'AIzaSyBzgxmgLhYGnJDnJHxs43Y1-QGpDsB_PCs',
  authDomain: 'wasilconnectcoa.firebaseapp.com',
  projectId: 'wasilconnectcoa',
  storageBucket: 'wasilconnectcoa.firebasestorage.app',
  messagingSenderId: '214589233961',
  appId: '1:214589233961:web:4d4eb253a1c9824ebf3538',
  measurementId: 'G-9NDE846Y6D',
}

const VAPID_KEY =
  'BEVcE41eru3YzYDbCq0tCkRfP9WM5XmcxC33fWt2T_HifbdtBDj-JEaNMDJM4_rpPeussgxSkm3fz1BNWOCNtI4'

// FCM's own dedicated SW scope. Registering the firebase SW here (rather than the
// default '/') keeps it separate from the Workbox PWA service worker that owns
// the root scope, so the two never clobber each other.
const FCM_SW_URL = '/firebase-messaging-sw.js'
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope'

/**
 * Remembered dismissal of the post-login <NotificationOptIn/> nudge. Shared with
 * that component (and cleared by the settings card) so the banner is a nudge we
 * can take back, not a one-way door.
 */
export const OPTIN_DISMISSED_KEY = 'wasil-notif-optin-dismissed'

/**
 * Set when the parent turns this device OFF from notification settings. Browsers
 * expose no way to *revoke* an already-granted permission, so "off" means "drop
 * this device's FCM token and don't silently re-register it on next login" —
 * without this flag, ensureWebPushRegistered() would quietly undo the toggle.
 */
const LOCALLY_DISABLED_KEY = 'wasil-webpush-disabled'

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    // Storage unavailable (private mode, blocked cookies) — treat as unset.
    return false
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, 'true')
    else localStorage.removeItem(key)
  } catch {
    // Best effort — the server-side token is the source of truth either way.
  }
}

export function isLocallyDisabled(): boolean {
  return readFlag(LOCALLY_DISABLED_KEY)
}

/** Forget the banner dismissal, so a parent who swiped it away can be nudged again. */
export function clearOptInDismissal() {
  writeFlag(OPTIN_DISMISSED_KEY, false)
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes this instead of the display-mode media query.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ presents as "MacIntel"; disambiguate via touch points.
    (navigator.platform === 'MacIntel' &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
      (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1)
  )
}

/**
 * Whether web push can work in the current context:
 *  - not running inside Capacitor native (native uses its own push path),
 *  - the browser exposes the Service Worker + Notification + Push APIs, and
 *  - on iOS, ONLY when the PWA is installed/standalone — iOS Safari refuses web
 *    push in a normal browser tab, so parents must "Add to Home Screen" first.
 */
export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (Capacitor.isNativePlatform()) return false
  if (
    !('serviceWorker' in navigator) ||
    !('Notification' in window) ||
    !('PushManager' in window)
  ) {
    return false
  }
  if (isIos() && !isStandalone()) return false
  return true
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/**
 * Everything the notification settings UI needs to know about THIS device, as a
 * single state. The distinction that matters most is `default` vs `denied`:
 *
 *  - `default`  — the prompt was never answered (dismissed, swiped away, or the
 *                 parent never tapped the nudge). We CAN prompt again.
 *  - `denied`   — the parent actively tapped "Don't Allow". No API can bring the
 *                 prompt back; only the OS/browser settings can undo it. Any UI
 *                 offering a "turn on" button here would be lying.
 */
export type DevicePushState =
  | 'native'
  | 'unsupported'
  | 'ios-needs-install'
  | 'default'
  | 'denied'
  | 'granted-off'
  | 'granted'

export function getDevicePushState(): DevicePushState {
  if (typeof window === 'undefined') return 'unsupported'
  // Native runs the Capacitor push path in services/pushNotifications.ts; this
  // card is web-only and hides itself there.
  if (Capacitor.isNativePlatform()) return 'native'
  if (
    !('serviceWorker' in navigator) ||
    !('Notification' in window) ||
    !('PushManager' in window)
  ) {
    return 'unsupported'
  }
  // iOS refuses web push outside an installed PWA — a "turn on" button in a
  // Safari tab could never work, so say what's actually needed instead.
  if (isIos() && !isStandalone()) return 'ios-needs-install'

  switch (Notification.permission) {
    case 'granted':
      return isLocallyDisabled() ? 'granted-off' : 'granted'
    case 'denied':
      return 'denied'
    default:
      return 'default'
  }
}

let messagingInstance: Messaging | null = null
let foregroundBound = false

function getFirebaseMessaging(): Messaging {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  if (!messagingInstance) {
    messagingInstance = getMessaging(app)
  }
  return messagingInstance
}

/**
 * Minimal, self-contained in-app notification for FOREGROUND messages.
 *
 * The parent app does not mount a ToastProvider, so rather than depend on that
 * context we inject a lightweight banner. We deliberately do NOT fire an OS
 * `Notification` here: in the foreground the FCM SDK does not auto-display, and
 * showing an OS notification ourselves would feel heavy for an app that's
 * already open. This is single-fire (no duplicate).
 */
function showInAppNotification(title: string, body: string) {
  if (typeof document === 'undefined') return
  try {
    const el = document.createElement('div')
    el.setAttribute('role', 'status')
    el.style.cssText = [
      'position:fixed',
      'top:calc(env(safe-area-inset-top, 0px) + 12px)',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:9999',
      'max-width:calc(100% - 24px)',
      'width:360px',
      'box-sizing:border-box',
      'background:#ffffff',
      'color:#1f2937',
      'border:1px solid #f3d9d0',
      'border-radius:14px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.14)',
      'padding:12px 14px',
      'font-family:Nunito, system-ui, sans-serif',
      'opacity:0',
      'transition:opacity .2s ease, transform .2s ease',
    ].join(';')

    const t = document.createElement('p')
    t.textContent = title
    t.style.cssText = 'margin:0;font-size:14px;font-weight:700;'
    const b = document.createElement('p')
    b.textContent = body
    b.style.cssText = 'margin:2px 0 0;font-size:13px;color:#6b7280;'
    el.appendChild(t)
    if (body) el.appendChild(b)
    document.body.appendChild(el)

    requestAnimationFrame(() => {
      el.style.opacity = '1'
      el.style.transform = 'translateX(-50%) translateY(0)'
    })
    setTimeout(() => {
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 250)
    }, 5000)
  } catch {
    // Non-critical UI nicety — never let it throw into the push flow.
  }
}

/**
 * Register the firebase SW at its dedicated scope and obtain an FCM token.
 * Assumes permission is already `granted`. Idempotent — safe to call repeatedly
 * (getToken returns the existing token; the foreground listener binds once).
 * Returns the token on success, or null if unsupported / no token.
 */
export async function enableWebPush(): Promise<string | null> {
  if (!isWebPushSupported()) return null
  if (Notification.permission !== 'granted') return null

  try {
    // Extra guard for older browsers the static checks above miss.
    if (!(await isSupported())) return null

    const registration = await navigator.serviceWorker.register(FCM_SW_URL, {
      scope: FCM_SW_SCOPE,
    })

    const messaging = getFirebaseMessaging()

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (!token) return null

    await deviceTokens.register({ token, platform: 'web' })
    // This device is on again — undo any earlier explicit "off".
    writeFlag(LOCALLY_DISABLED_KEY, false)

    if (!foregroundBound) {
      foregroundBound = true
      onMessage(messaging, (payload) => {
        const title =
          payload.notification?.title || (payload.data?.title as string | undefined) || 'Wasil'
        const body =
          payload.notification?.body || (payload.data?.body as string | undefined) || ''
        showInAppNotification(title, body)
      })
    }

    return token
  } catch (err) {
    console.error('Web push: failed to enable', err)
    return null
  }
}

/**
 * User-initiated opt-in: request Notification permission (if still `default`)
 * and, on `granted`, run the getToken + register flow. Returns the token or null.
 */
export async function requestAndEnableWebPush(): Promise<string | null> {
  if (!isWebPushSupported()) return null

  let permission = Notification.permission
  // Re-asking is the whole point when permission is still `default`: a parent who
  // swiped the prompt away the first time gets a real second chance here.
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') return null

  return enableWebPush()
}

/**
 * Called silently on login. If the parent has already granted permission, make
 * sure this browser's current FCM token is registered with the backend (tokens
 * can rotate). No-op if unsupported or permission not yet granted.
 */
export async function ensureWebPushRegistered(): Promise<void> {
  if (!isWebPushSupported()) return
  if (Notification.permission !== 'granted') return
  // The parent turned this device off deliberately — don't re-register behind
  // their back on the next login.
  if (isLocallyDisabled()) return
  await enableWebPush()
}

/**
 * Turn this device OFF. There is no browser API to revoke a granted permission,
 * so "off" is implemented where it actually controls delivery: delete the FCM
 * token (locally and on the backend) and remember the choice so login doesn't
 * silently re-register it. Turning back on needs no new permission prompt.
 */
export async function disableWebPush(): Promise<void> {
  writeFlag(LOCALLY_DISABLED_KEY, true)
  if (!isWebPushSupported()) return
  if (Notification.permission !== 'granted') return

  try {
    if (!(await isSupported())) return

    const registration = await navigator.serviceWorker.register(FCM_SW_URL, {
      scope: FCM_SW_SCOPE,
    })
    const messaging = getFirebaseMessaging()

    // We need the current token to tell the backend which row to drop.
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (token) {
      try {
        await deviceTokens.remove(token)
      } catch (err) {
        // Backend removal failed — still delete locally so this device stops
        // producing a token; the stale row is harmless (sends just no-op).
        console.error('Web push: failed to remove token from backend', err)
      }
      await deleteToken(messaging)
    }
  } catch (err) {
    console.error('Web push: failed to disable', err)
  }
}
