/**
 * HealthRepository — persistence for passive health samples and the granted
 * permission state. Providers read/write through here; the domain layer reads
 * samples for analysis.
 */
import type { HealthDaySample, HealthMetricKind, HealthPermission } from '@/domain/models';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

function readSamples(): HealthDaySample[] {
  return activeDriver().get<HealthDaySample[]>(StorageKeys.healthSamples) ?? [];
}

function writeSamples(list: HealthDaySample[]): void {
  activeDriver().set(StorageKeys.healthSamples, list);
}

export const healthRepository = {
  listSamples(): HealthDaySample[] {
    return readSamples().sort((a, b) => a.date.localeCompare(b.date));
  },

  /** Merge samples by date (new fields override). */
  upsertSamples(samples: HealthDaySample[]): void {
    const byDate = new Map(readSamples().map((s) => [s.date, s]));
    for (const s of samples) byDate.set(s.date, { ...byDate.get(s.date), ...s });
    writeSamples([...byDate.values()]);
  },

  replaceAll(list: HealthDaySample[]): void {
    writeSamples(list);
  },

  getPermissions(): HealthPermission[] {
    return activeDriver().get<HealthPermission[]>(StorageKeys.healthPermissions) ?? [];
  },

  setPermissions(perms: HealthPermission[]): void {
    activeDriver().set(StorageKeys.healthPermissions, perms);
  },

  isGranted(kind: HealthMetricKind): boolean {
    return this.getPermissions().some((p) => p.kind === kind && p.granted);
  },

  clear(): void {
    writeSamples([]);
    activeDriver().set(StorageKeys.healthPermissions, []);
  },
};
