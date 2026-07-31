import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { formatCurrency } from '@/lib/format'
import type { ReceiptItem } from '@/types'

interface ItemRowProps {
  item: ReceiptItem
  currencySymbol?: string
  currency?: string
  autoFocus?: boolean
  onChange: (
    patch: Partial<Pick<ReceiptItem, 'label' | 'price' | 'quantity'>>,
  ) => void
  onRemove: () => void
}

/** Keep only digits and a single decimal point. */
function sanitizePrice(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length <= 1) return cleaned
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`
}

/**
 * A single editable receipt line: name, quantity and unit price, with a
 * remove control. Price is edited as free text (so partial input like "3."
 * is fine) and committed to the store as a number, formatted on blur.
 */
export function ItemRow({
  item,
  currencySymbol = '£',
  currency = 'GBP',
  autoFocus,
  onChange,
  onRemove,
}: ItemRowProps) {
  const [priceDraft, setPriceDraft] = useState(
    item.price ? item.price.toFixed(2) : '',
  )

  useEffect(() => {
    setPriceDraft(item.price ? item.price.toFixed(2) : '')
  }, [item.id, item.price])

  const quantity = item.quantity || 1
  const lineTotal = item.price * quantity

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-border bg-card p-2.5 shadow-soft"
    >
      <div className="flex items-center gap-2">
        <Input
          aria-label="Item name"
          placeholder="Item name"
          value={item.label}
          autoFocus={autoFocus}
          onChange={(e) => onChange({ label: e.target.value })}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <button
          type="button"
          aria-label={`Remove ${item.label || 'item'}`}
          onClick={onRemove}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 pl-1">
        <QuantityStepper
          value={quantity}
          min={1}
          size="sm"
          label="item"
          onChange={(q) => onChange({ quantity: q })}
        />

        <div className="flex items-center gap-2">
          {quantity > 1 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              = {formatCurrency(lineTotal, currency)}
            </span>
          )}
          <div className="relative w-24">
            <span
              className={cn(
                'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm',
                priceDraft ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {currencySymbol}
            </span>
            <Input
              aria-label={quantity > 1 ? 'Unit price' : 'Price'}
              inputMode="decimal"
              placeholder="0.00"
              value={priceDraft}
              onChange={(e) => {
                const next = sanitizePrice(e.target.value)
                setPriceDraft(next)
                onChange({ price: next ? parseFloat(next) || 0 : 0 })
              }}
              onBlur={() => {
                if (priceDraft)
                  setPriceDraft((parseFloat(priceDraft) || 0).toFixed(2))
              }}
              className="h-9 pl-7 text-right tabular-nums"
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
