import { Monitor, Moon, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { useTheme, type Theme } from '@/components/theme/ThemeProvider'

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <PageHeader title="Settings" description="Make SplitSnap yours." />

      <Card>
        <CardContent className="p-5">
          <p className="text-sm font-medium">Appearance</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Choose how SplitSnap looks.
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
        SplitSnap runs entirely on your device. No account, no cloud.
      </p>
    </div>
  )
}
