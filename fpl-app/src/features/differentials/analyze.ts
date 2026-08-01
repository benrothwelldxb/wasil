import type { Player } from "@/features/fpl";

export interface TemplateAnalysis {
  /** Your players owned by few others (points of difference), lowest first. */
  differentials: Player[];
  /** Popular "template" players you don't own, most-owned first. */
  missingTemplate: Player[];
}

/**
 * Compare a squad against the crowd using ownership:
 * - your differentials = your picks below `lowOwnership`%
 * - missing template = players above `highOwnership`% you don't own
 *
 * Pure and inspectable. Ownership is the only input — no AI.
 */
export function analyzeTemplate(
  squadIds: number[],
  allPlayers: Player[],
  {
    lowOwnership = 10,
    highOwnership = 30,
    missingLimit = 6,
  }: { lowOwnership?: number; highOwnership?: number; missingLimit?: number } = {},
): TemplateAnalysis {
  const owned = new Set(squadIds);
  const byId = new Map(allPlayers.map((p) => [p.id, p]));

  const differentials = squadIds
    .map((id) => byId.get(id))
    .filter(
      (p): p is Player => p !== undefined && p.selectedByPercent < lowOwnership,
    )
    .sort((a, b) => a.selectedByPercent - b.selectedByPercent);

  const missingTemplate = allPlayers
    .filter((p) => p.selectedByPercent >= highOwnership && !owned.has(p.id))
    .sort((a, b) => b.selectedByPercent - a.selectedByPercent)
    .slice(0, missingLimit);

  return { differentials, missingTemplate };
}
