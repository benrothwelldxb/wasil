/**
 * Application services.
 *
 * The composition layer between the UI (via hooks) and the persistence
 * repositories + analysis engines. Components never import repositories or
 * engines directly — they go through these services and the query hooks.
 */

import type {
  AppointmentSummary,
  DailyCheckIn,
  Insight,
  LearningArticle,
  PeriodEntry,
  Symptom,
  TreatmentEvent,
  User,
} from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import { MOCK_ARTICLES, findArticle } from '@/data/mock';
import {
  checkInRepository,
  cycleRepository,
  preferencesRepository,
  symptomRepository,
  treatmentRepository,
} from './repositories';
import {
  analyzeSymptoms,
  computeOverallBaseline,
  type OverallBaseline,
  type SymptomAnalysis,
} from '@/domain/analysis/baseline';
import { deriveCycles, cycleStats, type CycleStats } from '@/domain/analysis/cycle';
import { generateInsights } from '@/domain/analysis/insights';
import { buildAppointmentSummary } from '@/domain/analysis/appointment';
import type { CycleEntry } from '@/domain/models';

/** Build a label resolver over the catalogue + custom symptoms. */
export function symptomLabelResolver(): (id: string) => string {
  const map = new Map(symptomRepository.allSymptoms().map((s) => [s.id, s.label]));
  return (id: string) => map.get(id) ?? 'Symptom';
}

/** Symptom ids that appear in observations plus the pinned ids. */
function relevantSymptomIds(checkIns: readonly DailyCheckIn[], pinned: readonly string[]): string[] {
  const ids = new Set<string>(pinned);
  for (const ci of checkIns) for (const o of ci.observations) ids.add(o.symptomId);
  return [...ids];
}

export const userService = {
  getCurrentUser(): User {
    return {
      profile: preferencesRepository.getProfile(),
      pinnedSymptomIds: symptomRepository.getPinnedIds(),
      onboardingReasons: preferencesRepository.getOnboardingReasons(),
      preferences: preferencesRepository.getPreferences(),
      onboarded: preferencesRepository.isOnboarded(),
      createdAt: preferencesRepository.getCreatedAt(),
    };
  },
};

export const symptomService = {
  allSymptoms(): Symptom[] {
    return symptomRepository.allSymptoms();
  },
  pinnedSymptoms(): Symptom[] {
    const pinned = new Set(symptomRepository.getPinnedIds());
    return symptomRepository.allSymptoms().filter((s) => pinned.has(s.id));
  },
};

export const checkInService = {
  list(): DailyCheckIn[] {
    return checkInRepository.list();
  },
  getByDate(date: IsoDate): DailyCheckIn | null {
    return checkInRepository.getByDate(date);
  },
  upsert(checkIn: DailyCheckIn): DailyCheckIn {
    return checkInRepository.upsert(checkIn);
  },
  removeByDate(date: IsoDate): void {
    checkInRepository.removeByDate(date);
  },
};

export const cycleService = {
  listPeriods(): PeriodEntry[] {
    return cycleRepository.listPeriods();
  },
  cycles(): CycleEntry[] {
    return deriveCycles(cycleRepository.listPeriods());
  },
  stats(): CycleStats {
    return cycleStats(deriveCycles(cycleRepository.listPeriods()));
  },
};

export const treatmentService = {
  list(): TreatmentEvent[] {
    return treatmentRepository.list();
  },
};

export interface AnalysisSnapshot {
  overall: OverallBaseline;
  symptoms: Map<string, SymptomAnalysis>;
}

export const analysisService = {
  snapshot(): AnalysisSnapshot {
    const checkIns = checkInRepository.list();
    const pinned = symptomRepository.getPinnedIds();
    const ids = relevantSymptomIds(checkIns, pinned);
    return {
      overall: computeOverallBaseline(checkIns),
      symptoms: analyzeSymptoms(checkIns, ids, new Set(pinned)),
    };
  },
};

export const insightService = {
  list(): Insight[] {
    const checkIns = checkInRepository.list();
    const pinned = symptomRepository.getPinnedIds();
    return generateInsights({
      checkIns,
      symptomIds: relevantSymptomIds(checkIns, pinned),
      pinnedIds: pinned,
      labelOf: symptomLabelResolver(),
      treatments: treatmentRepository.list(),
      periods: cycleRepository.listPeriods(),
    });
  },
};

export const appointmentService = {
  build(generatedAt: string): AppointmentSummary {
    const checkIns = checkInRepository.list();
    const pinned = symptomRepository.getPinnedIds();
    return buildAppointmentSummary({
      checkIns,
      symptomIds: relevantSymptomIds(checkIns, pinned),
      pinnedIds: pinned,
      labelOf: symptomLabelResolver(),
      treatments: treatmentRepository.list(),
      periods: cycleRepository.listPeriods(),
      questions: preferencesRepository.getQuestions(),
      generatedAt,
    });
  },
};

export const articleService = {
  list(): LearningArticle[] {
    return [...MOCK_ARTICLES];
  },
  getBySlug(slug: string): LearningArticle | null {
    return findArticle(slug) ?? null;
  },
};

/** Centralised React Query keys — one source of truth for cache invalidation. */
export const queryKeys = {
  currentUser: ['currentUser'] as const,
  checkIns: ['checkIns'] as const,
  checkIn: (date: string) => ['checkIns', date] as const,
  periods: ['periods'] as const,
  cycles: ['cycles'] as const,
  treatments: ['treatments'] as const,
  insights: ['insights'] as const,
  analysis: ['analysis'] as const,
  appointmentSummary: ['appointmentSummary'] as const,
  articles: ['articles'] as const,
  article: (slug: string) => ['articles', slug] as const,
};

/** Keys that depend on logged data — invalidated together after any write. */
export const DATA_QUERY_KEYS = [
  queryKeys.currentUser,
  queryKeys.checkIns,
  queryKeys.periods,
  queryKeys.cycles,
  queryKeys.treatments,
  queryKeys.insights,
  queryKeys.analysis,
  queryKeys.appointmentSummary,
] as const;
