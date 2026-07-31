import { Logo } from '@/components/layout/Logo'

/** Lightweight loading state shown while a lazy route chunk loads. */
export function RouteFallback() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <Logo showText={false} className="animate-pulse" />
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
