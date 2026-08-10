import type { User } from '@/domain/models';

/**
 * The single fictional Phase 0 user. All screens read from this.
 * "Today" for the mock dataset is anchored to a fixed date so the seeded
 * history and insights always line up deterministically (see history.ts).
 */
export const MOCK_TODAY = '2026-05-22';

export const MOCK_USER: User = {
  id: 'user_emma',
  displayName: 'Emma',
  age: 47,
  pinnedSymptomIds: [
    'sym_sleep',
    'sym_mood',
    'sym_energy',
    'sym_hot_flushes',
    'sym_pain',
    'sym_bloating',
  ],
  onboardingReason: 'poor_sleep',
  preferences: {
    reminderTime: '21:00',
    remindersEnabled: true,
    cycleTrackingEnabled: true,
  },
  createdAt: '2026-03-01',
};
