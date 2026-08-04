import { Fragment } from 'react';
import { Plane } from 'lucide-react';
import type { Journey } from '@/domain/types';
import { routeNodes, type RouteNode } from '@/domain/journey';
import { formatTime } from '@/domain/format';
import { cn } from '@/lib/utils';
import { NightsChip } from './NightsChip';

function describeRouting(nodes: RouteNode[]): string {
  const parts = nodes.map((n) => (n.nights ? `${n.iata} (${n.nights} night stopover)` : n.iata));
  return `Route: ${parts.join(' to ')}`;
}

/**
 * Compact, glanceable route strip for a journey card: origin → (stopovers,
 * each with a nights chip) → destination, with the first/last leg's
 * departure/arrival times shown subtly. Not the full itinerary timeline.
 */
export function JourneyMiniTimeline({
  journey,
  className,
}: {
  journey: Journey;
  className?: string;
}) {
  const firstLeg = journey.legs[0];
  const lastLeg = journey.legs[journey.legs.length - 1];
  const nodes = routeNodes(journey);

  return (
    <div
      className={cn('flex items-center gap-1 overflow-x-auto text-sm', className)}
      role="group"
      aria-label={describeRouting(nodes)}
    >
      <span className="shrink-0 text-xs text-muted-foreground">{formatTime(firstLeg.departure)}</span>
      <div className="flex shrink-0 items-center gap-1">
        {nodes.map((node, i) => (
          <Fragment key={`${node.iata}-${i}`}>
            {i > 0 && (
              <span className="flex items-center text-muted-foreground" aria-hidden="true">
                <span className="h-px w-3 bg-border sm:w-5" />
                <Plane className="h-3 w-3 shrink-0" />
                <span className="h-px w-3 bg-border sm:w-5" />
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="font-mono text-xs font-semibold tracking-wide">{node.iata}</span>
              {node.nights ? <NightsChip nights={node.nights} size="xs" /> : null}
            </span>
          </Fragment>
        ))}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{formatTime(lastLeg.arrival)}</span>
    </div>
  );
}
