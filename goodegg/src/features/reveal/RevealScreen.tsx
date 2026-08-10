import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { EnvelopeArt, ConfettiStrip } from '@/components/brand/illustrations'
import { Loading } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useMarkRevealed, useMyBuddy } from '@/data/hooks'
import { firstName } from '@/lib/utils'

export function RevealScreen() {
  const navigate = useNavigate()
  const { groupId, loading } = useActiveGroup()
  const buddy = useMyBuddy(groupId)
  const markRevealed = useMarkRevealed(groupId ?? '')
  const reduceMotion = useReducedMotion()
  const [revealed, setRevealed] = useState(false)

  if (loading || buddy.isLoading) {
    return <div className="mx-auto max-w-app"><Loading /></div>
  }
  if (!buddy.data) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-ink-muted">No buddy to reveal yet — the draw hasn’t run.</p>
        <ButtonLink to="/app">Back home</ButtonLink>
      </div>
    )
  }

  const name = buddy.data.preferred_name

  async function onReveal() {
    setRevealed(true)
    await markRevealed.mutateAsync()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-6 bg-cream-100 px-6 text-center safe-top safe-bottom">
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div
            key="sealed"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0 : 0.3 }}
            className="flex flex-col items-center gap-6"
          >
            <h1 className="font-display text-3xl text-ink">Keep this to yourself…</h1>
            <motion.div
              animate={reduceMotion ? undefined : { rotate: [-2, 2, -2] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            >
              <EnvelopeArt className="h-44 w-56" />
            </motion.div>
            <p className="max-w-xs text-ink-muted">
              You’ve got someone wonderful to surprise. Ready to find out who?
            </p>
            <Button size="lg" onClick={onReveal} className="min-w-56">
              Reveal my buddy
            </Button>
            <button onClick={() => navigate('/app')} className="text-sm text-ink-muted underline">
              How does this work?
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-5"
          >
            {!reduceMotion && <ConfettiStrip className="absolute left-0 top-16 opacity-90" />}
            <motion.div
              initial={{ scale: reduceMotion ? 1 : 0.5, rotate: reduceMotion ? 0 : -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 14 }}
            >
              <Avatar name={name} seed={buddy.data.profile_id} size="xl" className="h-32 w-32 text-4xl ring-8 ring-lilac-soft" />
            </motion.div>
            <div className="space-y-1">
              <p className="text-ink-muted">It’s…</p>
              <h1 className="font-display text-5xl text-ink">{name}!</h1>
              <p className="text-lg text-ink-soft">Now the fun begins.</p>
            </div>
            <div className="w-full max-w-xs space-y-2 pt-2">
              <ButtonLink to="/app/buddy" size="lg" fullWidth>
                Meet {firstName(name)}
              </ButtonLink>
              <ButtonLink to="/app/ideas" size="lg" variant="outline" fullWidth>
                Start surprising
              </ButtonLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
