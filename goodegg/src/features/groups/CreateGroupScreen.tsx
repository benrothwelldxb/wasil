import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { TextInput, TextArea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/states'
import { useCreateGroup } from '@/data/hooks'
import { useSession } from '@/store/session'

export function CreateGroupScreen() {
  const navigate = useNavigate()
  const create = useCreateGroup()
  const setActiveGroup = useSession((s) => s.setActiveGroup)

  const [name, setName] = useState('')
  const [organiser, setOrganiser] = useState('')
  const [description, setDescription] = useState('')
  const [revealDate, setRevealDate] = useState('')
  const [budget, setBudget] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length > 1 && organiser.trim().length > 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    try {
      const group = await create.mutateAsync({
        name,
        organiser_name: organiser,
        description: description || undefined,
        reveal_date: revealDate || null,
        suggested_budget: budget ? Number(budget) : null,
      })
      setActiveGroup(group.id)
      navigate(`/hq/invite/${group.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the group.')
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-app bg-cream-100 px-4 safe-top safe-bottom">
      <ScreenHeader title="Create a group" onBack={() => navigate('/')} />
      <div className="mb-5 px-1">
        <h2 className="font-display text-2xl text-ink">Let’s set the scene</h2>
        <p className="text-sm text-ink-muted">A few details and you’re ready to invite everyone.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <TextInput
          label="Group name"
          placeholder="e.g. The Good Eggs 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
        <TextInput
          label="Your name"
          hint="Shown to colleagues as the organiser."
          placeholder="e.g. Ben"
          value={organiser}
          onChange={(e) => setOrganiser(e.target.value)}
          required
        />
        <TextArea
          label="Description"
          optional
          placeholder="A little context for your colleagues."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextInput
          label="Reveal / end date"
          optional
          type="date"
          value={revealDate}
          onChange={(e) => setRevealDate(e.target.value)}
        />
        <TextInput
          label="Suggested surprise budget (£)"
          optional
          hint="Just a gentle steer — never a requirement. A kind note always counts."
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="e.g. 5"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />

        {error && <p className="text-sm text-coral-deep">{error}</p>}

        <div className="pt-2">
          <Button type="submit" size="lg" fullWidth disabled={!canSubmit || create.isPending}>
            {create.isPending ? <Spinner className="border-cream-50/40 border-t-cream-50" /> : 'Create the group'}
          </Button>
        </div>
      </form>
    </div>
  )
}
