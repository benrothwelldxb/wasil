import { cn } from '@/lib/cn'

interface ChipProps {
  label: string
  selected?: boolean
  onToggle?: () => void
  /** Render as a static tag (no button semantics). */
  as?: 'button' | 'span'
  onRemove?: () => void
  className?: string
}

/** Selectable pill used across the buddy profile and idea filters. */
export function Chip({ label, selected, onToggle, as = 'button', onRemove, className }: ChipProps) {
  const classes = cn(
    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
    selected
      ? 'bg-ink text-cream-50'
      : 'bg-cream-200 text-ink-soft hover:bg-cream-300',
    className,
  )
  if (as === 'span') {
    return (
      <span className={classes}>
        {label}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="ml-0.5 rounded-full text-current/70 hover:text-current"
          >
            ×
          </button>
        )}
      </span>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={classes}
    >
      {label}
    </button>
  )
}

interface BadgeProps {
  children: React.ReactNode
  tone?: 'ink' | 'sage' | 'lilac' | 'yolk' | 'coral'
  className?: string
  icon?: React.ReactNode
}

const badgeTones = {
  ink: 'bg-cream-300 text-ink-soft',
  sage: 'bg-sage-tint text-sage-deep',
  lilac: 'bg-lilac-tint text-lilac-deep',
  yolk: 'bg-yolk-tint text-yolk-deep',
  coral: 'bg-coral-tint text-coral-deep',
}

export function Badge({ children, tone = 'ink', className, icon }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide',
        badgeTones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
