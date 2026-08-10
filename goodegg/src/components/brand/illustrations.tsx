import { cn } from '@/lib/cn'

/** A friendly sealed envelope — used for surprise, invite and reveal states. */
export function EnvelopeArt({ className, hearts = true }: { className?: string; hearts?: boolean }) {
  return (
    <svg viewBox="0 0 160 130" className={cn('select-none', className)} aria-hidden>
      <ellipse cx="80" cy="121" rx="46" ry="6" fill="#1B1915" opacity="0.07" />
      <rect x="24" y="34" width="112" height="80" rx="12" fill="#FCFAF4" stroke="#1B1915" strokeWidth="4" />
      <path d="M26 40 L80 82 L134 40" fill="none" stroke="#1B1915" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {hearts && (
        <path
          d="M80 60 c-4-5-12-2.6-12 3.2 0 4.4 6.4 8.4 12 12.4 5.6-4 12-8 12-12.4 0-5.8-8-8.2-12-3.2Z"
          fill="#F0674F"
        />
      )}
    </svg>
  )
}

/** The October mission ghost with a BOO! flag. */
export function GhostArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 140" className={cn('select-none', className)} aria-hidden>
      <path
        d="M40 66 C40 36 62 20 80 20 C98 20 118 36 118 66 L118 118 C118 118 112 110 106 118 C100 126 94 118 94 118 C94 118 88 128 80 120 C74 114 68 124 62 118 C56 112 50 122 44 116 L40 112 Z"
        fill="#FCFAF4"
        stroke="#1B1915"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <ellipse cx="66" cy="60" rx="4" ry="5.5" fill="#1B1915" />
      <ellipse cx="90" cy="60" rx="4" ry="5.5" fill="#1B1915" />
      <path d="M72 74 q8 6 14 0" fill="none" stroke="#1B1915" strokeWidth="3" strokeLinecap="round" />
      {/* flag pole + BOO */}
      <line x1="112" y1="52" x2="128" y2="96" stroke="#1B1915" strokeWidth="3" strokeLinecap="round" />
      <rect x="112" y="40" width="34" height="22" rx="4" fill="#FBE3A0" stroke="#1B1915" strokeWidth="3" transform="rotate(-6 129 51)" />
      <text x="129" y="56" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1B1915" transform="rotate(-6 129 51)">BOO!</text>
      {/* sparkles */}
      <g stroke="#E8B22E" strokeWidth="3" strokeLinecap="round">
        <line x1="30" y1="40" x2="22" y2="34" />
        <line x1="26" y1="52" x2="16" y2="50" />
      </g>
    </svg>
  )
}

/** Confetti burst for celebratory moments (static; CSS handles motion prefs). */
export function ConfettiStrip({ className }: { className?: string }) {
  const bits = [
    { x: 8, c: '#F7C948', r: -20 },
    { x: 24, c: '#B79DDD', r: 12 },
    { x: 40, c: '#A9C9A4', r: -8 },
    { x: 56, c: '#F0674F', r: 24 },
    { x: 72, c: '#F6C9A8', r: -16 },
    { x: 88, c: '#F7C948', r: 8 },
  ]
  return (
    <svg viewBox="0 0 100 24" className={cn('w-full', className)} aria-hidden preserveAspectRatio="none">
      {bits.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={i % 2 ? 4 : 12}
          width="3.4"
          height="8"
          rx="1.4"
          fill={b.c}
          transform={`rotate(${b.r} ${b.x} 12)`}
        />
      ))}
    </svg>
  )
}
