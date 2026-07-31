import { Monitor, Moon, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { CurrencySelect } from '@/components/CurrencySelect'
import { useTheme, type Theme } from '@/components/theme/ThemeProvider'
import { PeopleManager } from '@/features/people'
import { useCurrency } from '@/features/settings'

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { defaultCurrency, setCurrency } = useCurrency()

  return (
    <div>
      <PageHeader title="Settings" description="Make MyReceiptSplit yours." />

      <Card className="mb-4">
        <CardContent className="p-5">
          <p className="text-sm font-medium">Default currency</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Used for new receipts. OCR can still auto-detect a different
            currency from the receipt.
          </p>
          <CurrencySelect
            value={defaultCurrency}
            onChange={setCurrency}
            variant="full"
            className="w-full"
          />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-5">
          <p className="text-sm font-medium">People</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Save the people you split with. Remembered on this device for
            faster splitting.
          </p>
          <PeopleManager />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <p className="text-sm font-medium">Appearance</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Choose how MyReceiptSplit looks.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map((option) => {
              const active = theme === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors',
                    active
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-secondary',
                  )}
                  aria-pressed={active}
                >
                  <option.icon className="h-5 w-5" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        MyReceiptSplit runs entirely on your device. No account, no cloud.
      </p>
    </div>
  )
}
