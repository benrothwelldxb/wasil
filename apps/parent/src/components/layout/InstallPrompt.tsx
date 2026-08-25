import { useState } from 'react'
import { useInstallState } from '../../services/installState'
import { InstallDialog } from './InstallDialog'

const DISMISSED_KEY = 'wasil-install-dismissed'

/**
 * Post-login "install this app" nudge for the parent PWA. Web-only — this
 * component is mounted inside AppLayout, which only renders once a parent is
 * authenticated, so it never shows on the login/register screens.
 *
 * - Android/Chrome: an "Install app" button that triggers the native prompt.
 * - iOS Safari: there's no install API, so the dialog walks through Share →
 *   Add to Home Screen, with the Share glyph drawn so it can be recognised.
 *
 * - Hidden once already installed/standalone. Dismissal is remembered in
 *   localStorage so it doesn't nag — but install stays reachable from the menu
 *   (Side menu → "Install app"), so a first "no" is never final.
 *
 * Presented as a CENTRED dialog (see InstallDialog): as a strip above the tab
 * bar it was small, easy to miss, and sat in the busiest part of the screen.
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

  // Offer it only when there's something to offer and it hasn't been dismissed:
  // a native prompt (Android) or the iOS manual walkthrough.
  if (dismissed || isStandalone || (!canPrompt && !isIos)) return null

  return <InstallDialog canPrompt={canPrompt} onInstall={handleInstall} onClose={dismiss} />
}
