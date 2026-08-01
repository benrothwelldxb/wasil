import type { Player } from "@/features/fpl";
import type { AddCheck, SquadIssue, SquadState } from "./types";

/**
 * Official Fantasy Premier League squad rules.
 *
 * Budget is tracked in tenths of a million (integers) to avoid floating-point
 * drift when summing prices.
 */
export const SQUAD_RULES = {
  /** £100.0m, expressed in tenths. */
  budgetTenths: 1000,
  budget: 100,
  totalPlayers: 15,
  maxPerClub: 3,
} as const;

/** Required number of players per position id (FPL element_type ids). */
export const POSITION_TARGETS: Record<number, number> = {
  1: 2, // Goalkeepers
  2: 5, // Defenders
  3: 5, // Midfielders
  4: 3, // Forwards
};

/** Display order of positions. */
export const POSITION_ORDER = [1, 2, 3, 4] as const;

/** Fallback labels (real labels come from the positions query when available). */
export const POSITION_FALLBACK: Record<number, { short: string; name: string }> =
  {
    1: { short: "GKP", name: "Goalkeepers" },
    2: { short: "DEF", name: "Defenders" },
    3: { short: "MID", name: "Midfielders" },
    4: { short: "FWD", name: "Forwards" },
  };

function increment(map: Map<number, number>, key: number): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Derive the complete squad state (budget, counts, validation) from the list
 * of selected players. Pure and side-effect free.
 */
export function computeSquadState(players: Player[]): SquadState {
  const positionCounts = new Map<number, number>();
  const clubCounts = new Map<number, number>();
  const clubShortById = new Map<number, string>();
  let spentTenths = 0;

  for (const p of players) {
    increment(positionCounts, p.positionId);
    increment(clubCounts, p.teamId);
    clubShortById.set(p.teamId, p.teamShortName);
    spentTenths += p.price.nowRaw;
  }

  const remainingTenths = SQUAD_RULES.budgetTenths - spentTenths;
  const issues: SquadIssue[] = [];

  // Budget
  if (remainingTenths < 0) {
    issues.push({
      level: "error",
      message: `Over budget by £${(Math.abs(remainingTenths) / 10).toFixed(1)}m`,
    });
  }

  // Positions — too many (error) or too few (todo)
  for (const positionId of POSITION_ORDER) {
    const count = positionCounts.get(positionId) ?? 0;
    const target = POSITION_TARGETS[positionId] ?? 0;
    const label = POSITION_FALLBACK[positionId];
    if (count > target) {
      issues.push({
        level: "error",
        message: `Too many ${label?.name ?? "players"} (${count}/${target})`,
      });
    } else if (count < target) {
      const needed = target - count;
      issues.push({
        level: "todo",
        message: `Add ${needed} more ${
          needed === 1
            ? (label?.name ?? "player").replace(/s$/, "")
            : (label?.name ?? "players")
        }`,
      });
    }
  }

  // Clubs — max three per club
  for (const [teamId, count] of clubCounts) {
    if (count > SQUAD_RULES.maxPerClub) {
      issues.push({
        level: "error",
        message: `Too many from ${clubShortById.get(teamId) ?? "one club"} (${count}/${SQUAD_RULES.maxPerClub})`,
      });
    }
  }

  const positionsExact = POSITION_ORDER.every(
    (id) => (positionCounts.get(id) ?? 0) === (POSITION_TARGETS[id] ?? 0),
  );
  const positionsWithinCap = POSITION_ORDER.every(
    (id) => (positionCounts.get(id) ?? 0) <= (POSITION_TARGETS[id] ?? 0),
  );
  const clubsWithinCap = [...clubCounts.values()].every(
    (c) => c <= SQUAD_RULES.maxPerClub,
  );

  const isLegal =
    remainingTenths >= 0 && positionsWithinCap && clubsWithinCap;
  const isComplete =
    isLegal && players.length === SQUAD_RULES.totalPlayers && positionsExact;

  return {
    players,
    size: players.length,
    spent: spentTenths / 10,
    spentTenths,
    remaining: remainingTenths / 10,
    remainingTenths,
    budget: SQUAD_RULES.budget,
    positionCounts,
    clubCounts,
    issues,
    isLegal,
    isComplete,
  };
}

/**
 * Determine whether `player` can be legally added to the current squad.
 * Enforces every hard rule so illegal teams can never be assembled.
 */
export function checkCanAdd(
  player: Player,
  state: SquadState,
  selectedIds: Set<number>,
): AddCheck {
  if (selectedIds.has(player.id)) {
    return { canAdd: false, reason: "Already selected" };
  }

  if (state.size >= SQUAD_RULES.totalPlayers) {
    return { canAdd: false, reason: "Squad is full (15 players)" };
  }

  const posCount = state.positionCounts.get(player.positionId) ?? 0;
  const posTarget = POSITION_TARGETS[player.positionId] ?? 0;
  if (posCount >= posTarget) {
    const label =
      POSITION_FALLBACK[player.positionId]?.name ?? "this position";
    return {
      canAdd: false,
      reason: `Already have ${posTarget} ${label}`,
    };
  }

  const clubCount = state.clubCounts.get(player.teamId) ?? 0;
  if (clubCount >= SQUAD_RULES.maxPerClub) {
    return {
      canAdd: false,
      reason: `Max ${SQUAD_RULES.maxPerClub} from ${player.teamShortName}`,
    };
  }

  if (player.price.nowRaw > state.remainingTenths) {
    return { canAdd: false, reason: "Not enough budget" };
  }

  return { canAdd: true };
}
