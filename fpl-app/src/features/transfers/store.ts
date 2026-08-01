import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** FPL currently lets managers bank up to 5 free transfers. */
export const MAX_FREE_TRANSFERS = 5;
export const TRANSFER_HIT_COST = 4;

interface TransferSettings {
  /** Free transfers available this gameweek. */
  freeTransfers: number;
  setFreeTransfers: (n: number) => void;
}

export const useTransferSettings = create<TransferSettings>()(
  persist(
    (set) => ({
      freeTransfers: 1,
      setFreeTransfers: (n) =>
        set({ freeTransfers: Math.max(1, Math.min(MAX_FREE_TRANSFERS, n)) }),
    }),
    {
      name: "fpl-transfer-settings",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
