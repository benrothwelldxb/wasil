import { cn } from '@/lib/utils';

/**
 * A minimal, decorative sparkline for insight cards. Values are 0–1 normalised.
 * Purely illustrative in Phase 0 (no axes, no real analysis).
 */
export function Sparkline({
  values,
  className,
  strokeClass = 'stroke-primary',
}: {
  values: number[];
  className?: string;
  strokeClass?: string;
}) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 32;
  const pad = 2;
  const step = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - Math.max(0, Math.min(1, v))) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-8 w-full', className)}
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points.join(' ')}
        className={strokeClass}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
