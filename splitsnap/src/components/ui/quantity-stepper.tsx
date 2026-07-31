import { Minus, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Accessible label prefix, e.g. "Ann's" -> "Decrease Ann's quantity". */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

/** Reusable −/＋ counter used for item quantities and per-person counts. */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  label,
  size = 'md',
  className,
}: QuantityStepperProps) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))
  const btn =
    size === 'sm'
      ? 'h-7 w-7'
      : 'h-9 w-9'
  const prefix = label ? `${label} ` : ''

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl border border-border bg-background',
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Decrease ${prefix}quantity`}
        onClick={dec}
        disabled={value <= min}
        className={cn(
          'grid place-items-center rounded-l-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent',
          btn,
        )}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className={cn(
          'min-w-7 text-center text-sm font-semibold tabular-nums',
          size === 'sm' && 'min-w-6',
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${prefix}quantity`}
        onClick={inc}
        disabled={value >= max}
        className={cn(
          'grid place-items-center rounded-r-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent',
          btn,
        )}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
