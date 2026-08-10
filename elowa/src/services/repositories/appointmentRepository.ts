/**
 * AppointmentRepository — clinician appointment records (Phase 3) and the
 * report-archive metadata. Appointments are syncable records (id + updatedAt).
 */
import type { AppointmentRecord, ReportArchiveEntry } from '@/domain/models';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

function readAppts(): AppointmentRecord[] {
  return activeDriver().get<AppointmentRecord[]>(StorageKeys.appointments) ?? [];
}
function writeAppts(list: AppointmentRecord[]): void {
  activeDriver().set(StorageKeys.appointments, list);
}

export const appointmentRepository = {
  list(): AppointmentRecord[] {
    return readAppts().sort((a, b) => a.date.localeCompare(b.date));
  },
  get(id: string): AppointmentRecord | null {
    return readAppts().find((a) => a.id === id) ?? null;
  },
  upsert(record: AppointmentRecord): AppointmentRecord {
    writeAppts([...readAppts().filter((a) => a.id !== record.id), record]);
    return record;
  },
  remove(id: string): void {
    writeAppts(readAppts().filter((a) => a.id !== id));
  },
  replaceAll(list: AppointmentRecord[]): void {
    writeAppts(list);
  },

  // --- report archive ---
  listReports(): ReportArchiveEntry[] {
    return (activeDriver().get<ReportArchiveEntry[]>(StorageKeys.reportArchive) ?? []).sort((a, b) =>
      b.generatedAt.localeCompare(a.generatedAt),
    );
  },
  addReport(entry: ReportArchiveEntry): void {
    const list = activeDriver().get<ReportArchiveEntry[]>(StorageKeys.reportArchive) ?? [];
    activeDriver().set(StorageKeys.reportArchive, [entry, ...list].slice(0, 50));
  },
};
