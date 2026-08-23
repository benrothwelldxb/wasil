import React, { useState } from 'react'
import { Download, X } from 'lucide-react'
import { useInstallState } from '../../services/installState'

const DISMISSED_KEY = 'wasil-install-dismissed'

/**
 * Post-login "install this app" nudge for the parent PWA. Web-only — this
 * component is mounted inside AppLayout, which only renders once a parent is
 * authenticated, so it never shows on the login/register screens.
 *
 * - Android/Chrome: shows an "Install" button that triggers the native prompt.
 * - iOS Safari: there's no install API, so we show a one-line hint instead
 *   ("tap Share, then Add to Home Screen").
 * - Hidden once already installed/standalone. Dismissal is remembered in
 *   localStorage so the BANNER doesn't nag — but install stays reachable from the
 *   menu (Side menu → "Install app"), so a first "no" is never final.
 *
 * The `beforeinstallprompt` event is captured centrally in services/installState
 * (shared with the menu entry), not by this component.
 */
export function InstallPrompt() {
  const { isStandalone, isIos, canPrompt, promptInstall } = useInstallState()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // Best effort — if storage is unavailable the prompt just reappears next visit.
    }
  }

  const handleInstall = async () => {
    await promptInstall()
    dismiss()
  }

  // Show the banner only when there's something to offer and it hasn't been
  // dismissed: a native prompt (Android) or the iOS manual hint.
  if (dismissed || isStandalone || (!canPrompt && !isIos)) return null

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
          {canPrompt
            ? 'Add Wasil to your home screen for quick access.'
            : 'Tap Share, then "Add to Home Screen".'}
        </p>
      </div>
      {canPrompt && (
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
