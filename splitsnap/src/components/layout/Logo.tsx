import { cn } from '@/lib/utils'

/** SplitSnap wordmark with a small receipt-scan glyph. */
export function Logo({
  className,
  showText = true,
}: {
  className?: string
  showText?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-accent-foreground shadow-soft">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14.6a.4.4 0 0 1-.62.33L16 18.4l-2.1 1.4a.75.75 0 0 1-.83 0L11 18.4l-1.9 1.27a.75.75 0 0 1-.83 0L6.12 18.4l-.62.42A.4.4 0 0 1 5.5 18.5V5A1.5 1.5 0 0 1 7 3.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M9 8h6M9 11.5h6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {showText && (
        <span className="text-lg font-semibold tracking-tight">
          Split<span className="text-accent">Snap</span>
        </span>
      )}
    </div>
  )
}
