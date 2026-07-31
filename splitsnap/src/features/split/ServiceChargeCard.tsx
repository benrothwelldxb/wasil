import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { currencySymbol, type CurrencyCode } from '@/lib/currency'
import { PersonChip } from '@/features/split/PersonChip'
import { useReceiptStore } from '@/features/receipt'
import type { Person, ServiceChargeMode } from '@/types'

const MODES: { value: ServiceChargeMode; label: string; hint: string }[] = [
  { value: 'equal', label: 'Equally', hint: 'Divided evenly between everyone.' },
  {
    value: 'proportional',
    label: 'Proportionally',
    hint: 'In proportion to what each person spent.',
  },
  { value: 'manual', label: 'Manually', hint: 'Only the people you pick pay it.' },
]

function sanitize(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length <= 1) return cleaned
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`
}

interface ServiceChargeCardProps {
  people: Person[]
  currency?: CurrencyCode
}

/**
 * Detects (via OCR) and controls the service charge: edit the amount, choose
 * how it's split — equally, proportionally, or manually — and, for manual,
 * pick who pays. Totals recalculate instantly from the store.
 */
export function ServiceChargeCard({
  people,
  currency = 'GBP',
}: ServiceChargeCardProps) {
  const service = useReceiptStore((s) => s.serviceCharge)
  const setAmount = useReceiptStore((s) => s.setServiceChargeAmount)
  const setMode = useReceiptStore((s) => s.setServiceChargeMode)
  const toggleAssignee = useReceiptStore((s) => s.toggleServiceChargeAssignee)

  const [draft, setDraft] = useState(
    service.amount ? service.amount.toFixed(2) : '',
  )
  const [expanded, setExpanded] = useState(service.amount > 0)

  // Sync when OCR (or a rescan) sets the detected amount.
  useEffect(() => {
    setDraft(service.amount ? service.amount.toFixed(2) : '')
    if (service.amount > 0) setExpanded(true)
  }, [service.amount])

  const hasCharge = service.amount > 0
  const activeHint = MODES.find((m) => m.value === service.mode)?.hint

  if (!hasCharge && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
      >
        <Plus className="h-4 w-4" />
        Add a service charge
      </button>
    )
  }

  return (
    <div
      data-testid="service-charge"
      className="rounded-2xl border border-border bg-card p-4 shadow-soft"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-strong" />
          <p className="font-medium">Service charge</p>
        </div>
        <div className="relative w-28">
          <span
            className={cn(
              'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm',
              draft ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {currencySymbol(currency)}
          </span>
          <Input
            aria-label="Service charge amount"
            inputMode="decimal"
            placeholder="0.00"
            value={draft}
            onChange={(e) => {
              const next = sanitize(e.target.value)
              setDraft(next)
              setAmount(next ? parseFloat(next) || 0 : 0)
            }}
            onBlur={() =>
              draft && setDraft((parseFloat(draft) || 0).toFixed(2))
            }
            className="pl-7 text-right tabular-nums"
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {hasCharge && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
                {MODES.map((m) => {
                  const active = service.mode === m.value
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMode(m.value)}
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
                          layoutId="service-mode-pill"
                          className="absolute inset-0 rounded-lg bg-background shadow-soft"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="relative">{m.label}</span>
                    </button>
                  )
                })}
              </div>

              <p className="mt-2 text-xs text-muted-foreground">{activeHint}</p>

              {service.mode === 'manual' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {people.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Add people to assign the service charge.
                    </p>
                  ) : (
                    people.map((person) => (
                      <PersonChip
                        key={person.id}
                        person={person}
                        selected={service.assignedTo.includes(person.id)}
                        onToggle={() => toggleAssignee(person.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
