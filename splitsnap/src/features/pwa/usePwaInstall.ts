import { useCallback, useEffect, useState } from 'react'

/** The non-standard event Chromium fires when a PWA can be installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'myreceiptsplit-install-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOSDevice = /iphone|ipad|ipod/i.test(ua)
  // iPadOS 13+ reports as Mac; detect touch to catch it.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return iOSDevice || iPadOS
}

/**
 * Drives the "install app" experience:
 * - Android/desktop Chromium: captures beforeinstallprompt for a real
 *   one-tap install.
 * - iOS Safari (no such event): reports platform so the UI can show the
 *   manual "Share → Add to Home Screen" steps.
 * Hidden once installed or dismissed (remembered on-device).
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [dismissed, setDismissed] = useState(
    () =>
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(DISMISS_KEY) === '1',
  )

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    if (outcome === 'accepted') setInstalled(true)
  }, [deferred])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore storage errors (private mode)
    }
  }, [])

  const ios = isIos()
  // Something to offer: a captured prompt (Android) or iOS manual steps.
  const canInstall = !installed && (deferred !== null || ios)

  return {
    canInstall,
    installed,
    dismissed,
    isIos: ios,
    /** True only when a real programmatic prompt is available. */
    hasNativePrompt: deferred !== null,
    promptInstall,
    dismiss,
  }
}
