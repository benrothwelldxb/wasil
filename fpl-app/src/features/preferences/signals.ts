import type { Player } from "@/features/fpl";
import { clamp } from "@/utils";

/**
 * Normalized, preference-agnostic signals about a player, each in `[0, 1]`.
 *
 * The PreferenceService reasons over these rather than raw stats, so it never
 * needs to know how a number was produced. Today they're derived from the
 * bootstrap Player via best-effort proxies; future projection engines can
 * supply better values (see `PlayerEvaluationContext.signals`) without any
 * change to the service.
 */
export interface PlayerSignals {
  /** Effective ownership (1 = template, heavily owned). */
  ownership: number;
  /** Minutes security / reliability (1 = nailed starter). */
  floor: number;
  /** Explosive scoring ceiling (1 = huge upside). */
  ceiling: number;
  /** Scoring consistency (1 = very consistent returns). */
  consistency: number;
  /** Recent form (1 = red-hot). */
  form: number;
  /** Attacking output (1 = elite attacker). */
  attacking: number;
  /** Defensive output (1 = elite defensive asset). */
  defensive: number;
  /**
   * Fixture ease over the planning window (1 = very easy run). `null` when no
   * fixture projection is available — the service treats null as "unknown".
   */
  fixture: number | null;
}

/**
 * Heuristic scales for deriving signals from season-to-date stats. These are
 * intentionally simple and monotonic; they exist so the engine is usable
 * before a projection pipeline exists, and are meant to be superseded by
 * engine-supplied signals later.
 */
const SCALES = {
  ownershipPct: 50, // 50%+ ⇒ fully "template"
  minutes: 1800, // ~20 full matches ⇒ nailed
  ictCeiling: 180,
  pointsPerGame: 8,
  form: 8,
  xgi: 12,
  threat: 1200,
  cleanSheets: 12,
} as const;

/** Derive best-effort signals from a bootstrap Player. */
export function deriveSignals(player: Player): PlayerSignals {
  const attacking = clamp(
    (player.expectedGoalInvolvements / SCALES.xgi +
      player.threat / SCALES.threat) /
      2,
    0,
    1,
  );

  const isDefensive = player.positionId === 1 || player.positionId === 2;
  const defensive = clamp(
    (player.cleanSheets / SCALES.cleanSheets) * (isDefensive ? 1 : 0.4),
    0,
    1,
  );

  return {
    ownership: clamp(player.selectedByPercent / SCALES.ownershipPct, 0, 1),
    floor: clamp(player.minutes / SCALES.minutes, 0, 1),
    ceiling: clamp(player.ictIndex / SCALES.ictCeiling, 0, 1),
    consistency: clamp(player.pointsPerGame / SCALES.pointsPerGame, 0, 1),
    form: clamp(player.form / SCALES.form, 0, 1),
    attacking,
    defensive,
    fixture: null,
  };
}

/** Merge derived signals with any engine-supplied overrides. */
export function resolveSignals(
  player: Player,
  overrides?: Partial<PlayerSignals>,
): PlayerSignals {
  const base = deriveSignals(player);
  return overrides ? { ...base, ...overrides } : base;
}
