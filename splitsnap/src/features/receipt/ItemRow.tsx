import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import type { ReceiptItem } from '@/types'

interface ItemRowProps {
  item: ReceiptItem
  currencySymbol?: string
  autoFocus?: boolean
  onChange: (patch: Partial<Pick<ReceiptItem, 'label' | 'price'>>) => void
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
 * A single editable receipt line: name + price, with a remove control.
 * Price is edited as free text (so partial input like "3." is fine) and
 * committed to the store as a number, formatted on blur.
 */
export function ItemRow({
  item,
  currencySymbol = '£',
  autoFocus,
  onChange,
  onRemove,
}: ItemRowProps) {
  const [priceDraft, setPriceDraft] = useState(
    item.price ? item.price.toFixed(2) : '',
  )

  // Keep the draft in sync when the item's price changes externally
  // (e.g. a fresh OCR pass replaces the items).
  useEffect(() => {
    setPriceDraft(item.price ? item.price.toFixed(2) : '')
  }, [item.id, item.price])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-soft"
    >
      <Input
        aria-label="Item name"
        placeholder="Item name"
        value={item.label}
        autoFocus={autoFocus}
        onChange={(e) => onChange({ label: e.target.value })}
        className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />

      <div className="relative w-28 shrink-0">
        <span
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm',
            priceDraft ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {currencySymbol}
        </span>
        <Input
          aria-label="Price"
          inputMode="decimal"
          placeholder="0.00"
          value={priceDraft}
          onChange={(e) => {
            const next = sanitizePrice(e.target.value)
            setPriceDraft(next)
            onChange({ price: next ? parseFloat(next) || 0 : 0 })
          }}
          onBlur={() => {
            if (priceDraft) setPriceDraft((parseFloat(priceDraft) || 0).toFixed(2))
          }}
          className="pl-7 text-right tabular-nums"
        />
      </div>

      <button
        type="button"
        aria-label={`Remove ${item.label || 'item'}`}
        onClick={onRemove}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  )
}
