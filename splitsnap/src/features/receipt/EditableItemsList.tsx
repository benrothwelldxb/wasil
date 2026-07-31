import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import { currencySymbol, type CurrencyCode } from '@/lib/currency'
import { useReceiptStore } from '@/features/receipt/receiptStore'
import { ItemRow } from '@/features/receipt/ItemRow'

/**
 * Editable list of receipt line items backed by the store, with add/remove
 * and a running items subtotal (bill totals/tax are intentionally ignored
 * for now).
 */
export function EditableItemsList({
  currency = 'GBP',
}: {
  currency?: CurrencyCode
}) {
  const items = useReceiptStore((s) => s.items)
  const addItem = useReceiptStore((s) => s.addItem)
  const updateItem = useReceiptStore((s) => s.updateItem)
  const removeItem = useReceiptStore((s) => s.removeItem)
  const lastAddedId = useRef<string | null>(null)

  const itemsTotal = items.reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0,
  )

  const handleAdd = () => {
    lastAddedId.current = addItem()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              currencySymbol={currencySymbol(currency)}
              autoFocus={item.id === lastAddedId.current}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      <Button
        variant="outline"
        className="w-full border-dashed"
        onClick={handleAdd}
      >
        <Plus />
        Add item
      </Button>

      {items.length > 0 && (
        <motion.div
          layout
          className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3"
        >
          <span className="text-sm font-medium text-muted-foreground">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
          <span className="text-base font-semibold tabular-nums">
            {formatCurrency(itemsTotal, currency)}
          </span>
        </motion.div>
      )}
    </div>
  )
}
