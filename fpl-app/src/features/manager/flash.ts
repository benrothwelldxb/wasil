import { create } from "zustand";

interface FlashState {
  /** Set briefly right after an import so the dashboard can greet the result. */
  justImported: boolean;
  flagImported: () => void;
  clear: () => void;
}

/**
 * Ephemeral (non-persisted) signal that a team was *just* imported, so the
 * "your team vs optimal" payoff can auto-reveal on arrival at the dashboard —
 * once, without nagging on every future visit.
 */
export const useImportFlash = create<FlashState>((set) => ({
  justImported: false,
  flagImported: () => set({ justImported: true }),
  clear: () => set({ justImported: false }),
}));
