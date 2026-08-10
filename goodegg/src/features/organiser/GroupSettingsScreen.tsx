import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OrganiserShell } from './OrganiserShell'
import { Card, CardBody } from '@/components/ui/Card'
import { TextArea, TextInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Loading, EmptyState, SectionLabel } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useSetGroupStatus, useUpdateGroup } from '@/data/hooks'

export function GroupSettingsScreen() {
  const navigate = useNavigate()
  const { group, groupId, isOrganiser, loading } = useActiveGroup()
  const update = useUpdateGroup(groupId ?? '')
  const setStatus = useSetGroupStatus(groupId ?? '')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [revealDate, setRevealDate] = useState('')
  const [budget, setBudget] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (group) {
      setName(group.name)
      setDescription(group.description ?? '')
      setRevealDate(group.reveal_date ?? '')
      setBudget(group.suggested_budget != null ? String(group.suggested_budget) : '')
    }
  }, [group])

  if (loading) return <OrganiserShell title="Group settings" backTo="/hq"><Loading /></OrganiserShell>
  if (!group || !isOrganiser) {
    return (
      <OrganiserShell title="Group settings" backTo="/hq">
        <EmptyState title="Nothing to manage here" />
      </OrganiserShell>
    )
  }

  async function save() {
    await update.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
      reveal_date: revealDate || null,
      suggested_budget: budget ? Number(budget) : null,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const archived = group.status === 'archived'

  return (
    <OrganiserShell title="Group settings" backTo="/hq">
      <Card tone="cream">
        <CardBody className="space-y-4">
          <TextInput label="Group name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextArea label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} />
          <TextInput label="Reveal / end date" optional type="date" value={revealDate} onChange={(e) => setRevealDate(e.target.value)} />
          <TextInput
            label="Suggested surprise budget (£)"
            optional
            type="number"
            min={0}
            inputMode="numeric"
            hint="A gentle steer only. A kind note always counts."
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <Button fullWidth onClick={save} disabled={update.isPending}>
            {saved ? 'Saved ✓' : 'Save settings'}
          </Button>
        </CardBody>
      </Card>

      <div className="mt-4">
        <SectionLabel className="mb-2">Group status</SectionLabel>
        <Card>
          <CardBody className="flex flex-wrap items-center gap-2">
            {group.status === 'open' && (
              <Button variant="secondary" size="sm" onClick={() => setStatus.mutate('ready')}>
                Close entries
              </Button>
            )}
            {group.status === 'ready' && (
              <Button variant="secondary" size="sm" onClick={() => setStatus.mutate('open')}>
                Reopen entries
              </Button>
            )}
            {!archived ? (
              <Button variant="outline" size="sm" onClick={() => setStatus.mutate('archived')}>
                Archive group
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setStatus.mutate('open')}>
                Unarchive
              </Button>
            )}
            <span className="text-sm text-ink-muted">Current: {group.status}</span>
          </CardBody>
        </Card>
      </div>

      <p className="mt-4 text-center text-xs text-ink-muted">
        Previous-year and specific pairings can be excluded from the draw — exclusion controls live
        with the draw engine and are ready for a future release.
      </p>

      <div className="mt-4">
        <Button variant="ghost" fullWidth onClick={() => navigate('/hq')}>
          Back to HQ
        </Button>
      </div>
    </OrganiserShell>
  )
}
