import { useSyncExternalStore } from 'react'

// Shared PWA-install state. The browser fires `beforeinstallprompt` ONCE, and
// only the code holding that event can trigger the native install. Capturing it
// in a single module (rather than inside one component) lets BOTH the post-login
// auto-banner and the "Install app" entry in the menu drive the same prompt — so
// a parent who dismissed the banner can still install later from the menu.
//
// The listener is attached at module load; import this module early (main.tsx)
// so the event is captured even if it fires before any component mounts.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
function emit() { for (const l of listeners) l() }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's own mini-infobar; we surface our own affordances instead.
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    emit()
  })
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes this instead of the display-mode media query.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    installed
  )
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ presents as "MacIntel"; disambiguate via touch points.
    (navigator.platform === 'MacIntel' &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
      (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1)
  )
}

/** True when the native one-tap install prompt is available (Android / desktop Chrome). */
export function canPromptInstall(): boolean { return !!deferredPrompt }

/** True when there's anything the user can do to install: the native prompt, or —
 * on iOS, which has no install API — the manual Add-to-Home-Screen route. False
 * once already installed/standalone. */
export function isInstallable(): boolean {
  if (isStandalone()) return false
  return canPromptInstall() || isIosDevice()
}

/** Fire the native install prompt. Returns the outcome, or 'unavailable' when
 * there's no captured event (iOS, or the browser never offered one). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  await deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  emit()
  return outcome
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
// Snapshot is a primitive so useSyncExternalStore can bail out of no-op renders.
function snapshot(): string { return `${!!deferredPrompt}|${installed}` }

/** React binding — components re-render when install availability changes (e.g.
 * the moment `beforeinstallprompt` arrives, or after the app is installed). */
export function useInstallState() {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  return {
    isStandalone: isStandalone(),
    isIos: isIosDevice(),
    canPrompt: canPromptInstall(),
    isInstallable: isInstallable(),
    promptInstall,
  }
}
