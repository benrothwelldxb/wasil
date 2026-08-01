export type CheckStatus = "good" | "ok" | "weak";

export interface RatingCheck {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface TeamRating {
  /** 0–100 overall score. */
  score: number;
  grade: "A" | "B" | "C" | "D";
  checks: RatingCheck[];
  /** The single highest-impact improvement, if any. */
  topFix: string | null;
}

export interface RatingInput {
  /** 1-based rank of the chosen captain among starters by projected points. */
  captainRank: number;
  /** Combined projected points of the four bench players. */
  benchPoints: number;
  /** Starters carrying rotation or availability risk. */
  riskyCount: number;
  /** Net points a single free transfer could add, or null. */
  transferGain: number | null;
}

const SCORE: Record<CheckStatus, number> = { good: 100, ok: 65, weak: 30 };

/**
 * Grade a squad from four transparent checks — captaincy, bench cover, squad
 * fitness, and how much a single transfer could still add. No AI; every check
 * and the overall score are derived from figures shown elsewhere in the app.
 */
export function rateTeam(input: RatingInput): TeamRating {
  const checks: RatingCheck[] = [];

  // Captaincy — is the armband on your best projected player?
  const capStatus: CheckStatus =
    input.captainRank <= 1 ? "good" : input.captainRank <= 3 ? "ok" : "weak";
  checks.push({
    label: "Captaincy",
    status: capStatus,
    detail:
      capStatus === "good"
        ? "On your highest-projected player."
        : capStatus === "ok"
          ? "A top-3 pick — but not your best."
          : "Your best player isn't captained.",
  });

  // Bench cover.
  const benchStatus: CheckStatus =
    input.benchPoints >= 8 ? "good" : input.benchPoints >= 5 ? "ok" : "weak";
  checks.push({
    label: "Bench cover",
    status: benchStatus,
    detail: `Bench projects ${input.benchPoints.toFixed(1)} pts.`,
  });

  // Squad fitness / rotation risk.
  const riskStatus: CheckStatus =
    input.riskyCount === 0 ? "good" : input.riskyCount <= 2 ? "ok" : "weak";
  checks.push({
    label: "Squad fitness",
    status: riskStatus,
    detail:
      input.riskyCount === 0
        ? "No rotation or fitness worries."
        : `${input.riskyCount} starter${input.riskyCount === 1 ? "" : "s"} at risk.`,
  });

  // Optimisation headroom — a small best transfer means a well-built team.
  const gain = input.transferGain ?? 0;
  const optStatus: CheckStatus = gain < 0.5 ? "good" : gain < 1.5 ? "ok" : "weak";
  checks.push({
    label: "Optimisation",
    status: optStatus,
    detail:
      gain < 0.5
        ? "Hard to improve with one move."
        : `A transfer could add about +${gain.toFixed(1)} pts.`,
  });

  const score = Math.round(
    checks.reduce((s, c) => s + SCORE[c.status], 0) / checks.length,
  );
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";

  const topFix =
    optStatus === "weak"
      ? `Make a transfer — it could add about +${gain.toFixed(1)} pts.`
      : capStatus === "weak"
        ? "Move the armband to your best projected player."
        : riskStatus === "weak"
          ? "Replace a couple of injury/rotation risks."
          : null;

  return { score, grade, checks, topFix };
}
