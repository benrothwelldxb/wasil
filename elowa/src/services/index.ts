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
  healthRepository,
  insightFeedbackRepository,
  preferencesRepository,
  privacyRepository,
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
import { generateInsights, homeInsights, type InsightInputs } from '@/domain/analysis/insights';
import { buildAppointmentSummary } from '@/domain/analysis/appointment';
import { buildSinceComparison, type SinceInputs } from '@/domain/analysis/since';
import { buildMonthlyReflection } from '@/domain/analysis/reflection';
import { getHealthProvider, ALL_HEALTH_METRICS } from '@/domain/health';
import { interpret, toStructuredFindings } from '@/domain/ai/pipeline';
import { SimulatedLLMProvider } from '@/domain/ai/providers';
import { computeDueNotifications } from '@/domain/notifications/rules';
import { CONTEXT_TAGS } from '@/data/catalog';
import type {
  AISummary,
  CycleEntry,
  HealthDaySample,
  HealthMetricKind,
  MonthlyReflection,
  SinceComparison,
} from '@/domain/models';

/** Learn article slug for a measure/symptom (never claims it explains the user). */
const LEARN_SLUG_BY_SYMPTOM: Record<string, string> = {
  sym_sleep: 'sleep-and-perimenopause',
  sym_hot_flushes: 'hot-flushes-night-sweats',
  sym_night_sweats: 'hot-flushes-night-sweats',
  sym_mood: 'mood-and-anxiety',
  sym_anxiety: 'mood-and-anxiety',
  sym_brain_fog: 'brain-fog',
  sym_period_changes: 'cycle-changes',
  metric_sleep: 'sleep-and-perimenopause',
};

function contextLabelOf(id: string): string {
  return CONTEXT_TAGS.find((t) => t.id === id)?.label ?? id.replace('ctx_', '').replace(/_/g, ' ');
}

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

/** Shared inputs for the pattern engine, wired with all Phase 2 signals. */
function insightInputs(): InsightInputs {
  const checkIns = checkInRepository.list();
  const pinned = symptomRepository.getPinnedIds();
  return {
    checkIns,
    symptomIds: relevantSymptomIds(checkIns, pinned),
    pinnedIds: pinned,
    labelOf: symptomLabelResolver(),
    treatments: treatmentRepository.list(),
    periods: cycleRepository.listPeriods(),
    healthSamples: healthRepository.listSamples(),
    contextLabelOf,
    learnSlugFor: (key) => LEARN_SLUG_BY_SYMPTOM[key],
    excludeKeys: privacyRepository.excludedFromHome(),
    feedback: insightFeedbackRepository.getMap(),
  };
}

export const insightService = {
  /** All ranked insights (Insights screen). */
  list(): Insight[] {
    return generateInsights(insightInputs());
  },
  /** Home-surface insights (respects privacy/relevance exclusions). */
  homeList(): Insight[] {
    return homeInsights(insightInputs());
  },
  setFeedback(insightKeyValue: string, value: import('@/domain/models').InsightFeedbackValue): void {
    insightFeedbackRepository.set(insightKeyValue, value);
  },
  learnSlugFor(key: string): string | undefined {
    return LEARN_SLUG_BY_SYMPTOM[key];
  },
};

export const healthService = {
  capabilities() {
    return getHealthProvider().capabilities();
  },
  permissions() {
    return getHealthProvider().getPermissions();
  },
  supportedMetrics(): HealthMetricKind[] {
    return getHealthProvider().capabilities().supported;
  },
  allMetrics(): HealthMetricKind[] {
    return ALL_HEALTH_METRICS;
  },
  async connect(kinds: HealthMetricKind[]): Promise<void> {
    const provider = getHealthProvider();
    await provider.requestPermissions(kinds);
    // Pull recent samples once connected (mock reads from seeded demo samples).
    const end = new Date().toISOString().slice(0, 10);
    const start = end; // range clamped inside provider; demo already seeded
    await provider.getDailySamples(start, end);
  },
  async disconnect(): Promise<void> {
    await getHealthProvider().revokeAll();
  },
  samples(): HealthDaySample[] {
    return healthRepository.listSamples();
  },
  latestSample(): HealthDaySample | null {
    const list = healthRepository.listSamples();
    return list.length ? list[list.length - 1]! : null;
  },
};

export const sinceService = {
  build(anchorDate: IsoDate, anchorLabel: string): SinceComparison {
    const checkIns = checkInRepository.list();
    const pinned = symptomRepository.getPinnedIds();
    const inputs: SinceInputs = {
      checkIns,
      symptomIds: relevantSymptomIds(checkIns, pinned),
      pinnedIds: pinned,
      labelOf: symptomLabelResolver(),
      healthSamples: healthRepository.listSamples(),
      anchorDate,
      anchorLabel,
    };
    return buildSinceComparison(inputs);
  },
};

export const reflectionService = {
  build(month: string): MonthlyReflection {
    const checkIns = checkInRepository.list();
    const pinned = symptomRepository.getPinnedIds();
    return buildMonthlyReflection({
      month,
      checkIns,
      symptomIds: relevantSymptomIds(checkIns, pinned),
      pinnedIds: pinned,
      labelOf: symptomLabelResolver(),
      treatments: treatmentRepository.list(),
      periods: cycleRepository.listPeriods(),
      healthSamples: healthRepository.listSamples(),
    });
  },
};

export const aiService = {
  /** Summarise the current insights (AI if consented+enabled, else deterministic). */
  async summariseInsights(): Promise<AISummary> {
    const insights = insightService.list();
    const findings = toStructuredFindings(insights, { excludeKeys: privacyRepository.excludedFromAI() });
    const ai = preferencesRepository.getPreferences().ai;
    return interpret({
      task: 'summarise_findings',
      findings,
      aiEnabled: Boolean(ai?.enabled && ai?.consentedAt),
      provider: new SimulatedLLMProvider(),
    });
  },
};

export const notificationService = {
  due() {
    const prefs = preferencesRepository.getPreferences();
    const checkIns = checkInRepository.list();
    const overall = computeOverallBaseline(checkIns);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    // A meaningful sustained change (first found) to optionally surface.
    const home = insightService.homeList();
    const change = home.find((i) => i.kind === 'change' && i.strength !== 'early');
    return computeDueNotifications({
      prefs: prefs.notifications!,
      today: todayStr,
      checkedInToday: checkIns.some((c) => c.date === todayStr),
      distinctDays: overall.distinctDays,
      ...(change ? { meaningfulChange: { label: symptomLabelResolver()(change.relatedMeasureKeys?.[0] ?? '') } } : {}),
      ...(prefs.nextAppointmentDate ? { nextAppointmentDate: prefs.nextAppointmentDate } : {}),
      dayOfWeek: today.getDay(),
      dayOfMonth: today.getDate(),
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
      onboardingReasons: preferencesRepository.getOnboardingReasons(),
      excludeKeys: privacyRepository.excludedFromReport(),
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
  homeInsights: ['homeInsights'] as const,
  analysis: ['analysis'] as const,
  appointmentSummary: ['appointmentSummary'] as const,
  health: ['health'] as const,
  notifications: ['notifications'] as const,
  reflection: (month: string) => ['reflection', month] as const,
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
  queryKeys.homeInsights,
  queryKeys.analysis,
  queryKeys.appointmentSummary,
  queryKeys.health,
  queryKeys.notifications,
] as const;
