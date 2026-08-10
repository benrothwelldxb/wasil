import type { DailyCheckIn, SymptomObservation } from '@/domain/models';
import type { DraftObservation } from '@/store/checkInDraftStore';
import type { IsoDate } from '@/lib/date';
import { makeId } from '@/lib/id';

/** Build a plain "today feels normal" check-in. */
export function buildNormalCheckIn(
  date: IsoDate,
  contextTagIds: string[],
  note: string,
): DailyCheckIn {
  const now = new Date().toISOString();
  return {
    id: makeId('checkin'),
    date,
    kind: 'normal',
    feltNormal: true,
    observations: [],
    contextTagIds,
    ...(note.trim() ? { note: note.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

/** Build a detailed "something feels different" check-in from draft observations. */
export function buildDetailedCheckIn(
  date: IsoDate,
  observations: Record<string, DraftObservation>,
  contextTagIds: string[],
  note: string,
): DailyCheckIn {
  const now = new Date().toISOString();
  const obs: SymptomObservation[] = Object.entries(observations)
    .filter(([, v]) => v.status !== undefined || v.severity !== undefined)
    .map(([symptomId, v]) => ({
      symptomId,
      ...(v.status ? { status: v.status } : {}),
      ...(v.severity ? { severity: v.severity } : {}),
    }));
  return {
    id: makeId('checkin'),
    date,
    kind: 'detailed',
    feltNormal: false,
    observations: obs,
    contextTagIds,
    ...(note.trim() ? { note: note.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
}
