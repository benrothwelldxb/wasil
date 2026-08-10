/**
 * TreatmentRepository — persistence for treatment / intervention events the
 * user reports (HRT, medication, supplement, lifestyle, other).
 */
import type { TreatmentEvent } from '@/domain/models';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

function read(): TreatmentEvent[] {
  return activeDriver().get<TreatmentEvent[]>(StorageKeys.treatments) ?? [];
}

function write(list: TreatmentEvent[]): void {
  activeDriver().set(StorageKeys.treatments, list);
}

export const treatmentRepository = {
  list(): TreatmentEvent[] {
    return read().sort((a, b) => a.date.localeCompare(b.date));
  },

  upsert(event: TreatmentEvent): TreatmentEvent {
    const list = read().filter((t) => t.id !== event.id);
    list.push(event);
    write(list);
    return event;
  },

  remove(id: string): void {
    write(read().filter((t) => t.id !== id));
  },

  replaceAll(list: TreatmentEvent[]): void {
    write(list);
  },

  clear(): void {
    write([]);
  },
};
