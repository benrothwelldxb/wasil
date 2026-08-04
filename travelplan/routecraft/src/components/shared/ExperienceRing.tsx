import { useEffect, useRef } from 'react';
import { animate, m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MOTION } from '@/lib/motion';

interface ExperienceRingProps {
  score: number; // 0–100
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/** Ring STROKE colour band — not readable-text-safe, see `bandTextColor`. */
function bandColor(score: number): string {
  if (score >= 80) return 'hsl(var(--score-high))';
  if (score >= 60) return 'hsl(var(--score-mid))';
  return 'hsl(var(--score-low))';
}

/**
 * Centre-label TEXT colour band. `--score-high/-mid/-low` are tuned for use
 * as a ring *stroke* against the page background and fail WCAG AA as small
 * text in the light theme; the `-text` tokens are the same hues darkened to
 * clear 4.5:1 as text. Keep `bandColor` for the stroke and this for the
 * number.
 */
function bandTextColor(score: number): string {
  if (score >= 80) return 'hsl(var(--score-high-text))';
  if (score >= 60) return 'hsl(var(--score-mid-text))';
  return 'hsl(var(--score-low-text))';
}

/** Animated circular Journey Score dial with a count-up centre label. */
export function ExperienceRing({
  score,
  size = 68,
  strokeWidth = 6,
  className,
}: ExperienceRingProps) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const strokeColor = bandColor(clamped);
  const textColor = bandTextColor(clamped);

  // Count-up writes straight to the DOM text node via Framer's `animate()`
  // rather than `useState` + `requestAnimationFrame` — up to ~14 of these
  // render at once on the results grid, and a `setState` on every frame of
  // every ring is a real INP risk. `animate()` drives its own rAF loop and
  // the `onUpdate` callback here never touches React state, so none of that
  // work triggers a re-render.
  const displayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = displayRef.current;
    if (!node) return;

    if (reduce) {
      node.textContent = String(clamped);
      return;
    }

    node.textContent = '0';
    const controls = animate(0, clamped, {
      duration: MOTION.emphasis,
      ease: MOTION.ease,
      onUpdate: (value) => {
        node.textContent = String(Math.round(value));
      },
    });
    return () => controls.stop();
  }, [clamped, reduce]);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Journey score ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={strokeColor}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduce ? offset : circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : MOTION.emphasis, ease: MOTION.ease }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span
          ref={displayRef}
          className="text-lg font-semibold tabular-nums"
          style={{ color: textColor }}
        >
          {reduce ? clamped : 0}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">score</span>
      </div>
    </div>
  );
}
