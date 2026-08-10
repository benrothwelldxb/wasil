import { cn } from '@/lib/cn'
import { EggMascot, type EggMood } from '@/components/brand/EggMascot'

/** Inline loading spinner (respects reduced-motion via CSS). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink',
        className,
      )}
    />
  )
}

/** Full-panel loading state. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-muted">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  )
}

interface EmptyStateProps {
  title: string
  body?: string
  mood?: EggMood
  action?: React.ReactNode
  className?: string
}

/** Warm empty state with a sparing mascot. */
export function EmptyState({ title, body, mood = 'sleepy', action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <EggMascot mood={mood} className="h-24 w-24" />
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {body && <p className="max-w-xs text-sm text-ink-muted">{body}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  body?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Something cracked',
  body = 'That didn’t work. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <EggMascot mood="default" className="h-20 w-20" />
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="max-w-xs text-sm text-ink-muted">{body}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-semibold text-lilac-deep underline">
          Try again
        </button>
      )}
    </div>
  )
}

/** Small uppercase section label, e.g. "YOUR SECRET BUDDY". */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted', className)}>
      {children}
    </p>
  )
}
