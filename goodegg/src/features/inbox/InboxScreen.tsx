import { useState } from 'react'
import { Gift, Lightbulb, Mail, Star } from 'lucide-react'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/Field'
import { EmptyState, Loading, SectionLabel } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useAnswerQuestion, useInbox, useQuestionsForMe } from '@/data/hooks'
import { timeAgo } from '@/lib/utils'
import type { InboxKind } from '@/lib/types'
import type { ReceivedQuestion } from '@/data'

const iconFor: Record<InboxKind, typeof Mail> = {
  question_answered: Mail,
  question_received: Mail,
  new_idea: Lightbulb,
  new_mission: Star,
  accomplice: Gift,
}

export function InboxScreen() {
  const { groupId, loading } = useActiveGroup()
  const inbox = useInbox(groupId)
  const forMe = useQuestionsForMe(groupId)

  if (loading || inbox.isLoading || forMe.isLoading) return <Loading />

  const pending = (forMe.data ?? []).filter((q) => q.status === 'pending')
  const items = inbox.data ?? []

  const isEmpty = pending.length === 0 && items.length === 0

  return (
    <div>
      <ScreenHeader title="Messages" onBack={undefined} />

      {isEmpty ? (
        <EmptyState
          title="Nothing yet"
          body="When your buddy answers a question or a new mission lands, it’ll show up here."
        />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <section className="space-y-3">
              <SectionLabel className="px-1">Questions for you</SectionLabel>
              {pending.map((q) => (
                <AnswerCard key={q.id} question={q} groupId={groupId ?? ''} />
              ))}
            </section>
          )}

          {items.length > 0 && (
            <section className="space-y-3">
              <SectionLabel className="px-1">Activity</SectionLabel>
              {items.map((item) => {
                const Icon = iconFor[item.kind]
                return (
                  <Card key={item.id}>
                    <CardBody className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-200 text-ink-soft">
                        <Icon size={18} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{item.title}</p>
                        <p className="truncate text-sm text-ink-muted">{item.body}</p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-faint">{timeAgo(item.created_at)}</span>
                    </CardBody>
                  </Card>
                )
              })}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function AnswerCard({ question, groupId }: { question: ReceivedQuestion; groupId: string }) {
  const answer = useAnswerQuestion(groupId)
  const [text, setText] = useState('')

  return (
    <Card tone="lilac">
      <CardBody className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-lilac-deep">
            Your Secret Buddy has a question…
          </p>
          <p className="mt-1 font-display text-lg text-ink">{question.question}</p>
        </div>
        <TextArea
          aria-label="Your answer"
          placeholder="Type your reply…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
        />
        <Button
          fullWidth
          onClick={() => answer.mutate({ id: question.id, answer: text })}
          disabled={!text.trim() || answer.isPending}
        >
          Send reply
        </Button>
        <p className="text-center text-xs text-ink-muted">Your reply goes back anonymously.</p>
      </CardBody>
    </Card>
  )
}
