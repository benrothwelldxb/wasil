import { cn } from '@/lib/utils'

/**
 * MyReceiptSplit brand lockup: the app icon plus a theme-aware wordmark
 * ("My" in the brand green, "Receipt Split" in the foreground colour). The
 * wordmark is rebuilt in markup rather than using the flat PNG so it reads
 * correctly in both light and dark mode.
 */
export function Logo({
  className,
  showText = true,
}: {
  className?: string
  showText?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src="/icons/icon-192.png"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 rounded-xl bg-white object-contain shadow-soft ring-1 ring-border/60"
      />
      {showText && (
        <span className="whitespace-nowrap text-lg font-semibold tracking-tight">
          <span className="text-accent-strong">My</span> Receipt Split
        </span>
      )}
    </div>
  )
}
