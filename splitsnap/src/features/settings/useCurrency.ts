import { useCallback } from 'react'

import { useReceiptStore } from '@/features/receipt/receiptStore'
import { useSettingsStore } from '@/features/settings/settingsStore'
import type { CurrencyCode } from '@/lib/currency'

/**
 * Currency for the current receipt, plus a setter that also remembers the
 * choice as the user's default for next time.
 */
export function useCurrency() {
  const currency = useReceiptStore((s) => s.currency)
  const defaultCurrency = useSettingsStore((s) => s.defaultCurrency)
  const setReceiptCurrency = useReceiptStore((s) => s.setCurrency)
  const setDefaultCurrency = useSettingsStore((s) => s.setDefaultCurrency)

  const setCurrency = useCallback(
    (next: CurrencyCode) => {
      setReceiptCurrency(next)
      setDefaultCurrency(next)
    },
    [setReceiptCurrency, setDefaultCurrency],
  )

  return { currency, defaultCurrency, setCurrency }
}
