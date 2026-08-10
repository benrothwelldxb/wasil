import { create } from 'zustand';
import type { RelativeStatus, Severity } from '@/domain/models';

/**
 * Ephemeral draft state for an in-progress "something feels different" check-in.
 * Persisted to storage only when the user saves (via a mutation). elowa's
 * primary signal is the relative `status`; `severity` is optional detail.
 */
export interface DraftObservation {
  status?: RelativeStatus;
  severity?: Severity;
}

interface CheckInDraftState {
  observations: Record<string, DraftObservation>;
  contextTagIds: string[];
  note: string;

  setStatus: (symptomId: string, status: RelativeStatus) => void;
  setSeverity: (symptomId: string, severity: Severity) => void;
  clearSymptom: (symptomId: string) => void;
  toggleContextTag: (tagId: string) => void;
  setNote: (text: string) => void;
  reset: () => void;
}

export const useCheckInDraft = create<CheckInDraftState>((set) => ({
  observations: {},
  contextTagIds: [],
  note: '',

  setStatus: (symptomId, status) =>
    set((s) => ({
      observations: { ...s.observations, [symptomId]: { ...s.observations[symptomId], status } },
    })),
  setSeverity: (symptomId, severity) =>
    set((s) => ({
      observations: { ...s.observations, [symptomId]: { ...s.observations[symptomId], severity } },
    })),
  clearSymptom: (symptomId) =>
    set((s) => {
      const next = { ...s.observations };
      delete next[symptomId];
      return { observations: next };
    }),
  toggleContextTag: (tagId) =>
    set((s) => ({
      contextTagIds: s.contextTagIds.includes(tagId)
        ? s.contextTagIds.filter((id) => id !== tagId)
        : [...s.contextTagIds, tagId],
    })),
  setNote: (text) => set({ note: text }),
  reset: () => set({ observations: {}, contextTagIds: [], note: '' }),
}));
