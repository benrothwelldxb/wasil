import { Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { PersonChip } from '@/features/split/PersonChip'
import type { Person, ReceiptItem } from '@/types'

interface ItemAssignmentProps {
  item: ReceiptItem
  people: Person[]
  currency?: string
  onToggle: (personId: string) => void
  onToggleEveryone: () => void
}

/**
 * One receipt item with a row of selectable people chips. Shows the item cost
 * and, once shared, the per-person share so the even split is obvious.
 */
export function ItemAssignment({
  item,
  people,
  currency = 'GBP',
  onToggle,
  onToggleEveryone,
}: ItemAssignmentProps) {
  const cost = item.price * (item.quantity || 1)
  const assignees = item.assignedTo.filter((id) =>
    people.some((p) => p.id === id),
  )
  const everyone = people.length > 0 && assignees.length === people.length
  const share = assignees.length > 0 ? cost / assignees.length : 0

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate font-medium">
          {item.quantity > 1 && (
            <span className="mr-1 text-muted-foreground">{item.quantity}×</span>
          )}
          {item.label || 'Item'}
        </p>
        <p className="shrink-0 font-semibold tabular-nums">
          {formatCurrency(cost, currency)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {people.map((person) => (
          <PersonChip
            key={person.id}
            person={person}
            selected={assignees.includes(person.id)}
            onToggle={() => onToggle(person.id)}
          />
        ))}

        {people.length > 1 && (
          <button
            type="button"
            onClick={onToggleEveryone}
            aria-pressed={everyone}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-sm font-medium transition-colors',
              everyone
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted-foreground hover:bg-secondary',
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Everyone
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {assignees.length === 0 ? (
          <span className="text-destructive/80">Not assigned yet</span>
        ) : assignees.length === 1 ? (
          'Just them'
        ) : (
          <>
            {formatCurrency(share, currency)} each · split {assignees.length}{' '}
            ways
          </>
        )}
      </p>
    </div>
  )
}
