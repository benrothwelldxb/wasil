import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ExperienceRingProps {
  score: number; // 0–100
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function bandColor(score: number): string {
  if (score >= 80) return 'hsl(var(--score-high))';
  if (score >= 60) return 'hsl(var(--score-mid))';
  return 'hsl(var(--score-low))';
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
  const color = bandColor(clamped);

  const [display, setDisplay] = useState(reduce ? clamped : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(clamped);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * clamped));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduce ? offset : circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-lg font-semibold tabular-nums" style={{ color }}>
          {display}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">score</span>
      </div>
    </div>
  );
}
