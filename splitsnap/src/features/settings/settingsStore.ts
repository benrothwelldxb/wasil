import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DEFAULT_CURRENCY, type CurrencyCode } from '@/lib/currency'

interface SettingsState {
  /** The user's preferred currency, remembered across sessions. */
  defaultCurrency: CurrencyCode
  setDefaultCurrency: (currency: CurrencyCode) => void
}

/**
 * Small persisted preferences store (localStorage). Currently just the default
 * currency; the theme has its own persistence.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultCurrency: DEFAULT_CURRENCY,
      setDefaultCurrency: (defaultCurrency) => set({ defaultCurrency }),
    }),
    { name: 'myreceiptsplit-settings' },
  ),
)
