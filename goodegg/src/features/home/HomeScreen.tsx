import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { HomeHeader } from './HomeHeader'
import { BuddyCard } from './BuddyCard'
import { QuickActions } from './QuickActions'
import { MissionCard } from '@/features/missions/MissionCard'
import { WaitingRoom } from '@/features/waiting/WaitingRoom'
import { Card, CardBody } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { EggMascot } from '@/components/brand/EggMascot'
import { EnvelopeArt } from '@/components/brand/illustrations'
import { Loading } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import {
  useCurrentMission,
  useCurrentProfile,
  useHasRevealed,
  useInbox,
  useMyBuddy,
} from '@/data/hooks'
import { firstName, greeting } from '@/lib/utils'

export function HomeScreen() {
  const { group, isOrganiser, loading } = useActiveGroup()
  const me = useCurrentProfile()

  if (loading) return <Loading />

  if (!group) return <NoGroupHome name={me.data?.display_name} />

  if (group.status === 'draft' || group.status === 'open' || group.status === 'ready') {
    return <WaitingRoom group={group} isOrganiser={isOrganiser} />
  }

  return <DrawnHome groupId={group.id} name={me.data?.display_name ?? 'there'} isOrganiser={isOrganiser} />
}

function DrawnHome({ groupId, name, isOrganiser }: { groupId: string; name: string; isOrganiser: boolean }) {
  const revealed = useHasRevealed(groupId)
  const buddy = useMyBuddy(groupId)
  const mission = useCurrentMission(groupId)
  const inbox = useInbox(groupId)
  const unread = (inbox.data ?? []).filter((i) => !i.read).length

  return (
    <div className="space-y-5">
      <HomeHeader unread={unread} />

      <div className="px-1">
        <h1 className="font-display text-3xl text-ink">
          {greeting()}, {firstName(name)}
        </h1>
        <p className="text-ink-muted">Little surprises. Big smiles.</p>
      </div>

      {revealed.data && buddy.data ? (
        <BuddyCard buddy={buddy.data} />
      ) : (
        <RevealPromptCard />
      )}

      {revealed.data && <QuickActions />}

      {mission.data && <MissionCard mission={mission.data} />}

      {isOrganiser && (
        <Link to="/hq" className="block">
          <Card interactive tone="lilac">
            <CardBody className="flex items-center gap-3">
              <Sparkles size={20} className="text-lilac-deep" aria-hidden />
              <span className="flex-1 text-sm font-semibold text-ink">Manage your group in Secret Buddy HQ</span>
              <ArrowRight size={18} className="text-lilac-deep" aria-hidden />
            </CardBody>
          </Card>
        </Link>
      )}
    </div>
  )
}

function RevealPromptCard() {
  return (
    <Card tone="cream">
      <CardBody className="flex flex-col items-center gap-3 py-8 text-center">
        <EnvelopeArt className="h-24 w-32" />
        <h2 className="font-display text-2xl text-ink">Keep this to yourself…</h2>
        <p className="max-w-xs text-sm text-ink-muted">
          The draw is done. You’ve got someone wonderful to surprise this year.
        </p>
        <ButtonLink to="/app/reveal" size="lg" className="mt-1">
          Reveal my buddy
        </ButtonLink>
      </CardBody>
    </Card>
  )
}

function NoGroupHome({ name }: { name?: string }) {
  return (
    <div className="space-y-5">
      <HomeHeader unread={0} />
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <EggMascot mood="wave" className="h-28 w-28" />
        <h1 className="font-display text-2xl text-ink">
          {name ? `Hello, ${firstName(name)}` : 'Welcome'}
        </h1>
        <p className="max-w-xs text-ink-muted">
          You’re not in a group yet. Create one for your team, or join with a code.
        </p>
        <div className="w-full max-w-xs space-y-2 pt-2">
          <ButtonLink to="/create" size="lg" fullWidth>
            Create a group
          </ButtonLink>
          <ButtonLink to="/join" size="lg" variant="outline" fullWidth>
            Join a group
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
