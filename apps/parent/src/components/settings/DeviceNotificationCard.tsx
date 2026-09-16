import { useCallback, useEffect, useState } from 'react'
import { BellOff, BellRing, Share, PlusSquare, Settings as SettingsIcon } from 'lucide-react'
import {
  getDevicePushState,
  requestAndEnableWebPush,
  disableWebPush,
  clearOptInDismissal,
  ensureWebPushRegistered,
  type DevicePushState,
} from '../../services/webPush'

/**
 * "This device" card at the top of notification settings.
 *
 * The per-category toggles below it are SERVER-side preferences — they decide
 * what the backend sends. This card is the layer above: whether this browser is
 * allowed to receive anything at all. Without it a parent can see every category
 * switched on and still get nothing, with no explanation and nothing to press.
 *
 * Crucially it distinguishes `default` (prompt never answered — we can ask
 * again, and this is the common "I dismissed it once" case) from `denied`
 * (actively refused — no API can re-prompt, so we give OS instructions instead
 * of a button that would silently do nothing).
 */

const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
      (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1))

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-xs font-bold uppercase tracking-wider mb-2 px-1"
        style={{ color: '#A8929A' }}
      >
        This device
      </p>
      <div className="bg-white rounded-[22px] overflow-hidden" style={{ border: '1px solid #F0E4E6' }}>
        {children}
      </div>
    </div>
  )
}

function Row({
  on,
  title,
  subtitle,
  children,
}: {
  on: boolean
  title: string
  subtitle: string
  children?: React.ReactNode
}) {
  const Icon = on ? BellRing : BellOff
  const color = on ? '#5BA97B' : '#C47A5B'
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: color + '15' }}
      >
        <Icon className="w-[18px] h-[18px]" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#2D2225' }}>
          {title}
        </p>
        <p className="text-xs" style={{ color: '#A8929A' }}>
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  )
}

function Toggle({
  on,
  busy,
  onClick,
  label,
}: {
  on: boolean
  busy: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      role="switch"
      aria-checked={on}
      className="shrink-0 relative disabled:opacity-60"
      style={{ width: '48px', height: '28px' }}
    >
      <div
        className="absolute inset-0 rounded-full transition-colors duration-200"
        style={{ backgroundColor: on ? '#C4506E' : '#D8CDD0' }}
      />
      <div
        className="absolute top-[2px] w-[24px] h-[24px] bg-white rounded-full shadow-sm transition-transform duration-200"
        style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

/** Numbered how-to used by the two states we cannot fix from inside the app. */
function Steps({ icon: Icon, steps }: { icon: React.ElementType; steps: string[] }) {
  return (
    <div
      className="px-4 py-3.5 flex gap-3"
      style={{ borderTop: '1px solid #F5EEF0', backgroundColor: '#FDF8F9' }}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7A6469' }} />
      <ol className="flex-1 space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="text-xs leading-relaxed" style={{ color: '#7A6469' }}>
            <span className="font-bold">{i + 1}.</span> {step}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function DeviceNotificationCard() {
  const [state, setState] = useState<DevicePushState>(() => getDevicePushState())
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => setState(getDevicePushState()), [])

  // Self-heal the quietly-broken case: permission is granted and the parent
  // hasn't turned this device off, but the FCM token has rotated or was never
  // registered — so the card says "on" while nothing actually arrives. Opening
  // this screen is exactly when a parent is trying to fix that, and the call is
  // idempotent, so just re-register in the background.
  useEffect(() => {
    if (state === 'granted') void ensureWebPushRegistered()
    // Intentionally only on the transition into `granted`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state === 'granted'])

  // A parent sent to iOS/Chrome settings fixes it OUTSIDE the app and comes back.
  // Re-read on return so the card reflects reality without a manual reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const turnOn = async () => {
    setBusy(true)
    try {
      await requestAndEnableWebPush()
      // Whatever they chose, the banner nudge is no longer the only way in.
      clearOptInDismissal()
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      await disableWebPush()
    } finally {
      setBusy(false)
      refresh()
    }
  }

  // Native uses the Capacitor push path and its own OS permission flow.
  if (state === 'native') return null

  if (state === 'unsupported') {
    return (
      <Card>
        <Row
          on={false}
          title="Notifications aren't available here"
          subtitle="This browser can't receive push notifications. Try Chrome, Edge or Safari."
        />
      </Card>
    )
  }

  if (state === 'ios-needs-install') {
    return (
      <Card>
        <Row
          on={false}
          title="Add Wasil to your Home Screen"
          subtitle="On iPhone and iPad, notifications only work once the app is installed."
        />
        <Steps
          icon={Share}
          steps={[
            'Tap the Share button at the bottom of Safari.',
            'Choose "Add to Home Screen", then tap Add.',
            'Open Wasil from your Home Screen and turn notifications on here.',
          ]}
        />
      </Card>
    )
  }

  if (state === 'denied') {
    return (
      <Card>
        <Row
          on={false}
          title="Notifications are blocked"
          subtitle="This device refused notifications, so we can't ask again from here."
        />
        <Steps
          icon={isIos() ? SettingsIcon : PlusSquare}
          steps={
            isIos()
              ? [
                  'Open the iPhone Settings app, then tap Notifications.',
                  'Find Wasil in the list of apps and tap it.',
                  'Turn on "Allow Notifications", then come back to this screen.',
                ]
              : [
                  'Open your browser menu, then Settings → Site settings → Notifications.',
                  'Find this site in the blocked list and change it to Allow.',
                  'Return here and reload the page.',
                ]
          }
        />
      </Card>
    )
  }

  const on = state === 'granted'
  return (
    <Card>
      <Row
        on={on}
        title={on ? 'Notifications are on' : 'Notifications are off'}
        subtitle={
          on
            ? 'This device is set up to receive alerts.'
            : state === 'granted-off'
              ? 'Turn back on to start receiving alerts on this device again.'
              : "You haven't turned notifications on yet for this device."
        }
      >
        <Toggle
          on={on}
          busy={busy}
          onClick={on ? turnOff : turnOn}
          label={on ? 'Turn off notifications on this device' : 'Turn on notifications on this device'}
        />
      </Row>
    </Card>
  )
}
