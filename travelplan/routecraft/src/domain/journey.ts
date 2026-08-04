/**
 * Shared "route walk" helper: the origin → stopovers → destination sequence
 * that route-visualisation components (route map, route glyph, mini
 * timeline) each need. Previously each component re-derived this list
 * inline from `journey.legs`/`journey.stopovers`; this is the single
 * source of truth for that walk.
 *
 * Pure and side-effect free — no rendering concerns here. Components decide
 * how to lay out, style, or animate each node; this only decides which
 * nodes exist, in what order, and what each one is.
 */
import type { Journey } from './types';

export type RouteNodeKind = 'origin' | 'stopover' | 'destination';

export interface RouteNode {
  iata: string;
  kind: RouteNodeKind;
  /** Present only for stopover nodes; origin/destination never carry nights. */
  nights?: number;
}

/**
 * Ordered route nodes for a journey: the origin airport, each stopover city
 * (carrying its `nights`), then the destination airport. Derived from
 * `journey.legs`/`journey.stopovers` rather than `journey.criteria`, so it
 * reflects the resolved itinerary even if criteria and legs ever diverge.
 */
export function routeNodes(journey: Journey): RouteNode[] {
  const firstLeg = journey.legs[0];
  const lastLeg = journey.legs[journey.legs.length - 1];

  const nodes: RouteNode[] = [{ iata: firstLeg.from.iata, kind: 'origin' }];

  for (const stopover of journey.stopovers) {
    nodes.push({ iata: stopover.airport.iata, kind: 'stopover', nights: stopover.nights });
  }

  nodes.push({ iata: lastLeg.to.iata, kind: 'destination' });

  return nodes;
}
