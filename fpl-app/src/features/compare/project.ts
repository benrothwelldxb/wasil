import type { Player } from "@/features/fpl";
import type { PlayerPrediction } from "@/features/predictions";
import { autoPickLineup, projectLineup } from "@/features/lineup";
import type { CompareSummary } from "@/features/share";

const WINDOW = 1 as const;

/**
 * Project a 15-man squad into head-to-head compare numbers, using the same
 * best-XI + captain method for both teams so the comparison is fair.
 */
export function projectSquad(
  meta: { managerName: string; teamName: string },
  playerIds: number[],
  byId: Map<number, PlayerPrediction>,
  playersById: Map<number, Player>,
): CompareSummary {
  const pts = (id: number) => byId.get(id)?.windows[WINDOW].expectedPoints ?? 0;
  const lite = playerIds.map((id) => ({
    id,
    positionId: playersById.get(id)?.positionId ?? 0,
    value: pts(id),
  }));
  const lineup = autoPickLineup(lite);
  const liteById = new Map(lite.map((l) => [l.id, l]));
  const projectedPoints = projectLineup(lineup, liteById).total;
  const posCount = (pid: number) =>
    lineup.starterIds.filter((id) => playersById.get(id)?.positionId === pid)
      .length;
  const squadValueTenths = playerIds.reduce(
    (s, id) => s + (playersById.get(id)?.price.nowRaw ?? 0),
    0,
  );

  return {
    managerName: meta.managerName,
    teamName: meta.teamName,
    projectedPoints,
    captainName:
      lineup.captainId !== null
        ? (playersById.get(lineup.captainId)?.webName ?? null)
        : null,
    formation: `${posCount(2)}-${posCount(3)}-${posCount(4)}`,
    squadValue: squadValueTenths / 10,
  };
}
