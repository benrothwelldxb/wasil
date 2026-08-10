import { useState } from 'react'
import { OrganiserShell } from './OrganiserShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { TextArea, TextInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Loading, EmptyState, SectionLabel } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useCreateMission, useMissions } from '@/data/hooks'
import { formatDate } from '@/lib/utils'
import type { Mission } from '@/lib/types'

const ACCENTS: Mission['accent'][] = ['sage', 'lilac', 'peach', 'yolk', 'coral']

export function MissionsAdminScreen() {
  const { group, groupId, isOrganiser, loading } = useActiveGroup()
  const missions = useMissions(groupId)
  const create = useCreateMission(groupId ?? '')

  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [body, setBody] = useState('')
  const [accent, setAccent] = useState<Mission['accent']>('sage')

  if (loading || missions.isLoading) {
    return <OrganiserShell title="Missions" backTo="/hq"><Loading /></OrganiserShell>
  }
  if (!group || !isOrganiser) {
    return (
      <OrganiserShell title="Missions" backTo="/hq">
        <EmptyState title="Nothing to manage here" />
      </OrganiserShell>
    )
  }

  const canCreate = title.trim() && tagline.trim() && body.trim()

  async function add() {
    if (!canCreate) return
    await create.mutateAsync({
      title: title.trim(),
      tagline: tagline.trim(),
      body: body.trim(),
      accent,
      starts_at: new Date().toISOString().slice(0, 10),
      ends_at: null,
    })
    setTitle('')
    setTagline('')
    setBody('')
  }

  return (
    <OrganiserShell title="Missions" backTo="/hq">
      <p className="mb-4 text-sm text-ink-muted">
        Missions are optional, gentle prompts for the whole group. Completion is never tracked or
        shown — that’s the point.
      </p>

      <Card tone="cream" className="mb-5">
        <CardBody className="space-y-3">
          <SectionLabel>New mission</SectionLabel>
          <TextInput label="Title" placeholder="e.g. November mission" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextInput label="Tagline" placeholder="e.g. Cosy season" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          <TextArea label="Prompt" placeholder="e.g. Leave your buddy something warming." value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="space-y-1.5">
            <span className="text-sm font-semibold text-ink">Colour</span>
            <div className="flex gap-2">
              {ACCENTS.map((a) => (
                <Chip key={a} label={a} selected={accent === a} onToggle={() => setAccent(a)} />
              ))}
            </div>
          </div>
          <Button fullWidth onClick={add} disabled={!canCreate || create.isPending}>
            Add mission
          </Button>
        </CardBody>
      </Card>

      <SectionLabel className="mb-2">All missions</SectionLabel>
      <Card>
        <ul className="divide-y divide-cream-200">
          {(missions.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-semibold text-ink">{m.title}</p>
                <p className="text-sm text-ink-muted">{m.tagline}</p>
              </div>
              <span className="text-xs text-ink-faint">{formatDate(m.starts_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </OrganiserShell>
  )
}
