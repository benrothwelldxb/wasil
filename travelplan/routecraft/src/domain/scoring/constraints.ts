/**
 * Feasibility and the hard budget constraint. Budget is NEVER a soft factor for
 * inclusion — an over-budget journey is discarded before scoring.
 */
import type { Journey, Money, SearchCriteria } from '../types';

/** Minimum sensible connection buffer, in minutes. */
export const MIN_CONNECTION_MINUTES = 75;
/** A journey with more legs than this is discarded as implausible. */
export const MAX_LEGS = 4;

export function isFeasible(journey: Journey): boolean {
  if (journey.legs.length === 0 || journey.legs.length > MAX_LEGS) return false;

  // Connection buffers between consecutive legs that are NOT overnight stopovers.
  for (let i = 0; i < journey.legs.length - 1; i++) {
    const arrive = new Date(journey.legs[i].arrival).getTime();
    const depart = new Date(journey.legs[i + 1].departure).getTime();
    if (Number.isNaN(arrive) || Number.isNaN(depart)) continue;
    const gapMinutes = (depart - arrive) / 60000;
    // Overnight stopovers legitimately create large gaps; only reject tight ones.
    if (gapMinutes < MIN_CONNECTION_MINUTES) return false;
  }
  return true;
}

export interface BudgetFilterResult {
  kept: Journey[];
  overBudgetFiltered: number;
  cheapestOverBudget?: Money;
}

export function applyBudgetConstraint(
  journeys: Journey[],
  criteria: SearchCriteria,
): BudgetFilterResult {
  const kept: Journey[] = [];
  const overBudget: Journey[] = [];

  for (const j of journeys) {
    if (j.cost.total.amount <= criteria.budget.amount) kept.push(j);
    else overBudget.push(j);
  }

  const cheapestOverBudget =
    overBudget.length > 0
      ? overBudget.reduce((min, j) => (j.cost.total.amount < min.cost.total.amount ? j : min))
          .cost.total
      : undefined;

  return {
    kept,
    overBudgetFiltered: overBudget.length,
    ...(cheapestOverBudget ? { cheapestOverBudget } : {}),
  };
}
