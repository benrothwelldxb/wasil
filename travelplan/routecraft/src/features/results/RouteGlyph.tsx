import { Fragment } from 'react';
import { Plane } from 'lucide-react';
import type { Journey } from '@/domain/types';
import { routeNodes } from '@/domain/journey';
import { cn } from '@/lib/utils';
import { NightsChip } from './NightsChip';

/** Compact visual of the routing: DXB ✈ IST 🌙1 ✈ MAN */
export function RouteGlyph({ journey, className }: { journey: Journey; className?: string }) {
  const nodes = routeNodes(journey);

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-sm font-medium', className)}>
      {nodes.map((node, i) => (
        <Fragment key={`${node.iata}-${i}`}>
          {i > 0 && (
            <Plane className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="inline-flex items-center gap-1">
            <span className="tracking-wide">{node.iata}</span>
            {node.nights ? <NightsChip nights={node.nights} size="sm" /> : null}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
