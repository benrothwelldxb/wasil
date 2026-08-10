import { useNavigate } from 'react-router-dom'
import { Gift, HelpCircle, Lightbulb } from 'lucide-react'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { ButtonLink } from '@/components/ui/Button'
import { Loading, EmptyState } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useMyBuddy } from '@/data/hooks'
import { buddyFacts } from '@/lib/buddy'

export function BuddyViewScreen() {
  const navigate = useNavigate()
  const { groupId, loading } = useActiveGroup()
  const buddy = useMyBuddy(groupId)

  if (loading || buddy.isLoading) return <Loading />
  if (!buddy.data) {
    return (
      <EmptyState
        title="No buddy yet"
        body="Once the draw has run and you’ve revealed, your buddy’s profile appears here."
        action={<ButtonLink to="/app">Back home</ButtonLink>}
      />
    )
  }

  const b = buddy.data
  const name = b.preferred_name
  const facts = buddyFacts(b)

  return (
    <div>
      <ScreenHeader onBack={() => navigate('/app')} />
      <div className="flex flex-col items-center gap-2 pb-5 text-center">
        <Avatar name={name} seed={b.profile_id} size="xl" className="h-24 w-24 ring-4 ring-lilac-soft" />
        <h1 className="accent-underline font-display text-4xl text-ink">{name}</h1>
      </div>

      <Card>
        <CardBody className="divide-y divide-cream-200">
          {facts.map((f, i) => (
            <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-xl leading-6" aria-hidden>{f.icon}</span>
              <span className="flex-1 text-ink-soft">{f.text}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card tone="lilac" className="mt-4">
        <CardBody className="flex items-center gap-3">
          <span className="text-xl" aria-hidden>💜</span>
          <p className="text-sm text-ink-soft">
            Remember: keep it secret, keep it kind, and have fun.
          </p>
        </CardBody>
      </Card>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <ButtonLink to="/app/ideas" variant="secondary" className="flex-col !h-auto py-3 text-xs">
          <Lightbulb size={18} aria-hidden /> Get an idea
        </ButtonLink>
        <ButtonLink to="/app/ask" variant="secondary" className="flex-col !h-auto py-3 text-xs">
          <HelpCircle size={18} aria-hidden /> Ask
        </ButtonLink>
        <ButtonLink to="/app/ideas" variant="primary" className="flex-col !h-auto py-3 text-xs">
          <Gift size={18} aria-hidden /> Surprise
        </ButtonLink>
      </div>
    </div>
  )
}
