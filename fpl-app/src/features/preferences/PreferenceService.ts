import type { Player } from "@/features/fpl";
import type {
  BudgetPhilosophy,
  DifferentialPreference,
  PlanningHorizon,
  Preferences,
  RecommendationStyle,
  RiskProfile,
} from "./schema";
import {
  resolveSignals,
  type PlayerSignals,
} from "./signals";

/** Where a score adjustment originated. */
export type AdjustmentSource =
  | "club-affinity"
  | "club-avoid"
  | "risk"
  | "ownership"
  | "fixtures"
  | "playing-style"
  | "rotation";

/** A single, explained adjustment to a player's evaluation score. */
export interface ScoreAdjustment {
  source: AdjustmentSource;
  /** Multiplicative factor applied to the score (1 = neutral). */
  factor: number;
  /** Signed percentage change, `(factor - 1) * 100`. */
  deltaPercent: number;
  /** Human-readable rationale (transparency). */
  explanation: string;
}

/** The result of adjusting a player's base score. */
export interface AdjustedScore {
  playerId: number;
  baseScore: number;
  adjustedScore: number;
  /** Net percentage change from base to adjusted. */
  totalDeltaPercent: number;
  adjustments: ScoreAdjustment[];
}

/** Context an evaluation engine may pass in to refine adjustments. */
export interface PlayerEvaluationContext {
  /** Better signals from a projection engine (override the derived ones). */
  signals?: Partial<PlayerSignals>;
}

/** Planning window an optimiser should respect. */
export interface PlanningWindow {
  gameweeks: PlanningHorizon;
  /** Per-gameweek weights (nearer weeks weigh slightly more), summing to 1. */
  weights: number[];
}

// --- Tuning constants -------------------------------------------------------
// Magnitudes are deliberately small: preferences *nudge* scores, they never
// dominate them. None of this forces a player into a team.

const AFFINITY_MAGNITUDE: Record<RecommendationStyle, number> = {
  "pure-data": 0,
  "slight-affinity": 0.03,
  "club-loyalist": 0.08,
  "die-hard": 0.2,
};

/** Factor applied to a player from an avoided club in ratings (−70%). */
const AVOID_CLUB_FACTOR = 0.3;

const RISK_STRENGTH: Record<RiskProfile, number> = {
  conservative: -1,
  balanced: 0,
  aggressive: 1,
};
const RISK_MAGNITUDE = 0.12;

const DIFFERENTIAL_STRENGTH: Record<DifferentialPreference, number> = {
  never: -1,
  occasionally: -0.5,
  balanced: 0,
  prefer: 0.6,
  maximum: 1,
};
const DIFFERENTIAL_MAGNITUDE = 0.15;

const STYLE_MAGNITUDE = 0.08;
const ROTATION_MAGNITUDE = 0.06;
const FIXTURE_FORM_MAGNITUDE = 0.1;

const PLANNING_DECAY = 0.85;

/** Map a `[0,1]` signal to a centred `[-1,1]` value. */
function centre(signal: number): number {
  return (signal - 0.5) * 2;
}

function toPercent(factor: number): number {
  return Math.round((factor - 1) * 1000) / 10;
}

function signed(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function horizonPhrase(gw: PlanningHorizon): string {
  switch (gw) {
    case 1:
      return "next gameweek";
    case 3:
      return "next three gameweeks";
    case 5:
      return "next five gameweeks";
    case 8:
      return "next eight gameweeks";
  }
}

/**
 * A pure, reusable service that converts **preferences** into **explained,
 * adjusted player scores**.
 *
 * Design contract: the service knows *why* scores change; consumers
 * (optimisers, captain pickers, transfer planners, AI explanations) do not.
 * They call {@link adjustPlayerScore} (or an individual `adjust*` method) and
 * consume the adjusted values plus the human-readable explanations. This class
 * contains **no optimisation logic** — it only reweights.
 */
export class PreferenceService {
  private readonly preferences: Preferences;

  constructor(preferences: Preferences) {
    this.preferences = preferences;
  }

  /** The preferences backing this service instance. */
  getPreferences(): Preferences {
    return this.preferences;
  }

  getBudgetPhilosophy(): BudgetPhilosophy {
    return this.preferences.budgetPhilosophy;
  }

  // --- Individual adjustments ----------------------------------------------

  /** Optional weighting toward the user's favourite club. Never forces. */
  adjustClubAffinity(
    player: Player,
    _signals?: PlayerSignals,
  ): ScoreAdjustment | null {
    const { favouriteClubId, recommendationStyle } = this.preferences;
    if (favouriteClubId === null || player.teamId !== favouriteClubId) {
      return null;
    }
    const magnitude = AFFINITY_MAGNITUDE[recommendationStyle];
    if (magnitude === 0) return null;

    const factor = 1 + magnitude;
    const deltaPercent = toPercent(factor);
    return {
      source: "club-affinity",
      factor,
      deltaPercent,
      explanation: `Club Affinity increased ${player.webName}'s rating by ${deltaPercent.toFixed(1)}%.`,
    };
  }

  /**
   * Strongly penalise players from a club the user refuses to own. In ratings
   * this sinks them (with an explanation) rather than hiding them; team
   * selection and transfers apply this as a hard filter, so this is the soft
   * backstop for list views.
   */
  adjustAvoidClub(player: Player): ScoreAdjustment | null {
    if (!this.preferences.avoidClubIds.includes(player.teamId)) return null;
    const factor = AVOID_CLUB_FACTOR;
    const deltaPercent = toPercent(factor);
    return {
      source: "club-avoid",
      factor,
      deltaPercent,
      explanation: `Avoided club: eased ${player.webName} right down (${deltaPercent.toFixed(1)}%) because you never pick players from ${player.teamName}.`,
    };
  }

  /** Reward ceiling (aggressive) or floor (conservative). */
  adjustRisk(player: Player, signals: PlayerSignals): ScoreAdjustment | null {
    const strength = RISK_STRENGTH[this.preferences.riskProfile];
    if (strength === 0) return null;

    const aggressive = strength > 0;
    const relevant = aggressive ? signals.ceiling : signals.floor;
    const factor = 1 + RISK_MAGNITUDE * centre(relevant);
    const deltaPercent = toPercent(factor);
    if (Math.abs(deltaPercent) < 0.1) return null;

    const reason = aggressive
      ? deltaPercent > 0
        ? "for higher attacking upside"
        : "for a limited ceiling"
      : deltaPercent > 0
        ? "for reliable minutes and a high floor"
        : "for a shaky floor";

    return {
      source: "risk",
      factor,
      deltaPercent,
      explanation: `Risk Profile ${
        deltaPercent > 0 ? "favoured" : "eased off"
      } ${player.webName} ${reason} (${signed(deltaPercent)}).`,
    };
  }

  /** Reweight by ownership according to the differential preference. */
  adjustOwnership(
    player: Player,
    signals: PlayerSignals,
  ): ScoreAdjustment | null {
    const strength =
      DIFFERENTIAL_STRENGTH[this.preferences.differentialPreference];
    if (strength === 0) return null;

    const lowOwnership = 1 - signals.ownership;
    const factor = 1 + DIFFERENTIAL_MAGNITUDE * strength * centre(lowOwnership);
    const deltaPercent = toPercent(factor);
    if (Math.abs(deltaPercent) < 0.1) return null;

    const ownedPct = player.selectedByPercent.toFixed(1);
    const explanation =
      strength > 0
        ? deltaPercent > 0
          ? `Differential Preference boosted ${player.webName} as a ${ownedPct}%-owned differential (${signed(deltaPercent)}).`
          : `Differential Preference eased off ${player.webName} for high ${ownedPct}% ownership (${signed(deltaPercent)}).`
        : deltaPercent > 0
          ? `Differential Preference favoured ${player.webName} as a widely-owned, ${ownedPct}%-owned pick (${signed(deltaPercent)}).`
          : `Differential Preference eased off low-owned ${player.webName} (${ownedPct}%) (${signed(deltaPercent)}).`;

    return { source: "ownership", factor, deltaPercent, explanation };
  }

  /**
   * Blend form and fixtures per the Form↔Fixtures slider + planning horizon.
   *
   * The slider centre (balanced) is truly neutral — no adjustment. Leaning
   * toward form rewards in-form players; leaning toward fixtures rewards good
   * fixture runs (which requires an engine-supplied fixture signal).
   */
  adjustFixtureWeight(
    player: Player,
    signals: PlayerSignals,
  ): ScoreAdjustment | null {
    const { formBias, planningHorizon } = this.preferences;
    const emphasis = formBias - 0.5; // (-0.5 fixtures) … (+0.5 form)
    if (Math.abs(emphasis) < 0.01) return null; // balanced ⇒ neutral

    const towardForm = emphasis > 0;
    const relevant = towardForm ? signals.form : signals.fixture;
    // Without a fixture projection we can't act on a fixtures-led preference.
    if (relevant === null || relevant === undefined) return null;

    const factor = 1 + FIXTURE_FORM_MAGNITUDE * (2 * Math.abs(emphasis)) * centre(relevant);
    const deltaPercent = toPercent(factor);
    if (Math.abs(deltaPercent) < 0.1) return null;

    const explanation = towardForm
      ? `Form emphasis ${deltaPercent > 0 ? "boosted" : "eased off"} ${player.webName} (${signed(deltaPercent)}).`
      : `Planning Horizon weighed ${player.teamName}'s ${horizonPhrase(planningHorizon)} fixtures (${signed(deltaPercent)}).`;

    return { source: "fixtures", factor, deltaPercent, explanation };
  }

  /** Favour attackers or defenders per the preferred playing style. */
  adjustPlayingStyle(
    player: Player,
    signals: PlayerSignals,
  ): ScoreAdjustment | null {
    const { playingStyle } = this.preferences;
    if (playingStyle === "balanced") return null;

    const relevant =
      playingStyle === "attack" ? signals.attacking : signals.defensive;
    const factor = 1 + STYLE_MAGNITUDE * centre(relevant);
    const deltaPercent = toPercent(factor);
    if (Math.abs(deltaPercent) < 0.1) return null;

    const label = playingStyle === "attack" ? "Attack" : "Defence";
    return {
      source: "playing-style",
      factor,
      deltaPercent,
      explanation: `Preferred Style (${label}) ${
        deltaPercent > 0 ? "boosted" : "eased off"
      } ${player.webName} (${signed(deltaPercent)}).`,
    };
  }

  /** Reward minutes security (avoid) or upside (high risk) per rotation pref. */
  adjustRotation(
    player: Player,
    signals: PlayerSignals,
  ): ScoreAdjustment | null {
    const { rotationTolerance } = this.preferences;
    if (rotationTolerance === "balanced") return null;

    const relevant =
      rotationTolerance === "avoid" ? signals.floor : signals.ceiling;
    const factor = 1 + ROTATION_MAGNITUDE * centre(relevant);
    const deltaPercent = toPercent(factor);
    if (Math.abs(deltaPercent) < 0.1) return null;

    const reason =
      rotationTolerance === "avoid"
        ? "secure minutes"
        : "high-reward upside despite rotation risk";
    return {
      source: "rotation",
      factor,
      deltaPercent,
      explanation: `Rotation Tolerance ${
        deltaPercent > 0 ? "favoured" : "eased off"
      } ${player.webName} for ${reason} (${signed(deltaPercent)}).`,
    };
  }

  /** The optimisation window future engines must respect. */
  adjustPlanningWindow(): PlanningWindow {
    const gameweeks = this.preferences.planningHorizon;
    const raw = Array.from(
      { length: gameweeks },
      (_, i) => PLANNING_DECAY ** i,
    );
    const total = raw.reduce((a, b) => a + b, 0);
    return { gameweeks, weights: raw.map((w) => w / total) };
  }

  // --- Composed adjustment --------------------------------------------------

  /**
   * Apply every relevant preference to a player's base score, returning the
   * adjusted score and the list of explained adjustments. This is the primary
   * entry point for recommendation engines.
   */
  adjustPlayerScore(
    player: Player,
    baseScore: number,
    context?: PlayerEvaluationContext,
  ): AdjustedScore {
    const signals = resolveSignals(player, context?.signals);

    const candidates = [
      this.adjustClubAffinity(player, signals),
      this.adjustAvoidClub(player),
      this.adjustRisk(player, signals),
      this.adjustOwnership(player, signals),
      this.adjustFixtureWeight(player, signals),
      this.adjustPlayingStyle(player, signals),
      this.adjustRotation(player, signals),
    ];

    const adjustments = candidates.filter(
      (a): a is ScoreAdjustment => a !== null,
    );

    const adjustedScore = adjustments.reduce(
      (score, a) => score * a.factor,
      baseScore,
    );
    const totalDeltaPercent =
      baseScore === 0 ? 0 : (adjustedScore / baseScore - 1) * 100;

    return {
      playerId: player.id,
      baseScore,
      adjustedScore,
      totalDeltaPercent: Math.round(totalDeltaPercent * 10) / 10,
      adjustments,
    };
  }
}

/** Convenience factory. */
export function createPreferenceService(
  preferences: Preferences,
): PreferenceService {
  return new PreferenceService(preferences);
}
