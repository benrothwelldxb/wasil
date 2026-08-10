/**
 * SymptomRepository — the user's tracking configuration: which symptoms are
 * pinned, plus any custom symptoms and custom context tags they created.
 * Merges the static catalogue with user-created items for lookups.
 */
import type { ContextTag, Symptom, TrackingConfig } from '@/domain/models';
import { CONTEXT_TAGS, SYMPTOMS } from '@/data/catalog';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

const EMPTY: TrackingConfig = { pinnedSymptomIds: [], customSymptoms: [], customContextTags: [] };

function read(): TrackingConfig {
  const stored = activeDriver().get<TrackingConfig>(StorageKeys.symptomConfig);
  return stored ? { ...EMPTY, ...stored } : { ...EMPTY };
}

function write(config: TrackingConfig): void {
  activeDriver().set(StorageKeys.symptomConfig, config);
}

export const symptomRepository = {
  getConfig(): TrackingConfig {
    return read();
  },

  setConfig(config: TrackingConfig): void {
    write(config);
  },

  setPinned(ids: string[]): void {
    write({ ...read(), pinnedSymptomIds: ids });
  },

  getPinnedIds(): string[] {
    return read().pinnedSymptomIds;
  },

  addCustomSymptom(symptom: Symptom): void {
    const config = read();
    write({ ...config, customSymptoms: [...config.customSymptoms, { ...symptom, custom: true }] });
  },

  addCustomContextTag(tag: ContextTag): void {
    const config = read();
    write({ ...config, customContextTags: [...config.customContextTags, { ...tag, custom: true }] });
  },

  /** All symptoms available to the user (catalogue + custom). */
  allSymptoms(): Symptom[] {
    return [...SYMPTOMS, ...read().customSymptoms];
  },

  /** All context tags available to the user (catalogue + custom). */
  allContextTags(): ContextTag[] {
    return [...CONTEXT_TAGS, ...read().customContextTags];
  },
};
