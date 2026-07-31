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

export function SplitPage() {
  const items = useReceiptStore((s) => s.items)
  const serviceCharge = useReceiptStore((s) => s.serviceCharge)
  const toggleAssignment = useReceiptStore((s) => s.toggleAssignment)
  const setAssignees = useReceiptStore((s) => s.setAssignees)
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
      />

      {roster.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card/40 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-accent" />
            Add people to start splitting
          </div>
          <AddPersonForm onAdd={addPerson} />
          <p className="text-xs text-muted-foreground">
            People are saved on your device for next time.
          </p>
        </div>
      ) : (
        <SplitSummary result={result} />
      )}

      {roster.length > 0 && <ServiceChargeCard people={roster} />}

      <div className="space-y-3">
        {items.map((item) => (
          <ItemAssignment
            key={item.id}
            item={item}
            people={roster}
            onToggle={(personId) => toggleAssignment(item.id, personId)}
            onToggleEveryone={() => {
              const everyone =
                roster.length > 0 &&
                roster.every((p) => item.assignedTo.includes(p.id))
              setAssignees(item.id, everyone ? [] : roster.map((p) => p.id))
            }}
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
