import { cn } from '@/lib/utils';

/**
 * elowa's signature visual motif: the user's *usual range* shown as a subtle
 * band, with recent values plotted relative to it. Values above the band
 * (worse than usual) are marked distinctly. Higher = more of the symptom.
 *
 * Accessible: the chart is decorative (`aria-hidden`) and always paired with a
 * text summary supplied by the caller via `summary` for screen readers.
 */
export function BaselineBand({
  low,
  high,
  values,
  max = 4,
  summary,
  className,
}: {
  low: number;
  high: number;
  values: number[];
  max?: number;
  summary: string;
  className?: string;
}) {
  const w = 100;
  const h = 44;
  const pad = 4;
  const y = (v: number) => pad + (1 - v / max) * (h - pad * 2);
  const bandTop = y(Math.min(high, max));
  const bandBottom = y(Math.max(low, 0));

  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => ({ x: pad + i * step, y: y(v), worse: v > high + 1e-9 }));
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <figure className={cn('m-0', className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden="true">
        {/* usual-range band */}
        <rect
          x={0}
          y={bandTop}
          width={w}
          height={Math.max(1, bandBottom - bandTop)}
          className="fill-sage/30"
        />
        <line x1={0} x2={w} y1={bandTop} y2={bandTop} className="stroke-sage/60" strokeWidth={0.5} />
        <line x1={0} x2={w} y1={bandBottom} y2={bandBottom} className="stroke-sage/60" strokeWidth={0.5} />
        {/* recent values */}
        {values.length > 1 ? (
          <polyline
            points={line}
            fill="none"
            className="stroke-primary"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.worse ? 2.4 : 1.8}
            className={p.worse ? 'fill-coral' : 'fill-primary'}
          />
        ))}
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
