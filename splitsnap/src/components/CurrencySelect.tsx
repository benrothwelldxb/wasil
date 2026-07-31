import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  SUPPORTED_CURRENCIES,
  currencyMeta,
  isCurrencyCode,
  type CurrencyCode,
} from '@/lib/currency'

interface CurrencySelectProps {
  value: CurrencyCode
  onChange: (currency: CurrencyCode) => void
  /** 'compact' shows just the symbol + code; 'full' shows the name too. */
  variant?: 'compact' | 'full'
  className?: string
}

/**
 * Currency picker built on a native <select> — this gives a proper native
 * wheel picker on mobile while staying fully styled and accessible.
 */
export function CurrencySelect({
  value,
  onChange,
  variant = 'compact',
  className,
}: CurrencySelectProps) {
  const meta = currencyMeta(value)

  return (
    <div className={cn('relative inline-flex', className)}>
      <select
        aria-label="Currency"
        value={value}
        onChange={(e) => {
          if (isCurrencyCode(e.target.value)) onChange(e.target.value)
        }}
        className={cn(
          'peer appearance-none rounded-xl border border-border bg-background font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          variant === 'compact'
            ? 'h-9 py-1 pl-3 pr-8 text-sm'
            : 'h-11 w-full py-2 pl-3.5 pr-10',
        )}
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {variant === 'full'
              ? `${c.symbol}  ${c.code} · ${c.name}`
              : `${c.symbol} ${c.code}`}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          variant === 'compact' ? 'right-2.5 h-4 w-4' : 'right-3 h-4 w-4',
        )}
      />
      {/* Screen-reader hint of the current selection symbol. */}
      <span className="sr-only">{meta.name}</span>
    </div>
  )
}
