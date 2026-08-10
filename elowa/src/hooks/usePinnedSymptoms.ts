import { useMemo } from 'react';
import { useAllSymptoms, useCurrentUser } from './queries';
import type { Symptom } from '@/domain/models';

/**
 * Resolves the current user's pinned symptom ids to full `Symptom` objects
 * (including any custom symptoms). Shared by Today, Check-in and onboarding.
 */
export function usePinnedSymptoms(): Symptom[] {
  const { data: user } = useCurrentUser();
  const { data: symptoms } = useAllSymptoms();
  return useMemo(() => {
    const byId = new Map((symptoms ?? []).map((s) => [s.id, s]));
    return (user?.pinnedSymptomIds ?? [])
      .map((id) => byId.get(id))
      .filter((s): s is Symptom => Boolean(s));
  }, [user?.pinnedSymptomIds, symptoms]);
}
