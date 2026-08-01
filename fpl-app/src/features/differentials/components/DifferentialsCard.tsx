import { useMemo } from "react";
import { Sparkles, Users } from "lucide-react";
import { usePlayers } from "@/features/fpl";
import { useSquad } from "@/features/squad-builder";
import { PlayerAvatar } from "@/features/player-explorer";
import { SectionCard } from "@/components/common";
import { analyzeTemplate } from "../analyze";

/**
 * "You vs the template" — your low-owned differentials and the popular players
 * you're missing. Renders only for a complete squad.
 */
export function DifferentialsCard() {
  const squad = useSquad();
  const playersQuery = usePlayers();

  const analysis = useMemo(() => {
    if (!squad.isComplete || !playersQuery.data) return null;
    return analyzeTemplate(
      squad.players.map((p) => p.id),
      playersQuery.data,
    );
  }, [squad.isComplete, squad.players, playersQuery.data]);

  if (!analysis) return null;
  if (analysis.differentials.length === 0 && analysis.missingTemplate.length === 0) {
    return null;
  }

  return (
    <SectionCard title="You vs the template" className="mt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Your differentials
          </div>
          {analysis.differentials.length > 0 ? (
            <ul className="space-y-1.5">
              {analysis.differentials.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <PlayerAvatar
                    photoUrl={p.photoUrl}
                    name={p.webName}
                    size={26}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.webName}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.selectedByPercent.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              You're on the template — no low-owned picks.
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Template you're missing
          </div>
          {analysis.missingTemplate.length > 0 ? (
            <ul className="space-y-1.5">
              {analysis.missingTemplate.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <PlayerAvatar
                    photoUrl={p.photoUrl}
                    name={p.webName}
                    size={26}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.webName}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.selectedByPercent.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              You own every popular pick.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
