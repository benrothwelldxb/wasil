import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Re-show the install banner this long after a dismissal (14 days). */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

interface PwaState {
  /** Epoch ms the install banner was last dismissed, or null. */
  bannerDismissedAt: number | null;
  dismissBanner: () => void;
}

export const usePwaStore = create<PwaState>()(
  persist(
    (set) => ({
      bannerDismissedAt: null,
      dismissBanner: () => set({ bannerDismissedAt: Date.now() }),
    }),
    {
      name: "fpl-pwa-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Whether the install banner is currently snoozed by a recent dismissal. */
export function isBannerSnoozed(dismissedAt: number | null): boolean {
  if (dismissedAt === null) return false;
  return Date.now() - dismissedAt < SNOOZE_MS;
}
