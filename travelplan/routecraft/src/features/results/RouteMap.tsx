import { useId, useMemo } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { Plane } from 'lucide-react';
import type { Journey } from '@/domain/types';
import { routeNodes } from '@/domain/journey';
import { getCity } from '@/data/datasets/cities';
import { cn } from '@/lib/utils';
import { MOTION } from '@/lib/motion';

const VIEW_W = 320;
const VIEW_H = 180;

/** Content fills roughly this fraction of the viewBox on each axis; the rest is padding. */
const FILL_FRACTION = 0.7;

const GRID_ROWS = [0.25, 0.5, 0.75].map((f) => VIEW_H * f);
const GRID_COLS = [0.2, 0.4, 0.6, 0.8].map((f) => VIEW_W * f);

type RoutePointKind = 'origin' | 'stopover' | 'destination';

interface RoutePoint {
  iata: string;
  kind: RoutePointKind;
  x: number;
  y: number;
}

interface UnplottedPoint {
  iata: string;
  kind: RoutePointKind;
  lon: number;
  lat: number;
}

/** Equirectangular projection into unit space: x,y ∈ [0, 1]. */
function projectUnit(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon + 180) / 360, y: (90 - lat) / 180 };
}

/** Ordered origin → stopovers → destination airports, resolved against the city dataset. */
function resolvePoints(journey: Journey): UnplottedPoint[] {
  const resolved: UnplottedPoint[] = [];
  for (const { iata, kind } of routeNodes(journey)) {
    const city = getCity(iata);
    if (!city) continue; // unresolved airports are skipped; the rest still renders
    resolved.push({ iata, kind, lat: city.lat, lon: city.lon });
  }
  return resolved;
}

/**
 * Fits resolved points into the SVG viewBox: computes their bounding box,
 * then scales/translates so the route occupies ~`FILL_FRACTION` of the box,
 * centred. Falls back to a stable scale of 1 when the box has zero span on
 * both axes (a single point) to avoid dividing by zero.
 */
function fitPoints(points: UnplottedPoint[]): RoutePoint[] {
  if (points.length === 0) return [];

  const projected = points.map((p) => ({ ...p, ...projectUnit(p.lat, p.lon) }));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const targetW = VIEW_W * FILL_FRACTION;
  const targetH = VIEW_H * FILL_FRACTION;

  const scaleX = spanX > 1e-9 ? targetW / spanX : Infinity;
  const scaleY = spanY > 1e-9 ? targetH / spanY : Infinity;
  const rawScale = Math.min(scaleX, scaleY);
  const scale = Number.isFinite(rawScale) ? rawScale : 1;

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return projected.map((p) => ({
    iata: p.iata,
    kind: p.kind,
    x: VIEW_W / 2 + (p.x - midX) * scale,
    y: VIEW_H / 2 + (p.y - midY) * scale,
  }));
}

/** A gently bowed path (quadratic curves, control points nudged upward) through the points. */
function buildPathD(points: RoutePoint[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const midX = (prev.x + cur.x) / 2;
    const midY = (prev.y + cur.y) / 2;
    const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const bow = Math.min(20, dist * 0.25);
    d += ` Q ${midX} ${midY - bow} ${cur.x} ${cur.y}`;
  }
  return d;
}

/**
 * Abstract, theme-aware mini-map of a journey's route: origin, stopovers and
 * destination plotted on a soft equirectangular backdrop and joined by a
 * gently curved path. Self-contained inline SVG — no map tiles or libraries.
 */
export function RouteMap({ journey, className }: { journey: Journey; className?: string }) {
  const reduce = useReducedMotion();
  const gradientId = useId();

  const points = useMemo(() => fitPoints(resolvePoints(journey)), [journey]);
  const pathD = useMemo(() => buildPathD(points), [points]);

  const label =
    points.length > 0 ? `Route map: ${points.map((p) => p.iata).join(' to ')}` : 'Route map';

  const destination = points[points.length - 1];
  const beforeDestination = points[points.length - 2];
  let planeRotation = 45;
  if (destination && beforeDestination) {
    const angle = Math.atan2(
      destination.y - beforeDestination.y,
      destination.x - beforeDestination.x,
    );
    planeRotation = (angle * 180) / Math.PI - 45;
  }

  return (
    <div className={cn('w-full aspect-[16/9] overflow-hidden rounded-t-xl', className)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id={`${gradientId}-backdrop`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.16" />
            <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.14" />
          </linearGradient>
        </defs>

        <rect width={VIEW_W} height={VIEW_H} fill={`url(#${gradientId}-backdrop)`} />

        <g stroke="hsl(var(--foreground))" strokeOpacity="0.06" strokeWidth="1" aria-hidden="true">
          {GRID_ROWS.map((y) => (
            <line key={`row-${y}`} x1={0} y1={y} x2={VIEW_W} y2={y} />
          ))}
          {GRID_COLS.map((x) => (
            <line key={`col-${x}`} x1={x} y1={0} x2={x} y2={VIEW_H} />
          ))}
        </g>

        {pathD && (
          <m.path
            d={pathD}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeDasharray="5 4"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduce ? 0 : MOTION.slow, ease: MOTION.ease }}
          />
        )}

        {points.map((p, i) => (
          <m.g
            key={`${p.iata}-${i}`}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduce ? 0 : 0.5,
              ease: MOTION.ease,
              delay: reduce ? 0 : 0.15 + i * 0.08,
            }}
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
          >
            {p.kind !== 'stopover' && (
              <circle cx={p.x} cy={p.y} r={7} fill="hsl(var(--primary))" fillOpacity={0.15} />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={p.kind === 'stopover' ? 2.75 : 3.5}
              fill={p.kind === 'stopover' ? 'hsl(var(--accent))' : 'hsl(var(--primary))'}
              stroke="hsl(var(--background))"
              strokeWidth={1}
            />
            {p.kind !== 'stopover' && (
              <text
                x={p.x}
                y={p.kind === 'origin' ? p.y + 13 : p.y - 9}
                textAnchor="middle"
                fontSize={8}
                fontWeight={600}
                className="fill-foreground/80 [stroke:hsl(var(--background))]"
                strokeWidth={2.5}
                style={{ paintOrder: 'stroke' }}
              >
                {p.iata}
              </text>
            )}
          </m.g>
        ))}

        {destination && beforeDestination && (
          <Plane
            x={destination.x - 6}
            y={destination.y - 15}
            width={12}
            height={12}
            aria-hidden="true"
            className="text-primary"
            style={{
              transform: `rotate(${planeRotation}deg)`,
              transformOrigin: `${destination.x}px ${destination.y}px`,
            }}
          />
        )}
      </svg>
    </div>
  );
}
