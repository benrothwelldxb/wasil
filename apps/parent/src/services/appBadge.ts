/**
 * Home-screen / dock app icon badge — the WhatsApp-style number on the icon.
 *
 * Uses the W3C Badging API. Support is uneven and NOT in our control:
 *   - iOS/iPadOS 16.4+ — only for a PWA installed to the Home Screen, and only
 *     once notification permission is granted (Safari ties the two together,
 *     the same gate isWebPushSupported() already enforces in webPush.ts).
 *   - Desktop Chrome / Edge / Safari — installed PWAs only.
 *   - Chrome on Android — NOT supported at all. An Android PWA can only show
 *     the dot that rides along with a notification, never a number.
 *
 * Every call is therefore best-effort: browsers without the API no-op, and a
 * rejected promise (permission not granted, not installed) is swallowed rather
 * than surfaced — a missing badge must never break the screen that set it.
 *
 * NOTE: this only keeps the badge current while the app is RUNNING. Badging a
 * closed app needs the service worker to set it as the push arrives, which in
 * turn needs the server to put the recipient's unread count in the FCM payload
 * — a separate follow-on.
 */

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function badgeNavigator(): BadgeNavigator | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as BadgeNavigator
  return typeof nav.setAppBadge === 'function' ? nav : null
}

export function isAppBadgeSupported(): boolean {
  return badgeNavigator() !== null
}

/** Set the icon badge to `count`; a count of 0 or less clears it instead. */
export function setAppBadge(count: number): void {
  const nav = badgeNavigator()
  if (!nav) return
  const pending = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.()
  pending?.catch(() => {
    // Not installed / permission not granted yet — nothing to show, nothing to do.
  })
}

export function clearAppBadge(): void {
  setAppBadge(0)
}
