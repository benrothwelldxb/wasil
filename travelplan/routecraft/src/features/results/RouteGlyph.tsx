import { Fragment } from 'react';
import { Moon, Plane } from 'lucide-react';
import type { Journey } from '@/domain/types';
import { cn } from '@/lib/utils';

/** Compact visual of the routing: DXB ✈ IST 🌙1 ✈ MAN */
export function RouteGlyph({ journey, className }: { journey: Journey; className?: string }) {
  const stops = journey.stopovers;
  const codes: { iata: string; nights?: number }[] = [
    { iata: journey.legs[0].from.iata },
    ...stops.map((s) => ({ iata: s.airport.iata, nights: s.nights })),
    { iata: journey.legs[journey.legs.length - 1].to.iata },
  ];

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-sm font-medium', className)}>
      {codes.map((node, i) => (
        <Fragment key={`${node.iata}-${i}`}>
          {i > 0 && (
            <Plane className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="inline-flex items-center gap-1">
            <span className="tracking-wide">{node.iata}</span>
            {node.nights ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-accent/15 px-1 text-xs text-accent">
                <Moon className="h-3 w-3" aria-hidden="true" />
                {node.nights}
              </span>
            ) : null}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
