/**
 * Demo mode.
 *
 * Loads a deterministic fictional dataset into the SEPARATE demo storage
 * namespace. Real user data is never touched. Switching modes is instant;
 * repositories follow the active mode automatically.
 */
import { generateDemoDataset } from '@/data/demo/generateDemo';
import { todayIso, type IsoDate } from '@/lib/date';
import { clearMode, getDataMode, setDataMode, type DataMode } from './storage/dataContext';
import {
  checkInRepository,
  cycleRepository,
  preferencesRepository,
  symptomRepository,
  treatmentRepository,
} from './repositories';

export function isDemoMode(): boolean {
  return getDataMode() === 'demo';
}

export function currentMode(): DataMode {
  return getDataMode();
}

/** Write the deterministic dataset into the demo namespace (assumes demo mode active). */
function writeDemoData(endDate: IsoDate): void {
  const data = generateDemoDataset(endDate);
  preferencesRepository.setProfile(data.profile);
  preferencesRepository.setPreferences(data.preferences);
  preferencesRepository.setOnboarding(data.reasons);
  preferencesRepository.setQuestions(data.questions);
  symptomRepository.setConfig({
    pinnedSymptomIds: data.pinnedSymptomIds,
    customSymptoms: [],
    customContextTags: [],
  });
  cycleRepository.replaceAll(data.periods);
  treatmentRepository.replaceAll(data.treatments);
  checkInRepository.replaceAll(data.checkIns);
}

/** Enter demo mode, seeding the dataset (fresh each time for a clean demo). */
export function enterDemoMode(endDate: IsoDate = todayIso()): void {
  setDataMode('demo');
  clearMode('demo');
  writeDemoData(endDate);
}

/** Reset the demo dataset (developer affordance). */
export function resetDemo(endDate: IsoDate = todayIso()): void {
  enterDemoMode(endDate);
}

/** Leave demo mode and return to the real (private) dataset. */
export function exitDemoMode(): void {
  setDataMode('real');
}
