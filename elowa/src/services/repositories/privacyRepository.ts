/**
 * Category-level privacy & relevance (Phase 2).
 *
 * Per-symptom controls: mark relevance (care / neutral / ignore) and exclude a
 * symptom from the home surface, AI summaries and/or the appointment report.
 * These preferences are respected across the app.
 */
import type { InsightFeedbackValue, Relevance, SymptomPrivacy } from '@/domain/models';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

type PrivacyMap = Record<string, SymptomPrivacy>;

const DEFAULT_PRIVACY: SymptomPrivacy = {
  relevance: 'neutral',
  excludeFromHome: false,
  excludeFromAI: false,
  excludeFromReport: false,
};

function readMap(): PrivacyMap {
  return activeDriver().get<PrivacyMap>(StorageKeys.symptomPrivacy) ?? {};
}
function writeMap(map: PrivacyMap): void {
  activeDriver().set(StorageKeys.symptomPrivacy, map);
}

export const privacyRepository = {
  getFor(symptomId: string): SymptomPrivacy {
    return { ...DEFAULT_PRIVACY, ...readMap()[symptomId] };
  },
  getAll(): PrivacyMap {
    return readMap();
  },
  set(symptomId: string, privacy: SymptomPrivacy): void {
    writeMap({ ...readMap(), [symptomId]: privacy });
  },
  setRelevance(symptomId: string, relevance: Relevance): void {
    this.set(symptomId, { ...this.getFor(symptomId), relevance });
  },

  /** Keys excluded from the home surface (explicit exclude OR relevance=ignore). */
  excludedFromHome(): Set<string> {
    const map = readMap();
    return new Set(
      Object.entries(map)
        .filter(([, p]) => p.excludeFromHome || p.relevance === 'ignore')
        .map(([id]) => id),
    );
  },
  excludedFromAI(): Set<string> {
    const map = readMap();
    return new Set(Object.entries(map).filter(([, p]) => p.excludeFromAI).map(([id]) => id));
  },
  excludedFromReport(): Set<string> {
    const map = readMap();
    return new Set(Object.entries(map).filter(([, p]) => p.excludeFromReport).map(([id]) => id));
  },

  clear(): void {
    writeMap({});
  },
};

// --- insight feedback (local only) -----------------------------------------

type FeedbackMap = Record<string, InsightFeedbackValue>;

export const insightFeedbackRepository = {
  getAll(): FeedbackMap {
    return activeDriver().get<FeedbackMap>(StorageKeys.insightFeedback) ?? {};
  },
  getMap(): Map<string, InsightFeedbackValue> {
    return new Map(Object.entries(this.getAll()));
  },
  set(insightKey: string, value: InsightFeedbackValue): void {
    activeDriver().set(StorageKeys.insightFeedback, { ...this.getAll(), [insightKey]: value });
  },
  clear(): void {
    activeDriver().set(StorageKeys.insightFeedback, {});
  },
};
