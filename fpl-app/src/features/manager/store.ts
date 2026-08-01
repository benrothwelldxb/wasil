import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ManagerState {
  /** The connected FPL Manager ID, or null if none. */
  managerId: number | null;
  /** Cached display name (so the greeting shows instantly before a refetch). */
  managerName: string | null;
  teamName: string | null;
  connect: (id: number, managerName: string, teamName: string) => void;
  disconnect: () => void;
}

/**
 * Remembers the user's connected FPL Manager ID (and cached name) so their real
 * team re-syncs on every visit and the dashboard can greet them by name.
 */
export const useManagerStore = create<ManagerState>()(
  persist(
    (set) => ({
      managerId: null,
      managerName: null,
      teamName: null,
      connect: (managerId, managerName, teamName) =>
        set({ managerId, managerName, teamName }),
      disconnect: () =>
        set({ managerId: null, managerName: null, teamName: null }),
    }),
    {
      name: "fpl-manager-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
