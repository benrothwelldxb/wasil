import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ReceiptText, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { useReceiptStore } from '@/features/receipt'
import { AddPersonForm, usePeople } from '@/features/people'
import {
  ItemAssignment,
  ServiceChargeCard,
  SplitSummary,
  computeSplit,
} from '@/features/split'
import { useCurrency } from '@/features/settings'
import { CurrencySelect } from '@/components/CurrencySelect'

export function SplitPage() {
  const items = useReceiptStore((s) => s.items)
  const serviceCharge = useReceiptStore((s) => s.serviceCharge)
  const toggleAssignment = useReceiptStore((s) => s.toggleAssignment)
  const setAssignees = useReceiptStore((s) => s.setAssignees)
  const setItemSplitMode = useReceiptStore((s) => s.setItemSplitMode)
  const setItemShare = useReceiptStore((s) => s.setItemShare)
  const { currency, setCurrency } = useCurrency()
  const { people, addPerson } = usePeople()

  const roster = people ?? []
  const result = useMemo(
    () => computeSplit(items, roster, serviceCharge),
    [items, roster, serviceCharge],
  )

  if (items.length === 0) {
    return (
      <div>
        <PageHeader
          title="Split"
          description="Tap who had what and settle up."
        />
        <EmptyState
          icon={ReceiptText}
          title="No items to split yet"
          description="Scan a receipt and review the items, then come back to divvy them up."
          action={
            <Button asChild>
              <Link to="/scan">Scan a receipt</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Split"
        description="Tap the people who shared each item."
        action={<CurrencySelect value={currency} onChange={setCurrency} />}
      />

      {roster.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card/40 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-accent-strong" />
            Add people to start splitting
          </div>
          <AddPersonForm onAdd={addPerson} />
          <p className="text-xs text-muted-foreground">
            People are saved on your device for next time.
          </p>
        </div>
      ) : (
        <SplitSummary result={result} currency={currency} />
      )}

      {roster.length > 0 && (
        <ServiceChargeCard people={roster} currency={currency} />
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <ItemAssignment
            key={item.id}
            item={item}
            people={roster}
            currency={currency}
            onToggle={(personId) => toggleAssignment(item.id, personId)}
            onToggleEveryone={() => {
              const everyone =
                roster.length > 0 &&
                roster.every((p) => item.assignedTo.includes(p.id))
              setAssignees(item.id, everyone ? [] : roster.map((p) => p.id))
            }}
            onSetSplitMode={(mode) => setItemSplitMode(item.id, mode)}
            onSetShare={(personId, count) =>
              setItemShare(item.id, personId, count)
            }
          />
        ))}
      </div>

      {roster.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border p-4">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            Someone missing?
          </p>
          <AddPersonForm onAdd={addPerson} />
        </div>
      )}
    </div>
  )
}
