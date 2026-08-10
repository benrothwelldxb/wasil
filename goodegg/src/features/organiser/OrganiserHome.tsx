import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BellRing,
  Lock,
  Mail,
  Settings2,
  Shuffle,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { OrganiserShell } from './OrganiserShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Chip'
import { Loading, EmptyState, SectionLabel } from '@/components/ui/states'
import { EggMascot } from '@/components/brand/EggMascot'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useParticipants, useRunDraw, useSetGroupStatus } from '@/data/hooks'
import { ButtonLink } from '@/components/ui/Button'
import { pluralise } from '@/lib/utils'
import type { GroupStatus } from '@/lib/types'

const statusLabel: Record<GroupStatus, string> = {
  draft: 'Draft',
  open: 'Open for joining',
  ready: 'Ready to draw',
  drawn: 'Draw complete',
  revealed: 'Revealed',
  archived: 'Archived',
}
const statusTone: Record<GroupStatus, 'ink' | 'sage' | 'lilac' | 'yolk' | 'coral'> = {
  draft: 'ink',
  open: 'yolk',
  ready: 'lilac',
  drawn: 'sage',
  revealed: 'sage',
  archived: 'ink',
}

export function OrganiserHome() {
  const navigate = useNavigate()
  const { group, groupId, isOrganiser, loading } = useActiveGroup()
  const participants = useParticipants(groupId)
  const runDraw = useRunDraw(groupId ?? '')
  const setStatus = useSetGroupStatus(groupId ?? '')

  const [confirming, setConfirming] = useState(false)
  const [reminded, setReminded] = useState(false)
  const [drawResult, setDrawResult] = useState<{ count: number; reciprocalCount: number } | null>(null)

  if (loading) return <OrganiserShell><Loading /></OrganiserShell>
  if (!group) {
    return (
      <OrganiserShell>
        <EmptyState
          title="No group to manage"
          body="Create a group to open Secret Buddy HQ."
          action={<ButtonLink to="/create">Create a group</ButtonLink>}
        />
      </OrganiserShell>
    )
  }
  if (!isOrganiser) {
    return (
      <OrganiserShell title="Secret Buddy HQ">
        <Card tone="cream">
          <CardBody className="text-center text-ink-soft">
            Only the organiser of <b>{group.name}</b> can manage it here.
          </CardBody>
        </Card>
      </OrganiserShell>
    )
  }

  const all = participants.data ?? []
  const total = all.length
  const ready = all.filter((p) => p.profile_complete).length
  const toFinish = total - ready
  const canDraw = total >= 3 && (group.status === 'open' || group.status === 'ready')
  const alreadyDrawn = group.status === 'drawn' || group.status === 'revealed'

  async function doDraw() {
    const res = await runDraw.mutateAsync()
    setDrawResult(res)
    setConfirming(false)
  }

  return (
    <OrganiserShell>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <SectionLabel>Secret Buddy HQ</SectionLabel>
          <h1 className="font-display text-3xl text-ink">{group.name}</h1>
        </div>
        <Badge tone={statusTone[group.status]}>{statusLabel[group.status]}</Badge>
      </div>

      {/* Participant summary — never assignment data */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatTile value={total} label={pluralise(total, 'buddy', 'buddies')} tone="lilac" />
        <StatTile value={ready} label="profiles ready" tone="sage" />
        <StatTile value={toFinish} label="still to finish" tone="yolk" />
      </div>

      {/* Draw / success */}
      {drawResult ? (
        <Card tone="sage" className="mb-4">
          <CardBody className="flex items-center gap-4">
            <EggMascot mood="love" className="h-16 w-16" />
            <div>
              <p className="font-display text-xl text-ink">The draw is done! 🎉</p>
              <p className="text-sm text-ink-soft">
                {drawResult.count} buddies matched. Everyone can now reveal their own — and no, we
                won’t tell you who got whom.
              </p>
            </div>
          </CardBody>
        </Card>
      ) : alreadyDrawn ? (
        <Card tone="sage" className="mb-4">
          <CardBody className="flex items-center gap-3">
            <Lock size={20} className="text-sage-deep" aria-hidden />
            <p className="text-sm text-ink-soft">
              The draw is complete and assignments are secret — even from you.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card tone="cream" className="mb-4">
          <CardBody className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Shuffle size={24} className="text-ink" aria-hidden />
            <div className="flex-1">
              <p className="font-semibold text-ink">Ready when you are</p>
              <p className="text-sm text-ink-muted">
                {canDraw
                  ? toFinish > 0
                    ? `${toFinish} ${pluralise(toFinish, 'person', 'people')} still finishing — you can wait or draw now.`
                    : 'Everyone’s ready. Run the secret draw whenever you like.'
                  : 'You need at least 3 buddies to run a draw.'}
              </p>
            </div>
            <Button onClick={() => setConfirming(true)} disabled={!canDraw}>
              Run draw
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Actions */}
      <SectionLabel className="mb-2">Actions</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ActionTile icon={Mail} label="Invite buddies" onClick={() => navigate(`/hq/invite/${group.id}`)} />
        <ActionTile icon={Users} label="View participants" onClick={() => navigate('/hq/participants')} />
        <ActionTile
          icon={BellRing}
          label={reminded ? 'Reminder sent ✓' : 'Send reminder'}
          onClick={() => {
            setReminded(true)
            setTimeout(() => setReminded(false), 2500)
          }}
        />
        <ActionTile icon={Star} label="Missions" onClick={() => navigate('/hq/missions')} />
        <ActionTile icon={Settings2} label="Group settings" onClick={() => navigate('/hq/settings')} />
        <ActionTile icon={Sparkles} label="Participant view" onClick={() => navigate('/app')} />
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
        <Lock size={13} aria-hidden /> We never show organisers who drew whom.
      </p>

      {/* Draw confirmation */}
      {confirming && (
        <ConfirmDraw
          count={total}
          onCancel={() => setConfirming(false)}
          onConfirm={doDraw}
          pending={runDraw.isPending}
          onCloseEntries={() => setStatus.mutate('ready')}
        />
      )}
    </OrganiserShell>
  )
}

function StatTile({ value, label, tone }: { value: number; label: string; tone: 'lilac' | 'sage' | 'yolk' }) {
  const bg = { lilac: 'bg-lilac-tint', sage: 'bg-sage-tint', yolk: 'bg-yolk-tint' }[tone]
  return (
    <div className={`rounded-card ${bg} p-4 text-center`}>
      <p className="font-display text-3xl text-ink">{value}</p>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
    </div>
  )
}

function ActionTile({ icon: Icon, label, onClick }: { icon: typeof Mail; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-card bg-white p-4 text-left shadow-card transition-shadow hover:shadow-card-hover"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-200 text-ink-soft">
        <Icon size={18} aria-hidden />
      </span>
      <span className="text-sm font-semibold text-ink">{label}</span>
    </button>
  )
}

function ConfirmDraw({
  count,
  onCancel,
  onConfirm,
  pending,
  onCloseEntries,
}: {
  count: number
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
  onCloseEntries: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm the draw">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <Shuffle size={22} className="text-ink" aria-hidden />
            <h2 className="font-display text-xl text-ink">Run the secret draw?</h2>
          </div>
          <p className="text-sm text-ink-soft">
            We’ll match all {count} buddies. Once drawn, <b>assignments become secret</b> — even you
            won’t be able to see who drew whom. Everyone can then reveal their own buddy.
          </p>
          <label className="flex items-start gap-2 text-sm text-ink-muted">
            <input type="checkbox" onChange={(e) => e.target.checked && onCloseEntries()} className="mt-0.5" />
            Also close entries so no one else can join.
          </label>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={onCancel} disabled={pending}>
              Not yet
            </Button>
            <Button fullWidth onClick={onConfirm} disabled={pending}>
              {pending ? 'Matching…' : 'Yes, run the draw'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
