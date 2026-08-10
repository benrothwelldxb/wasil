/**
 * CycleRepository — persistence for recorded period days. Cycles themselves are
 * derived (not stored) by the cycle analysis engine.
 */
import type { PeriodEntry } from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

function read(): PeriodEntry[] {
  return activeDriver().get<PeriodEntry[]>(StorageKeys.periods) ?? [];
}

function write(list: PeriodEntry[]): void {
  activeDriver().set(StorageKeys.periods, list);
}

export const cycleRepository = {
  listPeriods(): PeriodEntry[] {
    return read().sort((a, b) => a.date.localeCompare(b.date));
  },

  getByDate(date: IsoDate): PeriodEntry | null {
    return read().find((p) => p.date === date) ?? null;
  },

  upsertPeriod(entry: PeriodEntry): PeriodEntry {
    // Always advance updatedAt so sync's last-write-wins can order this edit.
    const stamped: PeriodEntry = { ...entry, updatedAt: new Date().toISOString() };
    const list = read().filter((p) => p.date !== stamped.date && p.id !== stamped.id);
    list.push(stamped);
    write(list);
    return stamped;
  },

  removeByDate(date: IsoDate): void {
    write(read().filter((p) => p.date !== date));
  },

  replaceAll(list: PeriodEntry[]): void {
    write(list);
  },

  clear(): void {
    write([]);
  },
};
