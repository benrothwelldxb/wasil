/**
 * Whole-dataset operations: export and delete. These operate on the ACTIVE data
 * context (real vs demo) so a user can only ever export/delete the data they
 * are currently looking at.
 */
import type { ExportBundle } from '@/domain/models';
import { SCHEMA_VERSION } from './storage/namespace';
import { clearMode, getDataMode } from './storage/dataContext';
import {
  checkInRepository,
  cycleRepository,
  preferencesRepository,
  symptomRepository,
  treatmentRepository,
} from './repositories';

/** Assemble a full export bundle from the active data context. */
export function buildExportBundle(now: string): ExportBundle {
  return {
    app: 'elowa',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    data: {
      profile: preferencesRepository.getProfile(),
      preferences: preferencesRepository.getPreferences(),
      onboardingReasons: preferencesRepository.getOnboardingReasons(),
      tracking: symptomRepository.getConfig(),
      checkIns: checkInRepository.list(),
      periods: cycleRepository.listPeriods(),
      treatments: treatmentRepository.list(),
      appointmentQuestions: preferencesRepository.getQuestions(),
    },
  };
}

/** Trigger a browser download of the export bundle as JSON. */
export function downloadExport(now: string): void {
  const bundle = buildExportBundle(now);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `elowa-export-${now.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Permanently clear ALL locally-stored data for the active context. */
export function deleteAllData(): void {
  clearMode(getDataMode());
}
