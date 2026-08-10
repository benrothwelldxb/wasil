import { cn } from '@/lib/cn'

export type EggMood = 'default' | 'happy' | 'peek' | 'wave' | 'sleepy' | 'love'

interface EggMascotProps {
  mood?: EggMood
  className?: string
  /** Decorative by default; pass a title to announce it to screen readers. */
  title?: string
}

/**
 * The Good Egg mascot. Used sparingly — onboarding, waiting, reveal, empty and
 * success states. A friendly white egg with a black outline, per the brand art.
 */
export function EggMascot({ mood = 'default', className, title }: EggMascotProps) {
  const decorative = !title
  return (
    <svg
      viewBox="0 0 120 140"
      className={cn('select-none', className)}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {/* soft ground shadow */}
      <ellipse cx="60" cy="131" rx="30" ry="5" fill="#1B1915" opacity="0.08" />
      {/* egg body */}
      <path
        d="M60 8 C34 8 16 52 16 82 C16 111 35 130 60 130 C85 130 104 111 104 82 C104 52 86 8 60 8 Z"
        fill="#FCFAF4"
        stroke="#1B1915"
        strokeWidth="4"
      />
      {/* eyes */}
      {mood === 'sleepy' ? (
        <>
          <path d="M44 78 q7 6 14 0" fill="none" stroke="#1B1915" strokeWidth="4" strokeLinecap="round" />
          <path d="M62 78 q7 6 14 0" fill="none" stroke="#1B1915" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="49" cy="76" rx="5.5" ry="7" fill="#1B1915" />
          <ellipse cx="71" cy="76" rx="5.5" ry="7" fill="#1B1915" />
          <circle cx="50.6" cy="73.4" r="1.7" fill="#fff" />
          <circle cx="72.6" cy="73.4" r="1.7" fill="#fff" />
        </>
      )}
      {/* mouth */}
      {mood === 'happy' || mood === 'love' || mood === 'wave' ? (
        <path d="M52 90 q8 8 16 0" fill="none" stroke="#1B1915" strokeWidth="3.5" strokeLinecap="round" />
      ) : mood === 'peek' ? (
        <circle cx="60" cy="90" r="3" fill="#1B1915" />
      ) : (
        <path d="M54 90 q6 4 12 0" fill="none" stroke="#1B1915" strokeWidth="3.2" strokeLinecap="round" />
      )}
      {/* cheek heart for the "love" mood */}
      {mood === 'love' ? (
        <path
          d="M83 86 c-2-2.4-6-1.4-6 1.6 0 2.4 3.2 4.4 6 6.4 2.8-2 6-4 6-6.4 0-3-4-4-6-1.6Z"
          fill="#F0674F"
        />
      ) : (
        <circle cx="84" cy="90" r="4.5" fill="#F7A491" opacity="0.7" />
      )}
      <circle cx="36" cy="90" r="4.5" fill="#F7A491" opacity="0.7" />
      {/* little wave arm */}
      {mood === 'wave' ? (
        <path
          d="M104 78 q14-4 16-16"
          fill="none"
          stroke="#1B1915"
          strokeWidth="4"
          strokeLinecap="round"
          className="origin-bottom-left motion-safe:animate-egg-wobble"
        />
      ) : null}
      {/* mischief sparkle */}
      {mood === 'peek' || mood === 'happy' ? (
        <g stroke="#F0674F" strokeWidth="3" strokeLinecap="round">
          <line x1="18" y1="34" x2="10" y2="28" />
          <line x1="22" y1="26" x2="18" y2="16" />
          <line x1="30" y1="22" x2="30" y2="12" />
        </g>
      ) : null}
    </svg>
  )
}
