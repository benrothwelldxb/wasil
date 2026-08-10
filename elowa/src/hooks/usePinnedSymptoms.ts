import { useMemo } from 'react';
import { useCurrentUser } from './queries';
import { findSymptom } from '@/data/catalog';
import type { Symptom } from '@/domain/models';

/**
 * Resolves the current user's pinned symptom ids to full `Symptom` objects.
 * Shared by the Today and Check-in screens so the derivation lives in one place.
 */
export function usePinnedSymptoms(): Symptom[] {
  const { data: user } = useCurrentUser();
  return useMemo(() => {
    return (user?.pinnedSymptomIds ?? [])
      .map((id) => findSymptom(id))
      .filter((s): s is Symptom => Boolean(s));
  }, [user?.pinnedSymptomIds]);
}
