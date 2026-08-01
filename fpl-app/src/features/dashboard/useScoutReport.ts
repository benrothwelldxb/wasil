import { useMemo } from "react";
import type { Player } from "@/features/fpl";
import { useBootstrap } from "@/features/fpl";
import { usePredictions } from "@/features/predictions";
import { useFixtureAnalysis, useGameweekCalendar } from "@/features/fixtures";
import { useSquad } from "@/features/squad-builder";
import { useOptimiser } from "@/features/optimiser";
import type { OptiPlayer } from "@/features/optimiser";
import { autoPickLineup, projectLineup } from "@/features/lineup";
import { bestSingle, useTransferSettings } from "@/features/transfers";
import type { TeamCardData, TeamCardPlayer } from "@/features/share";
import { generateInsights, type Insight } from "./insights";
import {
  evaluateChips,
  upcomingChipTargets,
  type ChipAdvice,
  type ChipOutlook,
} from "./chips";

/** "This week" — the scout report headline horizon. */
const WINDOW = 1 as const;

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export interface ScoutReport {
  isLoading: boolean;
  hasTeam: boolean;
  /** Whether the team shown is the user's saved squad or a suggestion. */
  source: "yours" | "suggested";
  greeting: string;
  gameweek: number | null;
  projectedPoints: number;
  captain: Player | null;
  /** The starting XI. */
  starters: Player[];
  captainId: number | null;
  /** £m. */
  squadValue: number;
  /** £m. */
  bank: number;
  insights: Insight[];
  /** Everything the shareable team card needs, or null when there's no team. */
  card: TeamCardData | null;
  /** Chip suggestions worth surfacing this week (empty = hold your chips). */
  chips: ChipAdvice[];
  /** Forward-looking heads-up about upcoming blank/double gameweeks. */
  chipOutlook: ChipOutlook[];
  /** Player ids of the 15-man squad (for "use this team"). */
  teamIds: number[];
}

/**
 * Assembles the home-screen "personal scout report": the user's saved team
 * (or a suggested one), its projected points and captain, squad value/bank,
 * and the proactive insights a manager should see on arrival.
 */
export function useScoutReport(): ScoutReport {
  const { predictions, byId, isLoading } = usePredictions();
  const bootstrap = useBootstrap();
  const { analysis } = useFixtureAnalysis();
  const { calendar } = useGameweekCalendar();
  const squad = useSquad();
  const optimiser = useOptimiser();
  const freeTransfers = useTransferSettings((s) => s.freeTransfers);

  return useMemo<ScoutReport>(() => {
    const greeting = greetingFor(new Date().getHours());
    const gameweek =
      bootstrap.data?.nextEventId ?? bootstrap.data?.currentEventId ?? null;

    // Forward-looking chip planning is calendar-only — available even without
    // a team yet, so plan for upcoming blank/double gameweeks regardless.
    const chipOutlook = upcomingChipTargets(calendar, gameweek);

    // Decide which team to report on: the saved squad, else a suggestion.
    let team15: Player[] = [];
    let bankTenths = 0;
    let source: "yours" | "suggested" = "suggested";

    if (squad.isComplete && squad.players.length === 15) {
      team15 = squad.players;
      bankTenths = squad.remainingTenths;
      source = "yours";
    } else if (optimiser.result) {
      team15 = optimiser.result.squad.map((p) => p.player);
      bankTenths = optimiser.result.remaining;
      source = "suggested";
    }

    const empty: ScoutReport = {
      isLoading,
      hasTeam: false,
      source,
      greeting,
      gameweek,
      projectedPoints: 0,
      captain: null,
      starters: [],
      captainId: null,
      squadValue: 0,
      bank: bankTenths / 10,
      insights: [],
      card: null,
      chips: [],
      chipOutlook,
      teamIds: [],
    };
    if (team15.length !== 15) return empty;

    const valueOf = (p: Player) =>
      byId.get(p.id)?.windows[WINDOW].expectedPoints ?? 0;

    // Best XI + captain for the week.
    const lite = team15.map((p) => ({
      id: p.id,
      positionId: p.positionId,
      value: valueOf(p),
    }));
    const lineup = autoPickLineup(lite);
    const liteById = new Map(lite.map((l) => [l.id, l]));
    const projectedPoints = projectLineup(lineup, liteById).total;

    const teamById = new Map(team15.map((p) => [p.id, p]));
    const starters = lineup.starterIds
      .map((id) => teamById.get(id))
      .filter((p): p is Player => p !== undefined);
    const captain = lineup.captainId
      ? (teamById.get(lineup.captainId) ?? null)
      : null;

    const squadValueTenths = team15.reduce((s, p) => s + p.price.nowRaw, 0);

    // Best single transfer (only for the saved squad).
    let transferGain: number | null = null;
    if (source === "yours" && predictions.length > 0) {
      const current: OptiPlayer[] = [];
      let ok = true;
      for (const p of team15) {
        const pred = byId.get(p.id);
        if (!pred) {
          ok = false;
          break;
        }
        current.push({
          id: p.id,
          positionId: p.positionId,
          teamId: p.teamId,
          cost: p.price.nowRaw,
          value: valueOf(p),
          player: p,
          prediction: pred,
        });
      }
      if (ok) {
        const market: OptiPlayer[] = predictions
          .map((pred) => ({
            id: pred.playerId,
            positionId: pred.player.positionId,
            teamId: pred.player.teamId,
            cost: pred.player.price.nowRaw,
            value: pred.windows[WINDOW].expectedPoints,
            player: pred.player,
            prediction: pred,
          }))
          .filter((p) => p.cost > 0);
        transferGain =
          bestSingle(current, market, bankTenths, freeTransfers, WINDOW)?.net ??
          null;
      }
    }

    const benchIds = [
      ...(lineup.benchGkId !== null ? [lineup.benchGkId] : []),
      ...lineup.benchOutfieldIds,
    ];
    const chips = evaluateChips({
      squad: team15,
      starterIds: lineup.starterIds,
      benchIds,
      captainId: lineup.captainId,
      predictionById: byId,
      window: WINDOW,
      source,
    });

    const insights = generateInsights({
      starters,
      predictionById: byId,
      fixtures: analysis,
      captain,
      captainValue: captain ? valueOf(captain) : 0,
      marketValues: predictions.map((p) => p.windows[WINDOW].expectedPoints),
      transferGain,
      source,
    });

    // Shareable team card.
    const toCardPlayer = (p: Player): TeamCardPlayer => ({
      name: p.webName,
      positionId: p.positionId,
      points: valueOf(p),
      isCaptain: p.id === lineup.captainId,
      isVice: p.id === lineup.viceId,
    });
    const countPos = (pid: number) =>
      starters.filter((p) => p.positionId === pid).length;
    const benchPlayers = benchIds
      .map((id) => teamById.get(id))
      .filter((p): p is Player => p !== undefined);
    const card: TeamCardData = {
      gameweek,
      projectedPoints,
      formation: `${countPos(2)}-${countPos(3)}-${countPos(4)}`,
      starters: starters.map(toCardPlayer),
      bench: benchPlayers.map(toCardPlayer),
      captainName: captain?.webName ?? null,
      squadValue: squadValueTenths / 10,
      bank: bankTenths / 10,
      source,
    };

    return {
      isLoading,
      hasTeam: true,
      source,
      greeting,
      gameweek,
      projectedPoints,
      captain,
      starters,
      captainId: lineup.captainId,
      squadValue: squadValueTenths / 10,
      bank: bankTenths / 10,
      insights,
      card,
      chips,
      chipOutlook,
      teamIds: team15.map((p) => p.id),
    };
  }, [
    predictions,
    byId,
    bootstrap.data,
    analysis,
    calendar,
    squad.isComplete,
    squad.players,
    squad.remainingTenths,
    optimiser.result,
    freeTransfers,
    isLoading,
  ]);
}
