import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ManagerState {
  /** The connected FPL Manager ID, or null if none. */
  managerId: number | null;
  /** Cached imported name (from the FPL account). */
  managerName: string | null;
  teamName: string | null;
  /** A name the user typed themselves (takes priority in the greeting). */
  displayName: string | null;
  connect: (id: number, managerName: string, teamName: string) => void;
  disconnect: () => void;
  setDisplayName: (name: string | null) => void;
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
      displayName: null,
      connect: (managerId, managerName, teamName) =>
        set({ managerId, managerName, teamName }),
      disconnect: () =>
        set({ managerId: null, managerName: null, teamName: null }),
      setDisplayName: (displayName) =>
        set({ displayName: displayName?.trim() || null }),
    }),
    {
      name: "fpl-manager-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
