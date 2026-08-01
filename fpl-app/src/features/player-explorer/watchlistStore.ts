import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface WatchlistState {
  ids: number[];
  toggle: (id: number) => void;
  has: (id: number) => boolean;
  clear: () => void;
}

/** A persisted list of player ids the user is keeping an eye on. */
export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id)
            ? s.ids.filter((x) => x !== id)
            : [...s.ids, id],
        })),
      has: (id) => get().ids.includes(id),
      clear: () => set({ ids: [] }),
    }),
    {
      name: "fpl-watchlist-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
