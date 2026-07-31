import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'
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

/** Discretionary tip presets, as a % of the items subtotal. */
const PRESETS = [10, 12.5, 15] as const

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
 * Detects (via OCR) and controls the service charge. Offer discretionary tip
 * presets (10% / 12.5% / 15%) computed from the subtotal, or a custom flat
 * amount, then choose how it's split — equally, proportionally, or manually.
 * Totals recalculate instantly from the store.
 */
export function ServiceChargeCard({
  people,
  currency = 'GBP',
}: ServiceChargeCardProps) {
  const service = useReceiptStore((s) => s.serviceCharge)
  const items = useReceiptStore((s) => s.items)
  const setAmount = useReceiptStore((s) => s.setServiceChargeAmount)
  const setPercent = useReceiptStore((s) => s.setServiceChargePercent)
  const setMode = useReceiptStore((s) => s.setServiceChargeMode)
  const toggleAssignee = useReceiptStore((s) => s.toggleServiceChargeAssignee)

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0,
  )

  const [showCustom, setShowCustom] = useState(false)

  const isPercent = service.percent != null
  const isCustom = showCustom || (!isPercent && service.amount > 0)
  const noneActive = !isPercent && !isCustom
  const effectiveAmount = isPercent
    ? Math.round(subtotal * (service.percent as number)) / 100
    : service.amount
  const hasCharge = effectiveAmount > 0

  const [draft, setDraft] = useState(
    !isPercent && service.amount > 0 ? service.amount.toFixed(2) : '',
  )

  // Keep the custom amount field in sync with OCR-detected charges.
  useEffect(() => {
    if (service.percent == null) {
      setDraft(service.amount ? service.amount.toFixed(2) : '')
    }
  }, [service.amount, service.percent])

  const activeHint = MODES.find((m) => m.value === service.mode)?.hint
  const presetActive = (p: number) => service.percent === p

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
        {hasCharge && (
          <p className="text-sm font-semibold tabular-nums">
            {formatCurrency(effectiveAmount, currency)}
          </p>
        )}
      </div>

      {/* Preset selector: None / 10% / 12.5% / 15% / Custom */}
      <div className="mt-3 flex flex-wrap gap-2">
        <PresetChip
          active={noneActive}
          onClick={() => {
            setShowCustom(false)
            setAmount(0)
          }}
        >
          None
        </PresetChip>
        {PRESETS.map((p) => (
          <PresetChip
            key={p}
            active={presetActive(p)}
            onClick={() => {
              setShowCustom(false)
              setPercent(p)
            }}
          >
            {p}%
          </PresetChip>
        ))}
        <PresetChip
          active={isCustom}
          onClick={() => {
            setShowCustom(true)
            if (isPercent) setPercent(null)
          }}
        >
          Custom
        </PresetChip>
      </div>

      {isPercent && (
        <p className="mt-2 text-xs text-muted-foreground">
          {service.percent}% of {formatCurrency(subtotal, currency)} subtotal ={' '}
          {formatCurrency(effectiveAmount, currency)}
        </p>
      )}

      {isCustom && (
        <div className="relative mt-3 w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground">
            {currencySymbol(currency)}
          </span>
          <Input
            aria-label="Service charge amount"
            inputMode="decimal"
            placeholder="0.00"
            autoFocus
            value={draft}
            onChange={(e) => {
              const next = sanitize(e.target.value)
              setDraft(next)
              setAmount(next ? parseFloat(next) || 0 : 0)
            }}
            onBlur={() => draft && setDraft((parseFloat(draft) || 0).toFixed(2))}
            className="pl-7 text-right tabular-nums"
          />
        </div>
      )}

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

function PresetChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-accent bg-accent text-accent-foreground shadow-soft'
          : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
