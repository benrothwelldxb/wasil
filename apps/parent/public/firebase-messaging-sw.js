/* eslint-disable */
/**
 * Firebase Cloud Messaging background handler — WEB PUSH ONLY.
 *
 * Coexistence with the Workbox PWA service worker:
 *   The vite-plugin-pwa (Workbox) service worker owns the ROOT scope ('/').
 *   This file is registered by src/services/webPush.ts at FCM's own dedicated
 *   scope ('/firebase-cloud-messaging-push-scope'), so the two service workers
 *   never share a scope and never clobber one another. (A scope may only have
 *   one active SW; registering at distinct scopes is what keeps them separate.)
 *
 * Config values below are the Firebase *client* config — public and safe to
 * ship. A service worker cannot read Vite env vars, so hardcoding them here is
 * expected. Loaded via the compat SDK because a classic SW can't use ES modules
 * with importScripts. index.html has no Content-Security-Policy, and the parent
 * PWA is not served through the helmet-protected API, so importScripts from
 * gstatic and the FCM endpoints are not blocked.
 */
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyBzgxmgLhYGnJDnJHxs43Y1-QGpDsB_PCs',
  authDomain: 'wasilconnectcoa.firebaseapp.com',
  projectId: 'wasilconnectcoa',
  storageBucket: 'wasilconnectcoa.firebasestorage.app',
  messagingSenderId: '214589233961',
  appId: '1:214589233961:web:4d4eb253a1c9824ebf3538',
  measurementId: 'G-9NDE846Y6D',
})

const messaging = firebase.messaging()

/**
 * Home-screen icon badge - the WhatsApp-style number on the app icon.
 *
 * The count is computed server-side, per recipient, and rides along in
 * `data.badge` (see server/src/services/firebase.ts). Setting it HERE is what
 * makes the badge work while the app is CLOSED; the poll in
 * src/components/layout/Header.tsx only keeps it current while the app runs.
 *
 * Availability, none of it in our control: iOS/iPadOS 16.4+ Home Screen PWAs
 * with notification permission granted, and installed desktop PWAs. Chrome on
 * Android has no Badging API at all, so this silently does nothing there - by
 * design, not a bug. Per spec a count of 0 clears the badge.
 */
function applyBadgeFromPayload(payload) {
  var raw = payload && payload.data && payload.data.badge
  if (raw === undefined || raw === null || raw === '') return
  var count = Number(raw)
  if (!isFinite(count) || count < 0) return
  var nav = self.navigator
  if (!nav || typeof nav.setAppBadge !== 'function') return
  try {
    var pending = nav.setAppBadge(count)
    // Rejects when the app isn't installed or permission was revoked. Badging is
    // a cosmetic extra on a notification that matters - never let it throw into
    // the push handler.
    if (pending && typeof pending.catch === 'function') pending.catch(function () {})
  } catch (e) {}
}

/**
 * Background message handler.
 *
 * IMPORTANT — avoid double notifications: when an FCM payload contains a
 * `notification` object (which the Wasil server always sends via
 * admin.messaging().sendEachForMulticast), the FCM SDK's own push handler
 * ALREADY calls showNotification() automatically before invoking this hook.
 * Calling showNotification() again here would surface TWO OS notifications.
 * So we only display from here for DATA-ONLY messages (no `notification`
 * payload); for notification messages we let the SDK's auto-display win.
 */
messaging.onBackgroundMessage((payload) => {
  // Badge FIRST. This hook runs for both notification and data-only payloads,
  // and the early return below must not skip it.
  applyBadgeFromPayload(payload)

  if (payload.notification) {
    // SDK already auto-displayed this — do nothing to avoid a duplicate.
    return
  }

  const title = (payload.data && payload.data.title) || 'Wasil'
  const options = {
    body: (payload.data && payload.data.body) || '',
    icon: '/icon-192.png',
    badge: '/logo.png',
    data: payload.data || {},
  }
  return self.registration.showNotification(title, options)
})
