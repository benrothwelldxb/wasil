import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import {
  isWebPushSupported,
  getNotificationPermission,
  requestAndEnableWebPush,
} from '../../services/webPush'

const DISMISSED_KEY = 'wasil-notif-optin-dismissed'

/**
 * Post-login "Turn on notifications" nudge for the parent PWA. Web-only, and a
 * sibling to <InstallPrompt/> — both are mounted inside AppLayout, which only
 * renders for authenticated parents.
 *
 * We deliberately do NOT auto-call Notification.requestPermission(): browsers
 * penalise unsolicited permission prompts. The banner only appears when web push
 * is actually usable (see isWebPushSupported — includes the iOS "must be
 * installed/standalone" guard) AND permission is still `default`. Clicking
 * "Turn on" triggers the permission prompt, then the getToken+register flow.
 * Dismissal is remembered in localStorage so it never nags.
 */
export function NotificationOptIn() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === 'true'
    } catch {
      // storage unavailable — treat as not dismissed
    }
    if (dismissed) return
    if (!isWebPushSupported()) return
    if (getNotificationPermission() !== 'default') return
    setVisible(true)
  }, [])

  const remember = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // best effort
    }
  }

  const dismiss = () => {
    setVisible(false)
    remember()
  }

  const enable = async () => {
    setBusy(true)
    try {
      await requestAndEnableWebPush()
    } finally {
      setBusy(false)
      // Whatever the outcome (granted, denied, or dismissed), hide and remember
      // so we don't re-prompt on every visit.
      setVisible(false)
      remember()
    }
  }

  if (!visible) return null

  return (
    <div
      className="fixed left-4 right-4 z-40 bg-white rounded-warm shadow-lg border border-burgundy-100 flex items-center gap-3 px-4 py-3"
      // Sits above the install nudge (which is anchored ~76px) so they don't overlap.
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 140px)' }}
      role="status"
    >
      <div className="w-9 h-9 rounded-full bg-burgundy-50 flex items-center justify-center flex-shrink-0">
        <Bell className="w-4 h-4 text-burgundy" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">Turn on notifications</p>
        <p className="text-xs text-gray-500">Get alerts for messages, events and reminders.</p>
      </div>
      <button
        onClick={enable}
        disabled={busy}
        className="flex-shrink-0 text-sm font-semibold text-white bg-burgundy rounded-warm-btn px-3 py-2 disabled:opacity-60"
      >
        {busy ? 'Enabling…' : 'Turn on'}
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss notifications prompt"
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
