import { create } from 'zustand';
import type { OnboardingReason } from '@/domain/models';
import { DEFAULT_PINNED_SYMPTOM_IDS } from '@/data/catalog';

/**
 * Local-only onboarding state. Selections are persisted to the repositories
 * when the user completes onboarding. Reasons are multi-select; pinned symptoms
 * become the user's daily focus (target 3–7).
 */
interface OnboardingState {
  reasons: OnboardingReason[];
  selectedSymptomIds: string[];

  toggleReason: (reason: OnboardingReason) => void;
  toggleSymptom: (symptomId: string) => void;
  addSymptom: (symptomId: string) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  reasons: [],
  selectedSymptomIds: [...DEFAULT_PINNED_SYMPTOM_IDS],

  toggleReason: (reason) =>
    set((s) => ({
      reasons: s.reasons.includes(reason)
        ? s.reasons.filter((r) => r !== reason)
        : [...s.reasons, reason],
    })),
  toggleSymptom: (symptomId) =>
    set((s) => ({
      selectedSymptomIds: s.selectedSymptomIds.includes(symptomId)
        ? s.selectedSymptomIds.filter((id) => id !== symptomId)
        : [...s.selectedSymptomIds, symptomId],
    })),
  addSymptom: (symptomId) =>
    set((s) => ({
      selectedSymptomIds: s.selectedSymptomIds.includes(symptomId)
        ? s.selectedSymptomIds
        : [...s.selectedSymptomIds, symptomId],
    })),
  reset: () => set({ reasons: [], selectedSymptomIds: [...DEFAULT_PINNED_SYMPTOM_IDS] }),
}));
