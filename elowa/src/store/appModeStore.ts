import { create } from 'zustand';
import { getDataMode, type DataMode } from '@/services/storage/dataContext';

/**
 * Reactive mirror of the active data mode (real vs demo) so the UI can show a
 * demo banner and re-render on switch. The source of truth is `dataContext`.
 */
interface AppModeState {
  mode: DataMode;
  setModeState: (mode: DataMode) => void;
}

export const useAppModeStore = create<AppModeState>((set) => ({
  mode: getDataMode(),
  setModeState: (mode) => set({ mode }),
}));
