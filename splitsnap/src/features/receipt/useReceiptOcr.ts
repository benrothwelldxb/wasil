import { useCallback, useRef, useState } from 'react'

import { useReceiptStore } from '@/features/receipt/receiptStore'
import { detectCurrency } from '@/lib/currency'
import {
  parseReceiptItems,
  parseServiceCharge,
  runOcr,
  toReceiptItems,
  type OcrProgress,
} from '@/features/receipt/ocr'

export type OcrStatus = 'idle' | 'running' | 'done' | 'error'

/** Map Tesseract's internal status strings to human-friendly copy. */
function friendlyStatus(status: string): string {
  if (status.includes('loading') && status.includes('core'))
    return 'Warming up the scanner…'
  if (status.includes('traineddata')) return 'Loading language…'
  if (status.includes('initializing')) return 'Getting ready…'
  if (status.includes('recognizing')) return 'Reading your receipt…'
  return 'Processing…'
}

/**
 * Runs OCR over the current receipt image, exposing live progress and writing
 * the parsed line items into the shared store. The heavy lifting lives in
 * ocr.ts; this hook is the React-facing glue.
 */
export function useReceiptOcr() {
  const [status, setStatus] = useState<OcrStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('Preparing…')
  const [foundCount, setFoundCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runningRef = useRef(false)

  const setItems = useReceiptStore((s) => s.setItems)
  const setServiceChargeAmount = useReceiptStore(
    (s) => s.setServiceChargeAmount,
  )
  const setCurrency = useReceiptStore((s) => s.setCurrency)

  const run = useCallback(async () => {
    const image = useReceiptStore.getState().image
    if (!image || runningRef.current) return
    runningRef.current = true

    setStatus('running')
    setProgress(0)
    setLabel('Preparing…')
    setError(null)
    setFoundCount(null)

    try {
      const text = await runOcr(image, (p: OcrProgress) => {
        setLabel(friendlyStatus(p.status))
        setProgress(p.progress)
      })
      const items = toReceiptItems(parseReceiptItems(text))
      setItems(items)
      // Detect a service charge so the Split step can offer to divide it.
      setServiceChargeAmount(parseServiceCharge(text) ?? 0)
      // Detect the currency, falling back to the remembered default.
      const detected = detectCurrency(text)
      if (detected) setCurrency(detected)
      setFoundCount(items.length)
      setProgress(1)
      setStatus('done')
    } catch (err) {
      console.error('OCR failed', err)
      setError(
        "We couldn't read that receipt automatically. You can add the items yourself.",
      )
      setStatus('error')
    } finally {
      runningRef.current = false
    }
  }, [setItems, setServiceChargeAmount, setCurrency])

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(0)
    setError(null)
    setFoundCount(null)
  }, [])

  return { status, progress, label, foundCount, error, run, reset }
}
