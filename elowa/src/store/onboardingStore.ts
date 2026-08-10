import { create } from 'zustand';
import type { OnboardingReason } from '@/domain/models';

/**
 * Local-only onboarding state. The reason and the chosen symptoms conceptually
 * become the user's pinned daily symptoms. No persistence in Phase 0.
 */
interface OnboardingState {
  reason: OnboardingReason | null;
  selectedSymptomIds: string[];
  completed: boolean;

  setReason: (reason: OnboardingReason) => void;
  toggleSymptom: (symptomId: string) => void;
  complete: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  reason: null,
  selectedSymptomIds: ['sym_sleep', 'sym_mood', 'sym_hot_flushes'],
  completed: false,
  setReason: (reason) => set({ reason }),
  toggleSymptom: (symptomId) =>
    set((state) => ({
      selectedSymptomIds: state.selectedSymptomIds.includes(symptomId)
        ? state.selectedSymptomIds.filter((id) => id !== symptomId)
        : [...state.selectedSymptomIds, symptomId],
    })),
  complete: () => set({ completed: true }),
  reset: () => set({ reason: null, selectedSymptomIds: [], completed: false }),
}));
