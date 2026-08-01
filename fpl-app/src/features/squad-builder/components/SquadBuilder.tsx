import { useCallback } from "react";
import type { Player } from "@/features/fpl";
import { QueryBoundary, usePlayers, usePositions } from "@/features/fpl";
import { PlayerExplorer } from "@/features/player-explorer";
import { SectionCard } from "@/components/common";
import { useSquad } from "../useSquad";
import { ClubBreakdown } from "./ClubBreakdown";
import { SquadRoster } from "./SquadRoster";
import { SquadSummary } from "./SquadSummary";
import { SquadToggleButton } from "./SquadToggleButton";
import { ValidationPanel } from "./ValidationPanel";

/**
 * The full squad builder: a live summary/roster panel alongside the Player
 * Explorer, wired so a single click adds or removes a player. All rules are
 * enforced by {@link useSquad}, so illegal teams can't be assembled, and the
 * selection is persisted to localStorage.
 */
export function SquadBuilder() {
  const playersQuery = usePlayers();
  const positionsQuery = usePositions();
  const positions = positionsQuery.data ?? [];

  const squad = useSquad();

  const renderAction = useCallback(
    (player: Player) => (
      <SquadToggleButton
        player={player}
        selected={squad.isSelected(player.id)}
        addCheck={squad.canAddPlayer(player)}
        onToggle={squad.togglePlayer}
      />
    ),
    [squad],
  );

  return (
    <QueryBoundary
      isLoading={playersQuery.isLoading}
      isError={playersQuery.isError}
      error={playersQuery.error}
      onRetry={() => void playersQuery.refetch()}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]">
        {/* Live squad panel */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <SquadSummary
            squad={squad}
            positions={positions}
            onClear={squad.clear}
          />

          {(squad.issues.length > 0 || squad.isComplete) && (
            <SectionCard title="Validation">
              <ValidationPanel squad={squad} />
            </SectionCard>
          )}

          <SectionCard title="Clubs" description="Max 3 players per club.">
            <ClubBreakdown squad={squad} />
          </SectionCard>

          <SectionCard title="Your squad">
            <SquadRoster squad={squad} positions={positions} />
          </SectionCard>
        </aside>

        {/* Player picker */}
        <div>
          <PlayerExplorer renderAction={renderAction} />
        </div>
      </div>
    </QueryBoundary>
  );
}
