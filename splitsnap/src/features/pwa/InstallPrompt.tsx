import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Share, SquarePlus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/layout/Logo'
import { usePwaInstall } from '@/features/pwa/usePwaInstall'

/**
 * A tasteful, dismissible bottom-sheet inviting the user to install the PWA.
 * Appears a few seconds after load (once installable and not dismissed):
 * a one-tap Install on Android/Chromium, or Share → Add to Home Screen
 * instructions on iOS.
 */
export function InstallPrompt() {
  const { canInstall, dismissed, isIos, hasNativePrompt, promptInstall, dismiss } =
    usePwaInstall()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!canInstall || dismissed) return
    const t = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(t)
  }, [canInstall, dismissed])

  const close = () => {
    setVisible(false)
    dismiss()
  }

  const show = visible && canInstall && !dismissed

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Install MyReceiptSplit"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={close}
          />

          <motion.div
            className="pb-safe relative z-10 w-full max-w-md rounded-t-3xl border border-border bg-card p-6 shadow-float sm:rounded-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <button
              type="button"
              aria-label="Dismiss"
              onClick={close}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center text-center">
              <Logo showText={false} className="mb-4 scale-125" />
              <h2 className="text-lg font-semibold">Install MyReceiptSplit</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Add it to your home screen for a full-screen, app-like
                experience that works offline.
              </p>
            </div>

            {hasNativePrompt ? (
              <div className="mt-6 space-y-2">
                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  onClick={async () => {
                    await promptInstall()
                    setVisible(false)
                  }}
                >
                  <Download />
                  Install app
                </Button>
                <Button variant="ghost" className="w-full" onClick={close}>
                  Not now
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <Step
                  icon={<Share className="h-4 w-4" />}
                  text={
                    <>
                      Tap the <span className="font-medium">Share</span> button
                      in your browser
                    </>
                  }
                />
                <Step
                  icon={<SquarePlus className="h-4 w-4" />}
                  text={
                    <>
                      Choose{' '}
                      <span className="font-medium">Add to Home Screen</span>
                    </>
                  }
                />
                {isIos && (
                  <Button variant="ghost" className="mt-1 w-full" onClick={close}>
                    Got it
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Step({ icon, text }: { icon: React.ReactNode; text: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
        {icon}
      </span>
      <p className="text-sm">{text}</p>
    </div>
  )
}
