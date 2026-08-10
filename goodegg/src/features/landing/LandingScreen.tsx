import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/brand/Wordmark'
import { EggMascot } from '@/components/brand/EggMascot'
import { ButtonLink } from '@/components/ui/Button'

export function LandingScreen() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col bg-cream-100 px-6 safe-top safe-bottom">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <Wordmark size="text-6xl" className="mt-6" />

        <EggMascot mood="wave" className="h-40 w-40" title="The Good Egg mascot waving hello" />

        <div className="space-y-2">
          <p className="font-display text-2xl text-ink">Little surprises. Big smiles.</p>
          <p className="mx-auto max-w-xs text-ink-muted">
            An easy way to run Secret Buddy at work — a year of little anonymous surprises.
          </p>
        </div>
      </div>

      <div className="space-y-3 pb-6">
        <ButtonLink to="/create" size="lg" fullWidth>
          Create a group
        </ButtonLink>
        <ButtonLink to="/join" size="lg" variant="outline" fullWidth>
          Join a group
        </ButtonLink>
        <p className="pt-2 text-center text-sm text-ink-muted">
          Just looking?{' '}
          <Link to="/app" className="font-semibold text-lilac-deep underline">
            Explore the demo
          </Link>
        </p>
      </div>
    </div>
  )
}
