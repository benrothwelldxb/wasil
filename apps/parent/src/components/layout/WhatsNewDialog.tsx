import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, Pin, EyeOff, X, type LucideIcon } from 'lucide-react'
import * as api from '@wasil/shared'
import type { ParentRelease } from '@wasil/shared'

const ICONS: Record<ParentRelease['icon'], LucideIcon> = {
  pin: Pin,
  'eye-off': EyeOff,
  sparkles: Sparkles,
}

/** Let the home screen settle first: a box over a page still loading reads as
 *  an error, not news. */
const SETTLE_MS = 1200

/** Is another dialog already up (the phone-number check, install, session expired)? */
function anotherDialogOpen(): boolean {
  return !!document.querySelector('[aria-modal="true"]:not([data-whats-new])')
}

/**
 * "What's new": shown once, on the home screen, when a feature has launched
 * since the parent last looked. The entries and who gets them are decided on
 * the server (services/parentReleases.ts), so this only displays and records.
 *
 * It waits its turn. Only on the home screen, so a parent who tapped a
 * notification to sign a form gets to the form first. Never over another
 * dialog: if one is open it waits for it to close. And the server sends
 * nothing while the school has an emergency alert running.
 *
 * Closed any way at all (Got it, the X, tapping outside, or following a link)
 * counts as seen, on every device the parent uses.
 */
export function WhatsNewDialog() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const onHome = pathname === '/'

  const [releases, setReleases] = useState<ParentRelease[] | null>(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  // Fetched once per app session, the first time the parent is on the home screen.
  useEffect(() => {
    if (!onHome || releases !== null) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      api.whatsNew.list()
        .then(list => { if (!cancelled) setReleases(list) })
        .catch(() => { if (!cancelled) setReleases([]) })
    }, SETTLE_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [onHome, releases])

  // Open when there is something to say, on the home screen, with no other
  // dialog up. Waits for one to close rather than stacking on it.
  useEffect(() => {
    if (done || open || !onHome || !releases || releases.length === 0) return
    if (!anotherDialogOpen()) { setOpen(true); return }
    const observer = new MutationObserver(() => {
      if (!anotherDialogOpen()) { observer.disconnect(); setOpen(true) }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] })
    return () => observer.disconnect()
  }, [done, open, onHome, releases])

  if (!open || !releases) return null

  const close = (then?: string) => {
    setOpen(false)
    setDone(true)
    // Best effort. If it does not reach the server the box comes back next
    // time, which is the better way to fail.
    api.whatsNew.markSeen(releases.map(r => r.id)).catch(() => {})
    if (then) navigate(then)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-5"
      style={{ backgroundColor: 'rgba(45, 34, 37, 0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={() => close()}
      role="presentation"
    >
      <div
        className="bg-white w-full max-w-[400px] overflow-y-auto"
        style={{ borderRadius: '26px', maxHeight: 'calc(100vh - 6rem)' }}
        role="dialog"
        aria-modal="true"
        data-whats-new
        aria-labelledby="whats-new-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pt-7 pb-4 text-center">
          <button
            onClick={() => close()}
            aria-label={t('common.close', 'Close')}
            className="absolute right-4 top-4 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#F5EEF0', color: '#7A6469' }}
          >
            <X className="w-4 h-4" />
          </button>
          <div
            className="w-16 h-16 rounded-[20px] flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#FFF0F3' }}
          >
            <Sparkles className="w-8 h-8" style={{ color: '#C4506E' }} />
          </div>
          <h2 id="whats-new-title" className="text-[22px] font-extrabold leading-tight" style={{ color: '#2D2225' }}>
            {t('whatsNew.title', 'New in the app')}
          </h2>
        </div>

        <ul className="px-6 space-y-4">
          {releases.map(r => {
            const Icon = ICONS[r.icon] ?? Sparkles
            return (
              <li key={r.id} className="flex gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#F7F0F1' }}
                >
                  <Icon className="w-5 h-5" style={{ color: '#C4506E', transform: r.icon === 'pin' ? 'rotate(45deg)' : undefined }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold" style={{ color: '#2D2225' }}>{r.title}</p>
                  <p className="text-[14px] mt-0.5 leading-snug" style={{ color: '#7A6469' }}>{r.blurb}</p>
                  {r.href && (
                    <button
                      onClick={() => close(r.href)}
                      className="mt-1 text-[14px] font-bold"
                      style={{ color: '#C4506E' }}
                    >
                      {r.cta || t('whatsNew.show', 'Show me')}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="px-6 pt-6 pb-7">
          <button
            onClick={() => close()}
            className="w-full py-4 rounded-2xl text-white text-[16px] font-bold active:opacity-90 transition-opacity"
            style={{ backgroundColor: '#C4506E' }}
          >
            {t('whatsNew.gotIt', 'Got it')}
          </button>
        </div>
      </div>
    </div>
  )
}
