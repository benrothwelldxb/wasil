import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchManagerTeam, type ManagerTeam } from "@/features/fpl";
import { useSquadStore } from "@/features/squad-builder";
import type { ApiError } from "@/services/api";
import { useManagerStore } from "./store";

export interface UseManagerTeamResult {
  team: ManagerTeam | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | Error | null;
}

/**
 * Fetches the connected manager's real team (when a Manager ID is stored) and
 * keeps the app's saved squad in sync with it. Re-syncs once per distinct
 * gameweek/squad so it never fights a manual edit within a session.
 *
 * Mount once, high in the tree (the app shell).
 */
export function useManagerTeam(): UseManagerTeamResult {
  const managerId = useManagerStore((s) => s.managerId);
  const connect = useManagerStore((s) => s.connect);
  const setPlayers = useSquadStore((s) => s.setPlayers);
  const lastSynced = useRef<string | null>(null);

  const query = useQuery<ManagerTeam, ApiError | Error>({
    queryKey: ["manager-team", managerId],
    queryFn: ({ signal }) => fetchManagerTeam(managerId as number, signal),
    enabled: managerId !== null,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const team = query.data;
  useEffect(() => {
    if (!team) return;
    // Only apply when the real team actually changes, so within-session manual
    // tweaks aren't clobbered on every background refetch.
    const signature = `${team.entryId}:${team.gameweek}:${team.playerIds.join(",")}`;
    if (lastSynced.current === signature) return;
    lastSynced.current = signature;
    setPlayers(team.playerIds);
    connect(team.entryId, team.managerName, team.teamName);
  }, [team, setPlayers, connect]);

  return {
    team,
    isLoading: query.isLoading && managerId !== null,
    isError: query.isError,
    error: query.error,
  };
}
