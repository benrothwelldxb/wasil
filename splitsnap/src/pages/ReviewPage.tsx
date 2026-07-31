import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import {
  EditableItemsList,
  OcrProgress,
  useReceiptOcr,
  useReceiptStore,
} from '@/features/receipt'
import { useCurrency } from '@/features/settings'
import { CurrencySelect } from '@/components/CurrencySelect'

export function ReviewPage() {
  const navigate = useNavigate()
  const image = useReceiptStore((s) => s.image)
  const items = useReceiptStore((s) => s.items)
  const addItem = useReceiptStore((s) => s.addItem)
  const { currency, setCurrency } = useCurrency()
  const { status, progress, label, foundCount, error, run } = useReceiptOcr()

  // Kick off OCR automatically the first time we land here with a fresh image.
  useEffect(() => {
    if (image && status === 'idle' && items.length === 0) {
      void run()
    }
  }, [image, status, items.length, run])

  if (!image) {
    return (
      <div>
        <PageHeader
          title="Review"
          description="Check and tidy up the receipt items."
        />
        <EmptyState
          icon={Camera}
          title="Nothing to review yet"
          description="Scan a receipt first and its items will show up here."
          action={
            <Button asChild>
              <Link to="/scan">
                <Camera />
                Scan a receipt
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  const isRunning = status === 'running'
  const showEditor = status === 'done' || status === 'error'

  return (
    <div>
      <PageHeader
        title="Review"
        description="Check the items and fix anything OCR got wrong."
        action={
          showEditor ? (
            <div className="flex items-center gap-2">
              <CurrencySelect value={currency} onChange={setCurrency} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => run()}
                className="text-muted-foreground"
              >
                <RefreshCw />
                Rescan
              </Button>
            </div>
          ) : undefined
        }
      />

      <AnimatePresence mode="wait">
        {isRunning && (
          <motion.div
            key="progress"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <OcrProgress
              progress={progress}
              label={label}
              imageUrl={image.url}
            />
          </motion.div>
        )}

        {showEditor && (
          <motion.div
            key="editor"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {status === 'done' && foundCount !== null && (
              <div className="flex items-center gap-2 rounded-2xl bg-accent/10 px-4 py-3 text-sm font-medium text-accent-strong">
                <Sparkles className="h-4 w-4" />
                {foundCount > 0
                  ? `Found ${foundCount} ${foundCount === 1 ? 'item' : 'items'}. Tap to edit.`
                  : 'No items detected — add them below.'}
              </div>
            )}

            {status === 'error' && (
              <div className="flex items-start gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <EditableItemsList currency={currency} />

            <Button
              size="lg"
              className="w-full"
              disabled={items.length === 0}
              onClick={() => {
                if (items.length === 0) addItem()
                else navigate('/split')
              }}
            >
              Continue to split
              <ArrowRight />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
