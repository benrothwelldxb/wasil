import { AnimatePresence, motion } from 'framer-motion'
import { Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { PersonChip } from '@/features/split/PersonChip'
import { PersonAvatar } from '@/features/people'
import type { Person, ReceiptItem } from '@/types'

interface ItemAssignmentProps {
  item: ReceiptItem
  people: Person[]
  currency?: string
  onToggle: (personId: string) => void
  onToggleEveryone: () => void
  onSetSplitMode: (mode: 'even' | 'count') => void
  onSetShare: (personId: string, count: number) => void
}

/**
 * One receipt item with either equal-split people chips or, for multi-unit
 * items, per-person quantity steppers ("Ann ×4, Bob ×7"). Shows the per-person
 * share so the split is always clear.
 */
export function ItemAssignment({
  item,
  people,
  currency = 'GBP',
  onToggle,
  onToggleEveryone,
  onSetSplitMode,
  onSetShare,
}: ItemAssignmentProps) {
  const quantity = item.quantity || 1
  const unit = item.price
  const lineTotal = unit * quantity
  const byCount = item.shares !== undefined

  const assignees = item.assignedTo.filter((id) =>
    people.some((p) => p.id === id),
  )
  const everyone = people.length > 0 && assignees.length === people.length
  const evenShare = assignees.length > 0 ? lineTotal / assignees.length : 0

  const shares = item.shares ?? {}
  const allocatedUnits = people.reduce((sum, p) => sum + (shares[p.id] ?? 0), 0)
  const remainingUnits = Math.max(0, quantity - allocatedUnits)

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate font-medium">
          {quantity > 1 && (
            <span className="mr-1 text-muted-foreground">{quantity}×</span>
          )}
          {item.label || 'Item'}
        </p>
        <p className="shrink-0 font-semibold tabular-nums">
          {formatCurrency(lineTotal, currency)}
        </p>
      </div>

      {quantity > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
          {(['even', 'count'] as const).map((mode) => {
            const active = byCount === (mode === 'count')
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSetSplitMode(mode)}
                aria-pressed={active}
                className={cn(
                  'relative rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`split-mode-${item.id}`}
                    className="absolute inset-0 rounded-lg bg-background shadow-soft"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">
                  {mode === 'even' ? 'Split evenly' : 'By count'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {byCount ? (
          <motion.div
            key="count"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 space-y-2"
          >
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add people to split by count.
              </p>
            ) : (
              people.map((person) => {
                const count = shares[person.id] ?? 0
                return (
                  <div key={person.id} className="flex items-center gap-3">
                    <PersonAvatar person={person} size="sm" ring={false} />
                    <span className="flex-1 truncate text-sm font-medium">
                      {person.name}
                    </span>
                    {count > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(unit * count, currency)}
                      </span>
                    )}
                    <QuantityStepper
                      size="sm"
                      value={count}
                      min={0}
                      max={count + remainingUnits}
                      label={person.name}
                      onChange={(c) => onSetShare(person.id, c)}
                    />
                  </div>
                )
              })
            )}
            <p className="pt-1 text-xs text-muted-foreground">
              {remainingUnits > 0
                ? `${remainingUnits} of ${quantity} still to assign`
                : `All ${quantity} assigned`}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="even"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
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
                  {formatCurrency(evenShare, currency)} each · split{' '}
                  {assignees.length} ways
                </>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
