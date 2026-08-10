/**
 * CheckInRepository — persistence for daily check-ins.
 *
 * Components never touch this directly; they go through query/mutation hooks.
 * One check-in per date (upsert replaces a same-date entry).
 */
import type { DailyCheckIn } from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

function read(): DailyCheckIn[] {
  return activeDriver().get<DailyCheckIn[]>(StorageKeys.checkIns) ?? [];
}

function write(list: DailyCheckIn[]): void {
  activeDriver().set(StorageKeys.checkIns, list);
}

export const checkInRepository = {
  list(): DailyCheckIn[] {
    return read().sort((a, b) => a.date.localeCompare(b.date));
  },

  getByDate(date: IsoDate): DailyCheckIn | null {
    return read().find((c) => c.date === date) ?? null;
  },

  /** Insert or replace the check-in for its date. */
  upsert(checkIn: DailyCheckIn): DailyCheckIn {
    const list = read().filter((c) => c.date !== checkIn.date && c.id !== checkIn.id);
    list.push(checkIn);
    write(list);
    return checkIn;
  },

  remove(id: string): void {
    write(read().filter((c) => c.id !== id));
  },

  removeByDate(date: IsoDate): void {
    write(read().filter((c) => c.date !== date));
  },

  replaceAll(list: DailyCheckIn[]): void {
    write(list);
  },

  clear(): void {
    write([]);
  },
};
