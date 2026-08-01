import { useMemo, type ReactNode } from "react";
import { SearchX } from "lucide-react";
import {
  type Player,
  QueryBoundary,
  usePlayers,
  usePositions,
  useTeams,
} from "@/features/fpl";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks";
import { getPriceBounds } from "../filtering";
import { usePlayerExplorer } from "../usePlayerExplorer";
import { PlayerCardList } from "./PlayerCardList";
import { PlayerFilters } from "./PlayerFilters";
import { PlayerTable } from "./PlayerTable";

interface PlayerExplorerProps {
  /**
   * Optional per-row action (e.g. an add/remove button). When provided it's
   * rendered as a leading control in the table and on each card.
   */
  renderAction?: (player: Player) => ReactNode;
}

/**
 * The complete Player Explorer: filter toolbar plus a responsive, virtualized
 * results view (data table on desktop, cards on mobile). All players come from
 * the shared bootstrap query, so mounting this adds no extra network requests.
 */
export function PlayerExplorer({ renderAction }: PlayerExplorerProps = {}) {
  const playersQuery = usePlayers();
  const teamsQuery = useTeams();
  const positionsQuery = usePositions();

  const allPlayers = useMemo(
    () => playersQuery.data ?? [],
    [playersQuery.data],
  );
  const teams = teamsQuery.data ?? [];
  const positions = positionsQuery.data ?? [];

  const priceBounds = useMemo(
    () => getPriceBounds(allPlayers),
    [allPlayers],
  );

  const explorer = usePlayerExplorer(allPlayers);
  const isMobile = useMediaQuery("(max-width: 767px)");

  return (
    <QueryBoundary
      isLoading={playersQuery.isLoading}
      isError={playersQuery.isError}
      error={playersQuery.error}
      isEmpty={playersQuery.isSuccess && allPlayers.length === 0}
      onRetry={() => void playersQuery.refetch()}
      emptyMessage="No players were returned by the FPL API."
    >
      <div className="space-y-4">
        <PlayerFilters
          explorer={explorer}
          teams={teams}
          positions={positions}
          priceBounds={priceBounds}
          resultCount={explorer.players.length}
          totalCount={allPlayers.length}
        />

        {explorer.players.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No players match your filters"
            description="Try widening the price range or clearing a filter."
            action={
              <Button variant="outline" size="sm" onClick={explorer.reset}>
                Reset filters
              </Button>
            }
          />
        ) : isMobile ? (
          <PlayerCardList
            players={explorer.players}
            renderAction={renderAction}
          />
        ) : (
          <PlayerTable
            players={explorer.players}
            sort={explorer.sort}
            onToggleSort={explorer.toggleSort}
            renderAction={renderAction}
          />
        )}
      </div>
    </QueryBoundary>
  );
}
