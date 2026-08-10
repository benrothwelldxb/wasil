import { create } from 'zustand';
import type { Severity, WellbeingLevel } from '@/domain/models';

/**
 * Ephemeral draft state for the in-progress daily check-in.
 *
 * Phase 0 keeps this purely in memory (no persistence, no backend). It exists
 * so the Check-in flow feels real and to model where a future "submit check-in"
 * mutation will read from.
 */
interface CheckInDraftState {
  wellbeing: WellbeingLevel | null;
  severities: Record<string, Severity>; // symptomId -> severity
  contextTagIds: string[];
  note: string;
  flaggedUnusual: boolean;

  setWellbeing: (value: WellbeingLevel) => void;
  setSeverity: (symptomId: string, value: Severity) => void;
  toggleContextTag: (tagId: string) => void;
  setNote: (text: string) => void;
  toggleFlaggedUnusual: () => void;
  reset: () => void;
}

const initialState = {
  wellbeing: null as WellbeingLevel | null,
  severities: {} as Record<string, Severity>,
  contextTagIds: [] as string[],
  note: '',
  flaggedUnusual: false,
};

export const useCheckInDraft = create<CheckInDraftState>((set) => ({
  ...initialState,
  setWellbeing: (value) => set({ wellbeing: value }),
  setSeverity: (symptomId, value) =>
    set((state) => ({ severities: { ...state.severities, [symptomId]: value } })),
  toggleContextTag: (tagId) =>
    set((state) => ({
      contextTagIds: state.contextTagIds.includes(tagId)
        ? state.contextTagIds.filter((id) => id !== tagId)
        : [...state.contextTagIds, tagId],
    })),
  setNote: (text) => set({ note: text }),
  toggleFlaggedUnusual: () => set((state) => ({ flaggedUnusual: !state.flaggedUnusual })),
  reset: () => set({ ...initialState, severities: {}, contextTagIds: [] }),
}));
