import type { Player } from "@/features/fpl";
import type { FixtureAnalysisMap } from "@/features/fixtures";
import type { PlayerPrediction } from "@/features/predictions";

export type InsightTone = "good" | "bad" | "money" | "star" | "info";

export interface Insight {
  tone: InsightTone;
  text: string;
}

export const INSIGHT_EMOJI: Record<InsightTone, string> = {
  good: "🟢",
  bad: "🔴",
  money: "💰",
  star: "⭐",
  info: "💡",
};

/** A good next-3 fixture run (ease rating out of 100). */
const GREAT_FIXTURE = 65;
/** Rotation risk (1 − p60) above which a starter is flagged. */
const ROTATION_RISK = 0.5;

export interface InsightInput {
  /** The starting XI. */
  starters: Player[];
  predictionById: Map<number, PlayerPrediction>;
  fixtures: FixtureAnalysisMap;
  captain: Player | null;
  captainValue: number;
  /** Projected (this-week) points for every player, for the captain percentile. */
  marketValues: number[];
  /** Net gain of the best single transfer, or null if not applicable. */
  transferGain: number | null;
  source: "yours" | "suggested";
}

/**
 * Turn the squad + projections into a short "scout report" — the proactive
 * headline insights a manager should notice on arrival. Pure and inspectable.
 */
export function generateInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  // 🟢 Fixtures
  const goodFixtures = input.starters.filter((p) => {
    const w = input.fixtures.get(p.teamId)?.next3;
    return w && w.games > 0 && w.rating >= GREAT_FIXTURE;
  }).length;
  if (goodFixtures >= 1) {
    insights.push({
      tone: "good",
      text:
        goodFixtures === 1
          ? "One of your players has an excellent run of fixtures."
          : `${goodFixtures} of your players have excellent fixtures coming up.`,
    });
  }

  // 🔴 Rotation / availability risk
  const risky = input.starters.filter((p) => {
    const doubt =
      p.availability === "doubtful" ||
      p.availability === "injured" ||
      p.availability === "suspended";
    const rotation =
      (input.predictionById.get(p.id)?.minutes.rotationRisk ?? 0) >=
      ROTATION_RISK;
    return doubt || rotation;
  });
  if (risky.length >= 1) {
    const first = risky[0];
    insights.push({
      tone: "bad",
      text:
        risky.length === 1 && first
          ? `${first.webName} has a high rotation risk this week.`
          : `${risky.length} of your players carry rotation or fitness risk.`,
    });
  }

  // ⭐ Captain quality (percentile among all players)
  if (input.captain && input.marketValues.length > 0) {
    const better = input.marketValues.filter(
      (v) => v > input.captainValue,
    ).length;
    const topPct = Math.max(
      1,
      Math.round((better / input.marketValues.length) * 100),
    );
    insights.push({
      tone: "star",
      text: `Your captain ${input.captain.webName} is projected in the top ${topPct}% of all players.`,
    });
  }

  // 💰 Transfer opportunity (only meaningful for a saved squad)
  if (input.source === "yours") {
    if (input.transferGain !== null && input.transferGain > 0.3) {
      insights.push({
        tone: "money",
        text: `One free transfer could add about +${input.transferGain.toFixed(1)} points.`,
      });
    }
  } else {
    insights.push({
      tone: "info",
      text: 'Tap "Use this team" to save it — then you\'ll get transfer tips here too.',
    });
  }

  return insights.slice(0, 5);
}
