import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Lightbulb, RefreshCw } from 'lucide-react'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Chip, Badge } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Loading, EmptyState, SectionLabel } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useMyBuddy } from '@/data/hooks'
import {
  templateIdeaProvider,
  formatCost,
  type IdeaBudget,
  type IdeaType,
} from '@/lib/ideas'
import { firstName } from '@/lib/utils'

const BUDGETS: { value: IdeaBudget; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'free', label: 'Free' },
  { value: 'under3', label: 'Under £3' },
  { value: 'under5', label: 'Under £5' },
  { value: 'under10', label: 'Under £10' },
]
const TYPES: { value: IdeaType; label: string }[] = [
  { value: 'anything', label: 'All' },
  { value: 'treat', label: 'Treat' },
  { value: 'drink', label: 'Drink' },
  { value: 'thoughtful', label: 'Thoughtful' },
  { value: 'funny', label: 'Funny' },
  { value: 'desk', label: 'Desk' },
]

export function IdeasScreen() {
  const navigate = useNavigate()
  const { groupId, loading } = useActiveGroup()
  const buddy = useMyBuddy(groupId)

  const [budget, setBudget] = useState<IdeaBudget>('any')
  const [type, setType] = useState<IdeaType>('anything')
  const [cursor, setCursor] = useState(0)
  const [saved, setSaved] = useState<Set<string>>(new Set())

  const ideas = useMemo(() => {
    if (!buddy.data) return []
    return templateIdeaProvider.generate({
      profile: buddy.data,
      filters: { budget, type },
      cursor,
      seed: 7,
    })
  }, [buddy.data, budget, type, cursor])

  if (loading || buddy.isLoading) return <Loading />
  if (!buddy.data) {
    return <EmptyState title="No buddy yet" body="Ideas appear once your buddy is revealed." />
  }

  const name = firstName(buddy.data.preferred_name)
  const idea = ideas[0]

  return (
    <div>
      <ScreenHeader title={`Surprise ${name}`} onBack={() => navigate(-1)} />

      <div className="flex flex-col items-center gap-2 pb-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-yolk-tint text-yolk-deep">
          <Lightbulb size={26} aria-hidden />
        </span>
        <h1 className="font-display text-2xl text-ink">Need an idea?</h1>
        <p className="max-w-xs text-sm text-ink-muted">
          Thoughtful little surprises based on what {name} loves. A kind note always counts.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-2 pb-4">
        <div>
          <SectionLabel className="mb-1">Budget</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => (
              <Chip key={b.value} label={b.label} selected={budget === b.value} onToggle={() => { setBudget(b.value); setCursor(0) }} />
            ))}
          </div>
        </div>
        <div>
          <SectionLabel className="mb-1">Type</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <Chip key={t.value} label={t.label} selected={type === t.value} onToggle={() => { setType(t.value); setCursor(0) }} />
            ))}
          </div>
        </div>
      </div>

      {/* Idea card */}
      {idea ? (
        <Card tone="cream">
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge tone="yolk">{idea.type}</Badge>
              <button
                aria-label={saved.has(idea.title) ? 'Saved' : 'Save idea'}
                aria-pressed={saved.has(idea.title)}
                onClick={() =>
                  setSaved((s) => {
                    const next = new Set(s)
                    next.has(idea.title) ? next.delete(idea.title) : next.add(idea.title)
                    return next
                  })
                }
                className="text-coral"
              >
                <Heart size={22} fill={saved.has(idea.title) ? '#F0674F' : 'none'} aria-hidden />
              </button>
            </div>
            <div>
              <SectionLabel>{idea.operation}</SectionLabel>
              <h2 className="font-display text-2xl text-ink">{idea.title}</h2>
            </div>
            <p className="text-ink-soft">{idea.description}</p>
            <p className="text-sm font-semibold text-ink">Approx. cost: {formatCost(idea.cost)}</p>
            {idea.note && (
              <div className="rounded-2xl bg-white p-3 text-sm text-ink-soft">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Note idea
                </span>
                “{idea.note}”
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <EmptyState
          mood="sleepy"
          title="No ideas for those filters"
          body="Try widening the budget or type — there’s always a kind note."
        />
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => setCursor((c) => c + 1)} disabled={ideas.length < 2}>
          <RefreshCw size={16} aria-hidden /> Another idea
        </Button>
        <Button
          onClick={() => idea && setSaved((s) => new Set(s).add(idea.title))}
          disabled={!idea}
        >
          <Heart size={16} aria-hidden /> Save idea
        </Button>
      </div>
    </div>
  )
}
