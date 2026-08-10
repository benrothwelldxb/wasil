import { Link } from 'react-router-dom'
import { Card, CardBody } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { EggMascot } from '@/components/brand/EggMascot'
import { Loading } from '@/components/ui/states'
import { useParticipants } from '@/data/hooks'
import { pluralise } from '@/lib/utils'
import type { Group } from '@/lib/types'

export function WaitingRoom({ group, isOrganiser }: { group: Group; isOrganiser: boolean }) {
  const participants = useParticipants(group.id)
  if (participants.isLoading) return <Loading />

  const all = participants.data ?? []
  const joined = all.length
  const ready = all.filter((p) => p.profile_complete).length

  return (
    <div className="space-y-5 py-4">
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <EggMascot mood="happy" className="h-32 w-32" />
        <h1 className="font-display text-3xl text-ink">You’re in.</h1>
        <p className="text-lg text-ink-soft">
          <b className="text-ink">{ready}</b> of {joined} {pluralise(joined, 'buddy', 'buddies')} ready
        </p>
        <p className="max-w-xs text-sm text-ink-muted">
          Your secret buddy will be revealed when everyone is ready. We’ll let you know.
        </p>
      </div>

      <Card tone="cream">
        <CardBody className="space-y-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-cream-300">
            <div
              className="h-full rounded-full bg-sage-deep transition-all"
              style={{ width: `${joined ? Math.round((ready / joined) * 100) : 0}%` }}
            />
          </div>
          <p className="text-sm text-ink-muted">
            {joined - ready > 0
              ? `${joined - ready} still finishing their profile.`
              : 'Everyone’s ready — the organiser can run the draw.'}
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-3">
        <ButtonLink to="/app/profile" variant="secondary" fullWidth>
          Update my profile
        </ButtonLink>
        {isOrganiser && (
          <ButtonLink to="/hq" fullWidth>
            Go to Secret Buddy HQ
          </ButtonLink>
        )}
      </div>

      <p className="text-center text-xs text-ink-muted">
        Not you?{' '}
        <Link to="/" className="font-semibold text-lilac-deep underline">
          Switch group
        </Link>
      </p>
    </div>
  )
}
