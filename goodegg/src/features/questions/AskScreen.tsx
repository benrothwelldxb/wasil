import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HelpCircle, Lock } from 'lucide-react'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Chip, Badge } from '@/components/ui/Chip'
import { TextArea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Loading, EmptyState } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useAskQuestion, useMyBuddy, useQuestionsIAsked } from '@/data/hooks'
import { firstName, timeAgo } from '@/lib/utils'

const SUGGESTIONS = ['Favourite snack?', 'Dream day off?', 'Go-to pick-me-up?', 'Weekend plans?']
const MAX = 120

export function AskScreen() {
  const navigate = useNavigate()
  const { groupId, loading } = useActiveGroup()
  const buddy = useMyBuddy(groupId)
  const asked = useQuestionsIAsked(groupId)
  const ask = useAskQuestion(groupId ?? '')
  const [text, setText] = useState('')

  if (loading || buddy.isLoading) return <Loading />
  if (!buddy.data) {
    return <EmptyState title="No buddy yet" body="You can ask your buddy once they’re revealed." />
  }

  const name = firstName(buddy.data.preferred_name)

  async function send() {
    const q = text.trim()
    if (!q) return
    await ask.mutateAsync(q)
    setText('')
  }

  return (
    <div>
      <ScreenHeader title="Ask anonymously" onBack={() => navigate(-1)} />

      <div className="flex flex-col items-center gap-2 pb-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lilac-tint text-lilac-deep">
          <HelpCircle size={26} aria-hidden />
        </span>
        <h1 className="font-display text-2xl text-ink">Ask {name} a question</h1>
        <p className="max-w-xs text-sm text-ink-muted">
          A little intel so you can surprise them in the best way.
        </p>
      </div>

      <Card tone="cream">
        <CardBody className="space-y-3">
          <TextArea
            aria-label="Your question"
            placeholder="Type your question here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX}
            showCount
          />
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-muted">Need inspiration?</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onToggle={() => setText(s)} />
              ))}
            </div>
          </div>
          <Button size="lg" fullWidth onClick={send} disabled={!text.trim() || ask.isPending}>
            Send question
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-sm text-ink-muted">
            <Lock size={14} aria-hidden /> {name} won’t know it’s you
          </p>
        </CardBody>
      </Card>

      {/* Previous threads */}
      {(asked.data ?? []).length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="px-1 font-display text-lg text-ink">Your questions</h2>
          {asked.data!.map((q) => (
            <Card key={q.id}>
              <CardBody className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink">{q.question}</p>
                  <Badge tone={q.status === 'answered' ? 'sage' : 'lilac'}>
                    {q.status === 'answered' ? 'Answered' : 'Waiting'}
                  </Badge>
                </div>
                {q.answer ? (
                  <p className="rounded-2xl bg-cream-100 p-3 text-sm text-ink-soft">{q.answer}</p>
                ) : (
                  <p className="text-sm text-ink-muted">Sent {timeAgo(q.created_at)} · no reply yet.</p>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
