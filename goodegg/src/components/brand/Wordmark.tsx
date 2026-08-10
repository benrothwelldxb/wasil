import { cn } from '@/lib/cn'

/** The egg glyph that stands in for the second "O" in GOOD. */
function EggGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 56" className={cn('inline-block align-[-0.12em]', className)} aria-hidden>
      <path
        d="M22 3 C12 3 5 22 5 34 C5 46 13 53 22 53 C31 53 39 46 39 34 C39 22 32 3 22 3 Z"
        fill="#FCFAF4"
        stroke="#1B1915"
        strokeWidth="3"
      />
      <ellipse cx="17" cy="30" rx="2.4" ry="3.1" fill="#1B1915" />
      <ellipse cx="27" cy="30" rx="2.4" ry="3.1" fill="#1B1915" />
      <path
        d="M31 37 c-1.4-1.7-4.2-1-4.2 1.1 0 1.7 2.2 3.1 4.2 4.5 2-1.4 4.2-2.8 4.2-4.5 0-2.1-2.8-2.8-4.2-1.1Z"
        fill="#F0674F"
      />
    </svg>
  )
}

interface WordmarkProps {
  className?: string
  /** Overall scale via font-size utility on the wrapper, e.g. "text-3xl". */
  size?: string
  withAccents?: boolean
  title?: string
}

/**
 * "be a / GOOD EGG" wordmark. Recreated from the brand art: a bouncy script
 * "be a", a heavy display "GOOD EGG" with the egg as the second O, and coral +
 * lilac accent dashes. Rendered as live text so it stays crisp at any size.
 */
export function Wordmark({
  className,
  size = 'text-2xl',
  withAccents = true,
  title = 'Be a Good Egg',
}: WordmarkProps) {
  return (
    <span className={cn('relative inline-flex flex-col leading-none text-ink', size, className)} role="img" aria-label={title}>
      {/* coral dashes, top-left */}
      {withAccents && (
        <span aria-hidden className="pointer-events-none absolute -left-3 -top-2 text-coral">
          <svg width="20" height="18" viewBox="0 0 20 18" fill="none">
            <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="12" y1="2" x2="6" y2="8" />
              <line x1="16" y1="7" x2="9" y2="11" />
              <line x1="17" y1="13" x2="10" y2="15" />
            </g>
          </svg>
        </span>
      )}
      <span className="font-display italic font-semibold text-[0.5em] tracking-tight pl-1">
        be a
      </span>
      <span className="font-sans font-black tracking-[-0.03em] -mt-[0.08em] flex items-center">
        <span>GO</span>
        <EggGlyph className="mx-[0.02em] h-[0.92em] w-auto" />
        <span>D</span>
      </span>
      <span className="relative font-sans font-black tracking-[-0.02em] -mt-[0.12em]">
        EGG
        {/* coral underline */}
        <span aria-hidden className="absolute -bottom-[0.12em] left-0 h-[0.12em] w-full">
          <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-full w-full text-coral">
            <path d="M2 5 C25 2 55 2 98 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        {/* lilac dashes, bottom-right */}
        {withAccents && (
          <span aria-hidden className="absolute -right-4 top-1 text-lilac-deep">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="4" y1="4" x2="10" y2="9" />
                <line x1="2" y1="10" x2="9" y2="12" />
              </g>
            </svg>
          </span>
        )}
      </span>
    </span>
  )
}

/** Single-line compact lockup for tight spaces (e.g. nav bars, buttons). */
export function WordmarkInline({ className, title = 'Be a Good Egg' }: { className?: string; title?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-sans font-black tracking-tight text-ink', className)} role="img" aria-label={title}>
      <span className="font-display italic font-semibold text-[0.7em]">be a</span>
      <span className="flex items-center">
        GO
        <EggGlyph className="mx-px h-[0.85em] w-auto" />
        D&nbsp;EGG
      </span>
    </span>
  )
}
