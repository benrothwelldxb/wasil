import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ThemeMode } from "@/types";

/** Shape of the global application store. */
export interface AppState {
  /** Current theme mode (persisted). */
  theme: ThemeMode;
  /** Whether the sidebar / mobile navigation is open. */
  sidebarOpen: boolean;
  /** Global, app-level loading flag (e.g. for full-page transitions). */
  isLoading: boolean;

  /** Set the theme mode. */
  setTheme: (theme: ThemeMode) => void;
  /** Open or close the sidebar. */
  setSidebarOpen: (open: boolean) => void;
  /** Toggle the sidebar open state. */
  toggleSidebar: () => void;
  /** Set the global loading flag. */
  setLoading: (loading: boolean) => void;
}

/**
 * The global app store.
 *
 * Only cross-cutting UI concerns live here (theme, layout, loading). Feature
 * and server state are handled by their own stores / TanStack Query — this
 * store deliberately contains no FPL domain state.
 *
 * The `theme` slice is persisted to localStorage so the user's preference
 * survives reloads; transient UI flags (`sidebarOpen`, `isLoading`) are not.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "system",
      sidebarOpen: false,
      isLoading: false,

      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: "fpl-app-storage",
      storage: createJSONStorage(() => localStorage),
      // Only persist the theme; layout / loading flags are transient.
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
