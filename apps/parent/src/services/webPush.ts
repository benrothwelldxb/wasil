import { Capacitor } from '@capacitor/core'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging'
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
  await enableWebPush()
}
