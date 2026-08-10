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
  accountRepository,
  appointmentRepository,
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
import type {
  Account,
  AppointmentRecord,
  Capability,
  ChangeSummary,
  ConsentType,
  DeviceSession,
  Entitlement,
  ReportArchiveEntry,
  ShareAudience,
  ShareLink,
  ShareSection,
  Tier,
  TimelineEvent,
  TimelineFilter,
} from '@/domain/models';
import { buildTimeline, filterTimeline, groupByMonth, timelineSince } from '@/domain/analysis/timeline';
import { buildChangeSummary } from '@/domain/analysis/howChanged';
import { effectiveTier, hasCapability } from '@/domain/entitlements/entitlements';
import { getFlags, setFlag, type FeatureFlags } from '@/config/featureFlags';
import { authService } from './auth';
import {
  createShareLink,
  effectiveSymptomIds,
  linkState,
  revokeLink,
  DEFAULT_CLINICIAN_SECTIONS,
  DEFAULT_PARTNER_SECTIONS,
  PARTNER_DEFAULT_EXCLUDED,
} from './sharing';
import { LocalMockBackend } from './sync/remoteBackend';
import { sync as runSync, migrateToAccount, recordDeletion } from './sync/syncService';
import { MetaKeys, META_PREFIX } from './storage/namespace';
import { addDays, todayIso } from '@/lib/date';
import { makeId } from '@/lib/id';

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
      excludeKeys: privacyRepository.excludedFromHome(),
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

// --- Phase 3: accounts, sync, timeline, sharing, entitlements --------------

/** Feature flags & entitlements. Components ask about capabilities, never tiers. */
export const entitlementService = {
  flags(): FeatureFlags {
    return getFlags();
  },
  setFlag(flag: keyof FeatureFlags, value: boolean): void {
    setFlag(flag, value);
  },
  entitlement(): Entitlement {
    return accountRepository.getEntitlement();
  },
  tier(): Tier {
    return effectiveTier(accountRepository.getEntitlement());
  },
  can(capability: Capability): boolean {
    return hasCapability(accountRepository.getEntitlement(), capability, getFlags());
  },
  /** Simulated purchase/restore for the local build (no real billing here). */
  setTier(tier: Tier, source: Entitlement['source'] = 'local'): void {
    accountRepository.setEntitlement(
      tier === 'plus' ? { tier, source, validUntil: addDays(todayIso(), 365) + 'T00:00:00.000Z' } : { tier: 'free', source: 'free' },
    );
  },
};

/** Account lifecycle + encrypted cloud backup (local mock backend in this build). */
const backend = new LocalMockBackend();

export const accountService = {
  current(): Account | null {
    return authService.currentAccount();
  },
  isSignedIn(): boolean {
    return authService.isSignedIn();
  },
  sessions(): DeviceSession[] {
    return authService.sessions();
  },
  revokeSession(id: string): void {
    authService.revokeSession(id);
  },
  /** Create an account and migrate existing local history into it. */
  async createAccount(input: { email?: string; displayName?: string }): Promise<Account> {
    const now = new Date().toISOString();
    const account = authService.createAccount({ method: 'local', now, ...input });
    if (getFlags().cloudSync) await migrateToAccount(backend, account.id);
    return account;
  },
  signOut(options: { wipeLocal?: boolean } = {}): void {
    authService.signOut(options);
  },
  /** Manual "back up now" — reconcile local ↔ cloud. Idempotent. */
  async syncNow(): Promise<{ status: string }> {
    const account = authService.currentAccount();
    if (!account) return { status: 'local_only' };
    if (!getFlags().cloudSync) return { status: 'offline' };
    const result = await runSync(backend, account.id);
    return { status: result.status };
  },
  /** Consent records (AI, health, partner sharing, marketing). */
  consents() {
    return accountRepository.getConsents();
  },
  hasConsent(type: ConsentType): boolean {
    return accountRepository.hasConsent(type);
  },
  recordConsent(type: ConsentType, version = '1.0'): void {
    accountRepository.recordConsent(type, version, new Date().toISOString());
  },
  withdrawConsent(type: ConsentType): void {
    accountRepository.withdrawConsent(type, new Date().toISOString());
  },
};

/** Biometric / passcode app lock. Device-level; a real native build maps this to Face ID / Touch ID. */
const APP_LOCK_KEY = `${META_PREFIX}${MetaKeys.appLock}`;
export const appLockService = {
  isEnabled(): boolean {
    try {
      return window.localStorage.getItem(APP_LOCK_KEY) === 'on';
    } catch {
      return false;
    }
  },
  setEnabled(on: boolean): void {
    try {
      window.localStorage.setItem(APP_LOCK_KEY, on ? 'on' : 'off');
    } catch {
      /* no-op */
    }
  },
};

export const appointmentRecordService = {
  list(): AppointmentRecord[] {
    return appointmentRepository.list().sort((a, b) => b.date.localeCompare(a.date));
  },
  get(id: string): AppointmentRecord | null {
    return appointmentRepository.get(id);
  },
  upcoming(): AppointmentRecord | null {
    const today = todayIso();
    return (
      appointmentRepository
        .list()
        .filter((a) => a.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
    );
  },
  save(input: Partial<AppointmentRecord> & { date: IsoDate }): AppointmentRecord {
    const now = new Date().toISOString();
    const existing = input.id ? appointmentRepository.get(input.id) : null;
    const record: AppointmentRecord = {
      id: existing?.id ?? makeId('appt'),
      date: input.date,
      questions: input.questions ?? existing?.questions ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(input.clinicianName !== undefined ? { clinicianName: input.clinicianName } : existing?.clinicianName ? { clinicianName: existing.clinicianName } : {}),
      ...(input.specialty !== undefined ? { specialty: input.specialty } : existing?.specialty ? { specialty: existing.specialty } : {}),
      ...(input.clinic !== undefined ? { clinic: input.clinic } : existing?.clinic ? { clinic: existing.clinic } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : existing?.reason ? { reason: existing.reason } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : existing?.notes ? { notes: existing.notes } : {}),
      ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate } : existing?.followUpDate ? { followUpDate: existing.followUpDate } : {}),
      ...(input.outcomes !== undefined ? { outcomes: input.outcomes } : existing?.outcomes ? { outcomes: existing.outcomes } : {}),
    };
    return appointmentRepository.upsert(record);
  },
  remove(id: string): void {
    appointmentRepository.remove(id);
    recordDeletion('appointments', id, new Date().toISOString());
  },
  reports(): ReportArchiveEntry[] {
    return appointmentRepository.listReports();
  },
  archiveReport(entry: Omit<ReportArchiveEntry, 'id'>): void {
    appointmentRepository.addReport({ ...entry, id: makeId('rep') });
  },
};

/** The Elowa Timeline — the longitudinal story. */
export const timelineService = {
  build(): TimelineEvent[] {
    const checkIns = checkInRepository.list();
    const pinned = symptomRepository.getPinnedIds();
    return buildTimeline({
      checkIns,
      symptomIds: relevantSymptomIds(checkIns, pinned),
      pinnedIds: pinned,
      labelOf: symptomLabelResolver(),
      treatments: treatmentRepository.list(),
      periods: cycleRepository.listPeriods(),
      appointments: appointmentRepository.list(),
      milestones: accountRepository.getMilestones(),
      healthSamples: healthRepository.listSamples(),
      excludeKeys: privacyRepository.excludedFromHome(),
    });
  },
  filtered(filter: TimelineFilter): TimelineEvent[] {
    return filterTimeline(this.build(), filter);
  },
  grouped(filter: TimelineFilter) {
    return groupByMonth(filterTimeline(this.build(), filter));
  },
  since(anchor: IsoDate): TimelineEvent[] {
    return timelineSince(this.build(), anchor);
  },
  addMilestone(input: { date: IsoDate; title: string; detail?: string }): void {
    accountRepository.addMilestone({
      id: makeId('mile'),
      date: input.date,
      kind: 'milestone',
      title: input.title,
      ...(input.detail ? { detail: input.detail } : {}),
      weight: 0.6,
      icon: 'Bookmark',
    });
  },
};

/** "How have I changed?" over a range (default: last ~6 months of data). */
export const howChangedService = {
  build(rangeStart?: IsoDate, rangeEnd?: IsoDate): ChangeSummary {
    const checkIns = checkInRepository.list();
    const pinned = symptomRepository.getPinnedIds();
    const dates = checkIns.map((c) => c.date).sort();
    const end = rangeEnd ?? dates[dates.length - 1] ?? todayIso();
    const start = rangeStart ?? addDays(end, -180);
    return buildChangeSummary({
      checkIns,
      symptomIds: relevantSymptomIds(checkIns, pinned),
      pinnedIds: pinned,
      labelOf: symptomLabelResolver(),
      treatments: treatmentRepository.list(),
      healthSamples: healthRepository.listSamples(),
      rangeStart: start,
      rangeEnd: end,
      excludeKeys: privacyRepository.excludedFromHome(),
    });
  },
};

/** Controlled sharing — clinician links & light partner summaries. */
export const shareService = {
  links(): (ShareLink & { state: ReturnType<typeof linkState> })[] {
    return accountRepository.getShareLinks().map((l) => ({ ...l, state: linkState(l) }));
  },
  clinicianDefaults(): { sections: ShareSection[]; symptomIds: string[] } {
    const excluded = privacyRepository.excludedFromReport();
    const symptomIds = relevantSymptomIds(checkInRepository.list(), symptomRepository.getPinnedIds()).filter(
      (id) => !excluded.has(id),
    );
    return { sections: DEFAULT_CLINICIAN_SECTIONS, symptomIds };
  },
  /** Partner: sensitive categories excluded by default; caller opts each back in. */
  partnerDefaults(): { sections: ShareSection[]; symptomIds: string[]; excluded: string[] } {
    const all = relevantSymptomIds(checkInRepository.list(), symptomRepository.getPinnedIds());
    const symptomIds = all.filter((id) => !PARTNER_DEFAULT_EXCLUDED.includes(id as never));
    return { sections: DEFAULT_PARTNER_SECTIONS, symptomIds, excluded: [...PARTNER_DEFAULT_EXCLUDED] };
  },
  create(input: {
    audience: ShareAudience;
    sections: ShareSection[];
    includedSymptomIds: string[];
    expiryDays: number;
    partnerNote?: string;
  }): ShareLink {
    const link = createShareLink({ ...input, now: new Date().toISOString() });
    accountRepository.setShareLinks([...accountRepository.getShareLinks(), link]);
    return link;
  },
  revoke(id: string): void {
    accountRepository.setShareLinks(
      accountRepository.getShareLinks().map((l) => (l.id === id ? revokeLink(l) : l)),
    );
  },
  get(token: string): ShareLink | null {
    return accountRepository.getShareLinks().find((l) => l.token === token) ?? null;
  },
  /** Effective symptom ids for a resolved link, honouring current privacy exclusions. */
  visibleSymptomIds(link: ShareLink): string[] {
    return effectiveSymptomIds(link, privacyRepository.excludedFromReport());
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
  // Phase 3
  account: ['account'] as const,
  sessions: ['sessions'] as const,
  consents: ['consents'] as const,
  entitlement: ['entitlement'] as const,
  featureFlags: ['featureFlags'] as const,
  appointments: ['appointments'] as const,
  appointment: (id: string) => ['appointments', id] as const,
  reportArchive: ['reportArchive'] as const,
  timeline: ['timeline'] as const,
  howChanged: ['howChanged'] as const,
  shareLinks: ['shareLinks'] as const,
  appLock: ['appLock'] as const,
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
  queryKeys.timeline,
  queryKeys.howChanged,
  queryKeys.appointments,
] as const;
