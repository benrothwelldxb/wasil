import { motion } from 'framer-motion'

import { formatCurrency } from '@/lib/format'
import { PersonAvatar } from '@/features/people'
import type { SplitResult } from '@/features/split/split-calc'

interface SplitSummaryProps {
  result: SplitResult
  currency?: string
}

/**
 * Running totals: what each person owes, plus anything still unassigned and
 * the grand total. Re-renders instantly as assignments change.
 */
export function SplitSummary({ result, currency = 'GBP' }: SplitSummaryProps) {
  const { totals, unassigned, serviceCharge, total } = result

  return (
    <div
      data-testid="split-summary"
      className="rounded-2xl border border-border bg-card p-4 shadow-card"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Running total</p>
        <p className="text-sm font-semibold tabular-nums">
          {formatCurrency(total, currency)}
        </p>
      </div>

      <ul className="space-y-1">
        {totals.map(({ person, amount, itemCount }) => (
          <li
            key={person.id}
            className="flex items-center gap-3 rounded-xl px-1 py-1.5"
          >
            <PersonAvatar person={person} size="sm" ring={false} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{person.name}</p>
              <p className="text-xs text-muted-foreground">
                {itemCount === 0
                  ? 'Nothing yet'
                  : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
              </p>
            </div>
            <motion.span
              key={amount}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="font-semibold tabular-nums"
            >
              {formatCurrency(amount, currency)}
            </motion.span>
          </li>
        ))}
      </ul>

      {(serviceCharge > 0.005 || unassigned > 0.005) && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
          {serviceCharge > 0.005 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Service charge{' '}
                <span className="text-xs">(included above)</span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrency(serviceCharge, currency)}
              </span>
            </div>
          )}
          {unassigned > 0.005 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Unassigned</span>
              <span className="font-semibold tabular-nums text-destructive/80">
                {formatCurrency(unassigned, currency)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
