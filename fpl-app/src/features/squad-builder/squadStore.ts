import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Persistent store of selected player ids.
 *
 * The store deliberately holds only ids — player details (price, position,
 * club) live in the TanStack Query cache and are resolved on demand. This
 * keeps the persisted payload tiny and always consistent with current data.
 *
 * Rule enforcement happens in the `useSquad` hook (which has access to player
 * data); this store is intentionally a dumb id list.
 */
export interface SquadStore {
  playerIds: number[];
  add: (id: number) => void;
  remove: (id: number) => void;
  /** Replace the whole squad at once (e.g. "use this optimised team"). */
  setPlayers: (ids: number[]) => void;
  clear: () => void;
  has: (id: number) => boolean;
}

export const useSquadStore = create<SquadStore>()(
  persist(
    (set, get) => ({
      playerIds: [],
      add: (id) =>
        set((state) =>
          state.playerIds.includes(id)
            ? state
            : { playerIds: [...state.playerIds, id] },
        ),
      remove: (id) =>
        set((state) => ({
          playerIds: state.playerIds.filter((x) => x !== id),
        })),
      setPlayers: (ids) => set({ playerIds: [...ids] }),
      clear: () => set({ playerIds: [] }),
      has: (id) => get().playerIds.includes(id),
    }),
    {
      name: "fpl-squad-storage",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
