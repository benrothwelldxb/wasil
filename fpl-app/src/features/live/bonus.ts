import type { FplFixtureRaw } from "@/features/fpl";

/**
 * Provisional bonus points for an in-progress gameweek.
 *
 * The live endpoint only adds bonus once a fixture is finalised, so for
 * fixtures that have started but aren't finished we compute bonus ourselves
 * from the Bonus Points System (bps): the top three distinct bps values in a
 * fixture earn 3 / 2 / 1, and ties share the higher award (standard FPL rule).
 *
 * Returns player id → provisional bonus. Pure and inspectable.
 */
export function computeProvisionalBonus(
  fixtures: FplFixtureRaw[],
  event: number,
): Map<number, number> {
  const bonus = new Map<number, number>();

  for (const fx of fixtures) {
    if (fx.event !== event) continue;
    // Bonus is already baked into live points once a fixture is finished.
    if (!fx.started || fx.finished) continue;

    const bpsStat = fx.stats.find((s) => s.identifier === "bps");
    if (!bpsStat) continue;

    const entries = [...bpsStat.h, ...bpsStat.a];
    if (entries.length === 0) continue;

    // Distinct bps values, highest first → 3 / 2 / 1 for the top three.
    const ranked = [...new Set(entries.map((e) => e.value))].sort(
      (a, b) => b - a,
    );
    const award = new Map<number, number>();
    if (ranked[0] !== undefined) award.set(ranked[0], 3);
    if (ranked[1] !== undefined) award.set(ranked[1], 2);
    if (ranked[2] !== undefined) award.set(ranked[2], 1);

    for (const e of entries) {
      const points = award.get(e.value);
      if (points) bonus.set(e.element, points);
    }
  }

  return bonus;
}
