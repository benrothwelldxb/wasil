import { UserMinus } from 'lucide-react'
import { OrganiserShell } from './OrganiserShell'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Chip'
import { ButtonLink } from '@/components/ui/Button'
import { Loading, EmptyState } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useParticipants, useRemoveParticipant } from '@/data/hooks'
import { pluralise, timeAgo } from '@/lib/utils'

export function ParticipantsScreen() {
  const { group, groupId, isOrganiser, loading } = useActiveGroup()
  const participants = useParticipants(groupId)
  const remove = useRemoveParticipant(groupId ?? '')

  if (loading || participants.isLoading) {
    return <OrganiserShell title="Participants" backTo="/hq"><Loading /></OrganiserShell>
  }
  if (!group || !isOrganiser) {
    return (
      <OrganiserShell title="Participants" backTo="/hq">
        <EmptyState title="Nothing to manage here" />
      </OrganiserShell>
    )
  }

  const all = participants.data ?? []
  const drawn = group.status === 'drawn' || group.status === 'revealed'

  return (
    <OrganiserShell title="Participants" backTo="/hq">
      <p className="mb-3 text-sm text-ink-muted">
        {all.length} {pluralise(all.length, 'buddy', 'buddies')} · we only show who’s joined and
        whether they’re ready — never their preferences or their match.
      </p>

      <Card>
        <ul className="divide-y divide-cream-200">
          {all.map((p) => (
            <li key={p.member_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={p.display_name} seed={p.avatar_seed} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">
                  {p.display_name}
                  {p.role === 'organiser' && <span className="ml-2 text-xs text-ink-muted">(organiser)</span>}
                </p>
                <p className="text-xs text-ink-muted">Joined {timeAgo(p.joined_at)}</p>
              </div>
              <Badge tone={p.profile_complete ? 'sage' : 'yolk'}>
                {p.profile_complete ? 'Ready' : 'Finishing'}
              </Badge>
              {p.role !== 'organiser' && !drawn && (
                <button
                  onClick={() => remove.mutate(p.member_id)}
                  aria-label={`Remove ${p.display_name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-coral-tint hover:text-coral-deep"
                >
                  <UserMinus size={17} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ButtonLink to={`/hq/invite/${group.id}`} variant="secondary" fullWidth>
          Invite more
        </ButtonLink>
        <ButtonLink to="/hq" fullWidth>
          Back to HQ
        </ButtonLink>
      </div>
    </OrganiserShell>
  )
}
