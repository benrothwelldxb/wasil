import React from 'react'
import { Download, X, Share, Plus } from 'lucide-react'

/**
 * "Add Wasil to your home screen" — one centred dialog, shared by the
 * post-login nudge and the side-menu entry so both look and read the same.
 *
 * Centred rather than a bottom sheet: at the bottom of a phone screen it
 * competed with the tab bar and the browser chrome, and on a short screen the
 * last line could sit under the fold. Blurred backdrop for the same reason —
 * the page behind was busy enough that a flat scrim didn't separate them.
 *
 * iOS carries the weight of the visuals: Safari has no install API, so a parent
 * has to find the Share button themselves, and describing it in words ("tap
 * Share") is exactly the instruction people fail at. The glyph is drawn next to
 * each step, in a mock toolbar, so they're looking for a SHAPE.
 */
export function InstallDialog({
  canPrompt,
  onInstall,
  onClose,
}: {
  /** Android/desktop: the native prompt is available. */
  canPrompt: boolean
  onInstall: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-5"
      style={{ backgroundColor: 'rgba(45, 34, 37, 0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white w-full max-w-[400px] overflow-y-auto"
        style={{ borderRadius: '26px', maxHeight: 'calc(100vh - 6rem)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Install the app"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-7 pb-5 text-center">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#F5EEF0', color: '#7A6469' }}
          >
            <X className="w-4 h-4" />
          </button>
          <div
            className="w-16 h-16 rounded-[20px] flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#FFF0F3' }}
          >
            <Download className="w-8 h-8" style={{ color: '#C4506E' }} />
          </div>
          <h2 className="text-[22px] font-extrabold leading-tight" style={{ color: '#2D2225' }}>
            Install Wasil
          </h2>
          <p className="text-[15px] mt-2 leading-snug" style={{ color: '#7A6469' }}>
            {canPrompt
              ? 'Add it to your home screen for one-tap access and instant notifications.'
              : 'Two taps and Wasil sits on your home screen, like any other app.'}
          </p>
        </div>

        {canPrompt ? (
          <div className="px-6 pb-7">
            <button
              onClick={onInstall}
              className="w-full py-4 rounded-2xl text-white text-[16px] font-bold active:opacity-90 transition-opacity"
              style={{ backgroundColor: '#C4506E' }}
            >
              Install app
            </button>
          </div>
        ) : (
          <div className="px-6 pb-7 space-y-5">
            {/* A mock of Safari's toolbar, with the Share button called out —
                people find this faster than reading "tap Share". */}
            <div
              className="rounded-2xl px-4 py-3 flex items-center justify-around"
              style={{ backgroundColor: '#F7F2F3', border: '1px solid #F0E4E6' }}
              aria-hidden="true"
            >
              <span className="text-[18px] leading-none" style={{ color: '#C9BDC0' }}>‹</span>
              <span className="text-[18px] leading-none" style={{ color: '#C9BDC0' }}>›</span>
              <span className="relative flex items-center justify-center">
                <span
                  className="absolute rounded-full"
                  style={{ width: '38px', height: '38px', backgroundColor: '#FFE3EA' }}
                />
                <Share className="w-5 h-5 relative" style={{ color: '#C4506E' }} strokeWidth={2.4} />
              </span>
              <span className="text-[16px] leading-none" style={{ color: '#C9BDC0' }}>▤</span>
              <span className="text-[16px] leading-none" style={{ color: '#C9BDC0' }}>⧉</span>
            </div>
            <p className="text-[13px] text-center -mt-2" style={{ color: '#A8929A' }}>
              The Share button in your browser's toolbar
            </p>

            <ol className="space-y-4">
              <Step n={1}>
                Tap the <strong>Share</strong> button
                <Share className="w-[18px] h-[18px] inline mx-1 -mt-0.5" style={{ color: '#C4506E' }} />
                in the toolbar.
              </Step>
              <Step n={2}>
                Scroll down the list and tap
                <Plus className="w-[18px] h-[18px] inline mx-1 -mt-0.5" style={{ color: '#C4506E' }} />
                <strong>Add to Home Screen</strong>.
              </Step>
              <Step n={3}>
                Tap <strong>Add</strong> — Wasil appears on your home screen.
              </Step>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3.5">
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-extrabold shrink-0"
        style={{ backgroundColor: '#FFF0F3', color: '#C4506E' }}
      >
        {n}
      </span>
      <span className="text-[15px] leading-relaxed" style={{ color: '#2D2225' }}>
        {children}
      </span>
    </li>
  )
}
