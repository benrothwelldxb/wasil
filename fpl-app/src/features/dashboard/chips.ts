import type { Player } from "@/features/fpl";
import type { GameweekOutlook } from "@/features/fixtures";
import type { PlayerPrediction, PredictionWindow } from "@/features/predictions";

/** The four FPL chips this app can advise on. */
export type ChipKey = "triple-captain" | "bench-boost" | "free-hit" | "wildcard";

/**
 * How strongly we rate playing a chip this week:
 * - `play`    — a genuinely strong week; worth using now.
 * - `consider`— worth a look, but not a standout.
 * - `hold`    — nothing special; save it. (Not surfaced to the user.)
 */
export type ChipStatus = "play" | "consider" | "hold";

export interface ChipAdvice {
  chip: ChipKey;
  /** Display name, e.g. "Triple Captain". */
  name: string;
  emoji: string;
  status: ChipStatus;
  /** Short verdict, e.g. "Great week to play it". */
  headline: string;
  /** Plain-English reason a manager can sanity-check. */
  reason: string;
  /** Projected extra points from playing it this week, when computable. */
  extraPoints?: number;
}

export const CHIP_META: Record<ChipKey, { name: string; emoji: string }> = {
  "triple-captain": { name: "Triple Captain", emoji: "👑" },
  "bench-boost": { name: "Bench Boost", emoji: "🪑" },
  "free-hit": { name: "Free Hit", emoji: "⚡" },
  wildcard: { name: "Wildcard", emoji: "🃏" },
};

/**
 * All chip thresholds in one place, for transparency and easy tuning.
 * Point figures are projected (expected) points for the coming gameweek.
 */
export const CHIP_THRESHOLDS = {
  /** Extra points from tripling (vs. a normal captain, who already doubles). */
  tripleCaptain: { play: 12, consider: 7 },
  /** Combined projected points of the four bench players. */
  benchBoost: { play: 12, consider: 8 },
  /** Number of your 15 whose club has NO fixture this week (a blank). */
  freeHit: { play: 8, consider: 4 },
  /** Number of your 15 who are injured/suspended (need a lasting fix). */
  wildcard: { consider: 4 },
  /** A future gameweek is "notable" once this many clubs blank / double. */
  calendar: { notableBlank: 4, notableDouble: 4 },
} as const;

/** How many gameweeks ahead the planner looks for blank/double targets. */
export const CALENDAR_HORIZON = 8;

export interface ChipInput {
  /** The full 15-man squad. */
  squad: Player[];
  /** The starting XI player ids. */
  starterIds: number[];
  /** The four bench player ids (goalkeeper + three outfield subs). */
  benchIds: number[];
  captainId: number | null;
  predictionById: Map<number, PlayerPrediction>;
  /** Horizon to read points/fixture-counts from — the scout report uses 1. */
  window: PredictionWindow;
  /** Whether this is the manager's own team (chips only apply to yours). */
  source: "yours" | "suggested";
}

const STATUS_HEADLINE: Record<Exclude<ChipStatus, "hold">, string> = {
  play: "Great week to play it",
  consider: "Worth a look",
};

/**
 * Recommend which chips (if any) to play this week from the squad's projected
 * points and each club's fixture count for the coming gameweek.
 *
 * Deterministic and inspectable — no AI. Returns only chips worth surfacing
 * (`play`/`consider`), most compelling first; an empty array means "hold".
 * Double gameweeks (a club with two fixtures) and blanks (none) fall out of the
 * prediction windows directly, so `expectedPoints` already accounts for them.
 */
export function evaluateChips(input: ChipInput): ChipAdvice[] {
  const { predictionById: byId, window } = input;

  const weekPoints = (id: number) =>
    byId.get(id)?.windows[window].expectedPoints ?? 0;
  const fixtureCount = (id: number) =>
    byId.get(id)?.windows[window].fixtureCount ?? 0;

  // Guard preseason / no-data: if literally nobody has a fixture this week the
  // window is empty, not a mass blank. Suppress fixture-count-driven advice.
  const playingCount = input.squad.filter(
    (p) => fixtureCount(p.id) >= 1,
  ).length;
  const hasRealGameweek = playingCount > 0;

  const advice: ChipAdvice[] = [];

  // 👑 Triple Captain — the extra multiple on your captain's projected week.
  if (input.captainId !== null) {
    const extra = weekPoints(input.captainId);
    const captain = input.squad.find((p) => p.id === input.captainId) ?? null;
    const isDouble = fixtureCount(input.captainId) >= 2;
    const t = CHIP_THRESHOLDS.tripleCaptain;
    const status: ChipStatus =
      extra >= t.play ? "play" : extra >= t.consider ? "consider" : "hold";
    if (status !== "hold" && captain) {
      const dgw = isDouble ? " plays twice this week and" : "";
      advice.push({
        chip: "triple-captain",
        ...CHIP_META["triple-captain"],
        status,
        headline: STATUS_HEADLINE[status],
        reason: `${captain.webName}${dgw} projects ${extra.toFixed(1)} pts — tripling adds about +${extra.toFixed(1)} on top of the usual captain double.`,
        extraPoints: extra,
      });
    }
  }

  // 🪑 Bench Boost — the four bench players' points get added to your score.
  {
    const benchTotal = input.benchIds.reduce((s, id) => s + weekPoints(id), 0);
    const benchDoubles = input.benchIds.filter(
      (id) => fixtureCount(id) >= 2,
    ).length;
    const t = CHIP_THRESHOLDS.benchBoost;
    const status: ChipStatus =
      benchTotal >= t.play
        ? "play"
        : benchTotal >= t.consider
          ? "consider"
          : "hold";
    if (status !== "hold") {
      const dgw =
        benchDoubles > 0
          ? ` (${benchDoubles} of them play twice this week)`
          : "";
      advice.push({
        chip: "bench-boost",
        ...CHIP_META["bench-boost"],
        status,
        headline: STATUS_HEADLINE[status],
        reason: `Your bench projects ${benchTotal.toFixed(1)} pts${dgw} — that's what Bench Boost would add to your total.`,
        extraPoints: benchTotal,
      });
    }
  }

  // ⚡ Free Hit — a one-week team, ideal when lots of your clubs blank.
  if (hasRealGameweek) {
    const blanks = input.squad.filter((p) => fixtureCount(p.id) === 0).length;
    const t = CHIP_THRESHOLDS.freeHit;
    const status: ChipStatus =
      blanks >= t.play ? "play" : blanks >= t.consider ? "consider" : "hold";
    if (status !== "hold") {
      advice.push({
        chip: "free-hit",
        ...CHIP_META["free-hit"],
        status,
        headline: STATUS_HEADLINE[status],
        reason: `${blanks} of your players have no fixture this week — a Free Hit lets you field a full team for one week, then reverts.`,
      });
    }
  }

  // 🃏 Wildcard — a lasting rebuild when several players need replacing.
  {
    const brokenPlayers = input.squad.filter(
      (p) =>
        p.availability === "injured" ||
        p.availability === "suspended" ||
        p.availability === "unavailable",
    ).length;
    const t = CHIP_THRESHOLDS.wildcard;
    if (brokenPlayers >= t.consider) {
      advice.push({
        chip: "wildcard",
        ...CHIP_META.wildcard,
        status: "consider",
        headline: STATUS_HEADLINE.consider,
        reason: `${brokenPlayers} of your players are injured or suspended — more than free transfers can fix. A Wildcard rebuilds the squad for good.`,
      });
    }
  }

  // Chips only apply to your own team; a suggested team can't play one yet.
  const relevant =
    input.source === "yours"
      ? advice
      : advice.filter((a) => a.chip === "triple-captain" || a.chip === "bench-boost");

  // A blank-week Free Hit and a Wildcard compete — don't show both loudly.
  const freeHitStrong = relevant.some(
    (a) => a.chip === "free-hit" && a.status === "play",
  );
  const deduped = freeHitStrong
    ? relevant.filter((a) => a.chip !== "wildcard")
    : relevant;

  // Most compelling first: play before consider, then by extra points.
  const rank = (a: ChipAdvice) =>
    (a.status === "play" ? 100 : 0) + (a.extraPoints ?? 0);
  return deduped.sort((x, y) => rank(y) - rank(x));
}

/** A forward-looking heads-up about a notable upcoming gameweek. */
export interface ChipOutlook {
  /** Chips this gameweek is a target for. */
  chips: ChipKey[];
  emoji: string;
  event: number;
  text: string;
}

/**
 * Scan the upcoming gameweek calendar for the biggest blank and double
 * gameweeks within the planning horizon and turn them into chip heads-ups —
 * e.g. "GW29: 8 clubs blank — line up your Free Hit". Only looks *ahead* of the
 * current gameweek, so it never duplicates this week's advice.
 *
 * @param calendar   upcoming gameweeks (ascending), from `buildGameweekCalendar`
 * @param afterEvent the current headline gameweek; only later ones are planned
 */
export function upcomingChipTargets(
  calendar: readonly GameweekOutlook[],
  afterEvent: number | null,
): ChipOutlook[] {
  const from = afterEvent ?? 0;
  const horizon = calendar.filter(
    (g) => g.event > from && g.event <= from + CALENDAR_HORIZON,
  );
  const t = CHIP_THRESHOLDS.calendar;
  const outlook: ChipOutlook[] = [];

  // The biggest upcoming double gameweek — a Triple Captain / Bench Boost week.
  const doubles = horizon.filter((g) => g.doubleTeams >= t.notableDouble);
  const bestDouble = pickBiggest(doubles, (g) => g.doubleTeams);
  if (bestDouble) {
    outlook.push({
      chips: ["triple-captain", "bench-boost"],
      emoji: "📅",
      event: bestDouble.event,
      text: `GW${bestDouble.event}: ${bestDouble.doubleTeams} clubs play twice — a prime week to save your Triple Captain or Bench Boost for.`,
    });
  }

  // The biggest upcoming blank gameweek — a Free Hit (or Wildcard) week.
  const blanks = horizon.filter((g) => g.blankTeams >= t.notableBlank);
  const bestBlank = pickBiggest(blanks, (g) => g.blankTeams);
  if (bestBlank) {
    outlook.push({
      chips: ["free-hit", "wildcard"],
      emoji: "📅",
      event: bestBlank.event,
      text: `GW${bestBlank.event}: ${bestBlank.blankTeams} clubs blank — line up your Free Hit (or a Wildcard) for it.`,
    });
  }

  return outlook.sort((a, b) => a.event - b.event);
}

/** The item with the highest score; ties broken by the soonest gameweek. */
function pickBiggest(
  items: readonly GameweekOutlook[],
  score: (g: GameweekOutlook) => number,
): GameweekOutlook | null {
  let best: GameweekOutlook | null = null;
  for (const item of items) {
    if (
      !best ||
      score(item) > score(best) ||
      (score(item) === score(best) && item.event < best.event)
    ) {
      best = item;
    }
  }
  return best;
}
