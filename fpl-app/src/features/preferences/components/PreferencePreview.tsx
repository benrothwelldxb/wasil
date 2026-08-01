import { useMemo } from "react";
import { usePlayers } from "@/features/fpl";
import { useFixtureAnalysis } from "@/features/fixtures";
import { SectionCard } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/features/player-explorer";
import { usePreferenceService } from "../usePreferences";
import { PreferenceInfluenceList } from "./PreferenceInfluenceList";

const SAMPLE_SIZE = 6;

/**
 * A live demonstration of the PreferenceService: it runs the active profile
 * over a sample of players and shows how their scores shift and *why*.
 *
 * It uses each player's season points as a stand-in "base score" purely to
 * illustrate the engine — there is no optimisation here, just reweighting +
 * transparency, exactly as future engines will consume it.
 */
export function PreferencePreview() {
  const { data: players, isLoading } = usePlayers();
  const { analysis } = useFixtureAnalysis();
  const service = usePreferenceService();

  const previews = useMemo(() => {
    if (!players) return [];
    const top = [...players]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, SAMPLE_SIZE);
    return top.map((player) => {
      // Supply a real fixture signal so fixture-led preferences engage —
      // exactly how a future optimiser feeds projections to the service.
      const window = analysis.get(player.teamId)?.next5;
      const fixture =
        window && window.games > 0 ? window.rating / 100 : null;
      return service.adjustPlayerScore(player, player.totalPoints || 1, {
        signals: { fixture },
      });
    });
  }, [players, analysis, service]);

  return (
    <SectionCard
      title="Preference impact preview"
      description="How the active profile reweights a sample of players (base = season points). Illustrative only — no optimisation yet."
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {previews.map((result) => {
            const player = players?.find((p) => p.id === result.playerId);
            if (!player) return null;
            const positive = result.totalDeltaPercent >= 0;
            return (
              <li
                key={result.playerId}
                className="rounded-lg border p-3"
              >
                <div className="flex items-center gap-2.5">
                  <PlayerAvatar
                    photoUrl={player.photoUrl}
                    name={player.webName}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {player.webName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {player.teamShortName} · {player.positionShortName}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="tabular-nums text-muted-foreground">
                      {result.baseScore.toFixed(0)} →{" "}
                      <span className="font-semibold text-foreground">
                        {result.adjustedScore.toFixed(1)}
                      </span>
                    </div>
                    <div
                      className={
                        positive ? "text-xs text-success" : "text-xs text-destructive"
                      }
                    >
                      {positive ? "+" : ""}
                      {result.totalDeltaPercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
                {result.adjustments.length > 0 && (
                  <div className="mt-2.5 border-t pt-2.5">
                    <PreferenceInfluenceList adjustments={result.adjustments} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
