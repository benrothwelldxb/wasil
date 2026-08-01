import { cn } from "@/lib/utils";

export interface BrandMarkProps {
  className?: string;
}

/**
 * The MyFPLScout mark: a navy "squad grid" with the green scouted pick and an
 * arrow pointing to it. A self-contained tile (its own navy background), so it
 * reads on any theme. Sized via `className` (defaults to 2rem square).
 *
 * Kept in sync with `scripts/generate-icons.mjs`, which renders the PWA/favicon
 * PNGs from the same artwork.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("h-8 w-8", className)}
      role="img"
      aria-label="MyFPLScout"
    >
      <rect width="512" height="512" rx="112" fill="#14245c" />
      <defs>
        <radialGradient id="brand-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2fbf4c" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2fbf4c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="#8391c9">
        <circle cx="168" cy="164" r="20" />
        <circle cx="256" cy="164" r="20" />
        <circle cx="344" cy="164" r="20" />
        <circle cx="168" cy="240" r="20" />
        <circle cx="256" cy="240" r="20" />
        <circle cx="168" cy="316" r="20" />
        <circle cx="256" cy="316" r="20" />
        <circle cx="344" cy="316" r="20" />
        <circle cx="256" cy="392" r="20" />
      </g>
      <circle cx="344" cy="240" r="52" fill="url(#brand-glow)" />
      <circle cx="344" cy="240" r="23" fill="#2fbf4c" />
      <g
        stroke="#eef2ff"
        strokeWidth="17"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <line x1="226" y1="350" x2="306" y2="270" />
        <polyline points="284,270 306,270 306,292" />
      </g>
    </svg>
  );
}
