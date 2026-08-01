import type { Player } from "@/features/fpl";
import type { FixtureAnalysisMap, TeamFixtureAnalysis } from "@/features/fixtures";
import type { PreferenceService } from "@/features/preferences";
import {
  METRIC_LABELS,
  METRIC_ORDER,
  SCORING_WEIGHTS,
  positionGroup,
  type MetricKey,
  type ScoringWeights,
} from "./config";
import { computeMetricValues } from "./metrics";
import { computeExpectedPoints } from "./expectedPoints";
import type { PlayerScore, ScoreComponent } from "./types";

export interface ScoringContext {
  fixtures: FixtureAnalysisMap;
  /** Preference service — the engine personalises via it, staying oblivious. */
  service: PreferenceService;
}

/** Normalise a weight set so its entries sum to 1 (tuning-friendly). */
function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = METRIC_ORDER.reduce((sum, k) => sum + weights[k], 0);
  if (total <= 0) {
    const equal = 1 / METRIC_ORDER.length;
    return METRIC_ORDER.reduce((acc, k) => {
      acc[k] = equal;
      return acc;
    }, {} as ScoringWeights);
  }
  return METRIC_ORDER.reduce((acc, k) => {
    acc[k] = weights[k] / total;
    return acc;
  }, {} as ScoringWeights);
}

/** Pick the fixture-ease value for the active planning window (0–1). */
function windowEase(
  analysis: TeamFixtureAnalysis | undefined,
  planningGameweeks: number,
): number {
  if (!analysis) return 0.5;
  const window =
    planningGameweeks <= 1
      ? analysis.next1
      : planningGameweeks <= 3
        ? analysis.next3
        : analysis.next5;
  return window.games > 0 ? window.rating / 100 : 0.5;
}

function nextEase(analysis: TeamFixtureAnalysis | undefined): number {
  if (!analysis || analysis.next1.games === 0) return 0.5;
  return analysis.next1.rating / 100;
}

/** Score a single player. `planningGameweeks` comes from the preferences. */
function scoreOne(
  player: Player,
  ctx: ScoringContext,
  planningGameweeks: number,
): Omit<PlayerScore, "rank"> {
  const analysis = ctx.fixtures.get(player.teamId);
  const easeWindow = windowEase(analysis, planningGameweeks);
  const easeNext = nextEase(analysis);

  const values = computeMetricValues(player, easeWindow, easeNext);
  const weights = normalizeWeights(
    SCORING_WEIGHTS[positionGroup(player.positionId)],
  );

  const components: ScoreComponent[] = METRIC_ORDER.map((key: MetricKey) => {
    const value = values[key];
    const weight = weights[key];
    const score = value * 100;
    return {
      key,
      label: METRIC_LABELS[key],
      weight,
      value,
      score,
      contribution: weight * score,
    };
  });

  const baseRating = components.reduce((sum, c) => sum + c.contribution, 0);

  const expectedPoints = computeExpectedPoints(player, easeWindow, easeNext);

  // Personalise via the PreferenceService — the engine never learns *why*.
  const adjusted = ctx.service.adjustPlayerScore(player, baseRating, {
    signals: { fixture: easeWindow },
  });

  return {
    player,
    components,
    baseRating: Math.round(baseRating * 10) / 10,
    overallRating: Math.round(adjusted.adjustedScore * 10) / 10,
    expectedPoints,
    adjustments: adjusted.adjustments,
    totalDeltaPercent: adjusted.totalDeltaPercent,
  };
}

/**
 * Score and rank every player. Ranking is by the personalised overall rating,
 * so switching preference profiles re-ranks automatically.
 */
export function scoreAllPlayers(
  players: Player[],
  ctx: ScoringContext,
): PlayerScore[] {
  const planningGameweeks = ctx.service.adjustPlanningWindow().gameweeks;

  const scored = players.map((player) =>
    scoreOne(player, ctx, planningGameweeks),
  );

  scored.sort((a, b) => b.overallRating - a.overallRating);

  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}
