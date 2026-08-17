import React, { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

const DISMISSED_KEY = 'wasil-install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
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
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Post-login "install this app" nudge for the parent PWA. Web-only — this
 * component is mounted inside AppLayout, which only renders once a parent is
 * authenticated, so it never shows on the login/register screens.
 *
 * - Android/Chrome: captures `beforeinstallprompt`, shows an "Install app"
 *   button that triggers the native install prompt.
 * - iOS Safari: there's no `beforeinstallprompt` API, so we show a one-line
 *   hint instead ("tap Share, then Add to Home Screen").
 * - Hidden entirely once already installed/standalone, and dismissal is
 *   remembered in localStorage so it doesn't nag on every visit.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (dismissed || isStandalone()) return

    if (isIos()) {
      setShowIosHint(true)
      return
    }

    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [dismissed])

  const dismiss = () => {
    setDismissed(true)
    setDeferredPrompt(null)
    setShowIosHint(false)
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // Best effort — if storage is unavailable the prompt just reappears next visit.
    }
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss()
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) return null

  return (
    <div
      className="fixed left-4 right-4 z-40 bg-white rounded-warm shadow-lg border border-burgundy-100 flex items-center gap-3 px-4 py-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}
      role="status"
    >
      <div className="w-9 h-9 rounded-full bg-burgundy-50 flex items-center justify-center flex-shrink-0">
        <Download className="w-4 h-4 text-burgundy" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">Install the app</p>
        <p className="text-xs text-gray-500">
          {deferredPrompt
            ? 'Add Wasil to your home screen for quick access.'
            : 'Tap Share, then "Add to Home Screen".'}
        </p>
      </div>
      {deferredPrompt && (
        <button
          onClick={handleInstall}
          className="flex-shrink-0 text-sm font-semibold text-white bg-burgundy rounded-warm-btn px-3 py-2"
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
