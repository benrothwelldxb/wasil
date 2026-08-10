/**
 * elowa domain models.
 *
 * These interfaces describe the product's data shapes independently of any
 * storage or transport. They are intentionally backend-agnostic: IDs are
 * opaque strings, dates are ISO strings, and there are no ORM/framework types.
 * The Phase 1 persistence layer maps these onto local storage; a future backend
 * can map rows/documents onto the same shapes without the UI needing to change.
 */

import type { IsoDate } from '@/lib/date';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type Id = string;

/** Absolute severity scale, retained where an explicit level is useful. */
export type Severity = 'none' | 'mild' | 'moderate' | 'strong' | 'severe';

/**
 * elowa's PRIMARY language: change relative to the user's own usual range.
 * This is what most check-ins capture.
 */
export type RelativeStatus = 'better' | 'about_usual' | 'a_little_worse' | 'much_worse';

/** Categories a symptom can belong to (drives grouping and iconography). */
export type SymptomCategory =
  | 'sleep'
  | 'energy'
  | 'mood'
  | 'cognitive'
  | 'vasomotor' // hot flushes / night sweats
  | 'pain'
  | 'digestive'
  | 'genitourinary'
  | 'cycle'
  | 'other';

// ---------------------------------------------------------------------------
// User, preferences & session
// ---------------------------------------------------------------------------

export interface UserProfile {
  displayName?: string;
  age?: number;
}

export interface UserPreferences {
  remindersEnabled: boolean;
  reminderTime?: string; // `HH:mm`
  cycleTrackingEnabled: boolean;
  /** Phase 2 additions (all optional; defaults applied by the repository). */
  notifications?: NotificationPrefs;
  ai?: AISettings;
  analyticsEnabled?: boolean;
  /** A user-recorded upcoming appointment, enabling appointment reminders. */
  nextAppointmentDate?: IsoDate;
}

// --- Notification preferences (Phase 2) ------------------------------------

export interface NotificationPrefs {
  dailyCheckIn: boolean;
  weeklyReflection: boolean;
  monthlySummary: boolean;
  meaningfulChanges: boolean;
  appointmentReminders: boolean;
  /** Preferred daily check-in time `HH:mm`. */
  checkInTime?: string;
}

// --- AI settings & consent (Phase 2) ---------------------------------------

export interface AISettings {
  /** AI summaries are opt-in; deterministic insights always work without this. */
  enabled: boolean;
  /** ISO datetime the user gave explicit consent (undefined = never consented). */
  consentedAt?: string;
}

export type OnboardingReason =
  | 'periods_changed'
  | 'poor_sleep'
  | 'not_myself'
  | 'hot_flushes'
  | 'mood_different'
  | 'low_energy'
  | 'considering_hrt'
  | 'started_hrt'
  | 'understand'
  | 'other';

/**
 * The assembled "current user" view, composed by the user service from the
 * preferences and symptom repositories. There is no account in Phase 1.
 */
export interface User {
  profile: UserProfile;
  pinnedSymptomIds: Id[];
  onboardingReasons: OnboardingReason[];
  preferences: UserPreferences;
  onboarded: boolean;
  createdAt: IsoDate;
}

// ---------------------------------------------------------------------------
// Symptoms
// ---------------------------------------------------------------------------

/** A trackable symptom definition (catalogue or user-created). */
export interface Symptom {
  id: Id;
  key: string;
  label: string;
  category: SymptomCategory;
  description?: string;
  /** Lucide icon name, resolved in the UI layer. */
  icon: string;
  /** True for user-created symptoms. */
  custom?: boolean;
}

/** A single symptom observation within a check-in. */
export interface SymptomObservation {
  symptomId: Id;
  /** Change from the user's usual range (primary signal). */
  status?: RelativeStatus;
  /** Optional absolute level. */
  severity?: Severity;
}

/** Persisted tracking configuration (what the user has chosen to track). */
export interface TrackingConfig {
  pinnedSymptomIds: Id[];
  customSymptoms: Symptom[];
  customContextTags: ContextTag[];
}

// ---------------------------------------------------------------------------
// Context tags
// ---------------------------------------------------------------------------

export type ContextTagGroup = 'life' | 'lifestyle' | 'health';

export interface ContextTag {
  id: Id;
  key: string;
  label: string;
  group: ContextTagGroup;
  icon: string;
  custom?: boolean;
}

// ---------------------------------------------------------------------------
// Daily check-in
// ---------------------------------------------------------------------------

export type CheckInKind = 'normal' | 'detailed';

export interface DailyCheckIn {
  id: Id;
  date: IsoDate;
  kind: CheckInKind;
  /** True when the user asserted the day was within their usual range. */
  feltNormal: boolean;
  /** Per-symptom observations (empty for a plain "normal" day). */
  observations: SymptomObservation[];
  /** Context tag ids selected for the day. */
  contextTagIds: Id[];
  /** Optional free-text note. */
  note?: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Cycle & periods
// ---------------------------------------------------------------------------

export type FlowLevel = 'spotting' | 'light' | 'medium' | 'heavy';

/** A single day marked as a period (or spotting) day. */
export interface PeriodEntry {
  id: Id;
  date: IsoDate;
  flow: FlowLevel;
  note?: string;
}

/** A derived menstrual cycle (computed, not stored). */
export interface CycleEntry {
  id: Id;
  startDate: IsoDate;
  bleedEndDate?: IsoDate;
  /** Bleed duration in days. */
  periodDays: number;
  /** Length in days from this start to the next start, if known. */
  lengthDays?: number;
}

// ---------------------------------------------------------------------------
// Treatments & interventions
// ---------------------------------------------------------------------------

export type TreatmentCategory = 'hrt' | 'medication' | 'supplement' | 'lifestyle' | 'other';

export interface TreatmentEvent {
  id: Id;
  category: TreatmentCategory;
  title: string;
  /** When this started (or the intervention began). */
  date: IsoDate;
  endDate?: IsoDate;
  /** Date the dose changed, if applicable. */
  doseChangeDate?: IsoDate;
  dose?: string;
  frequency?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Insights (deterministic, generated from local data)
// ---------------------------------------------------------------------------

export type InsightKind =
  | 'change'
  | 'frequency'
  | 'improvement'
  | 'cooccurrence'
  | 'sequence'
  | 'lagged'
  | 'activity'
  | 'treatment'
  | 'cycle';

export type InsightTone = 'positive' | 'neutral' | 'watch';

/** How much data stands behind a pattern (user-facing quality state). */
export type PatternStrength = 'early' | 'recurring' | 'strong';

export interface Insight {
  id: Id;
  kind: InsightKind;
  tone: InsightTone;
  /** Quality state derived from the internal score. */
  strength: PatternStrength;
  /** Internal 0–1 quality score used for ranking (never shown as a %). */
  score: number;
  /** Supporting occurrence count behind the pattern. */
  evidenceCount: number;
  /** Safe, headline claim. */
  title: string;
  /** Safe supporting sentence. */
  body: string;
  /** "Why am I seeing this?" — the concrete evidence behind the insight. */
  explanation: string;
  /** "What this means" — reusable cautious interpretation note. */
  whatThisMeans?: string;
  /** Cautious framing label, e.g. "tended to occur together". */
  framing?: string;
  relatedSymptomIds?: Id[];
  /** Measure keys involved (symptom ids and/or passive metric keys). */
  relatedMeasureKeys?: string[];
  /** Optional Learn article slug to explore the topic (never explains the user). */
  learnSlug?: string;
  /** Optional normalised (0–1) series for a sparkline. */
  spark?: number[];
}

// ---------------------------------------------------------------------------
// Appointment summary
// ---------------------------------------------------------------------------

export interface RankedSymptom {
  symptomId: Id;
  label: string;
  /** 0–1 disruption score, for a simple bar. */
  disruption: number;
  /** Count of days this appeared worse-than-usual in range. */
  worseDays: number;
}

export interface BaselineChange {
  symptomId: Id;
  label: string;
  direction: 'up' | 'down';
  /** Human, cautious description of the change. */
  description: string;
}

export interface AppointmentSummary {
  /** Why the user began tracking (from onboarding reasons). */
  context: string;
  rangeStart: IsoDate;
  rangeEnd: IsoDate;
  checkInCount: number;
  daysTracked: number;
  changes: BaselineChange[];
  mostDisruptive: RankedSymptom[];
  cycleSummary: string;
  treatmentEventIds: Id[];
  observedPatterns: string[];
  notes: { date: IsoDate; text: string }[];
  questions: string[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Export bundle
// ---------------------------------------------------------------------------

export interface ExportBundle {
  app: 'elowa';
  schemaVersion: number;
  exportedAt: string; // ISO datetime
  data: {
    profile: UserProfile;
    preferences: UserPreferences;
    onboardingReasons: OnboardingReason[];
    tracking: TrackingConfig;
    checkIns: DailyCheckIn[];
    periods: PeriodEntry[];
    treatments: TreatmentEvent[];
    appointmentQuestions: string[];
    healthSamples: HealthDaySample[];
    symptomPrivacy: Record<string, SymptomPrivacy>;
    insightFeedback: Record<string, InsightFeedbackValue>;
    // Phase 3 — included so an export is genuinely ALL of the user's data.
    appointments?: AppointmentRecord[];
    reportArchive?: ReportArchiveEntry[];
    shareLinks?: ShareLink[];
    consents?: ConsentRecord[];
    account?: Account | null;
  };
}

// ---------------------------------------------------------------------------
// Learning content
// ---------------------------------------------------------------------------

export type LearnCategory =
  | 'understanding'
  | 'sleep'
  | 'vasomotor'
  | 'mood'
  | 'brain_fog'
  | 'cycle'
  | 'hrt'
  | 'genitourinary'
  | 'lifestyle'
  | 'clinician';

export interface LearningSource {
  label: string;
  url?: string;
}

export interface LearningArticle {
  id: Id;
  title: string;
  slug: string;
  summary: string;
  category: LearnCategory;
  body: string[];
  readMinutes: number;
  reviewedBy?: string;
  reviewedAt?: IsoDate;
  sources: LearningSource[];
}

// ===========================================================================
// Phase 2 — passive health data, AI, privacy, reflections & comparisons
// ===========================================================================

// --- Passive health data ---------------------------------------------------

export type HealthMetricKind =
  | 'sleep_duration'
  | 'sleep_consistency'
  | 'steps'
  | 'active_minutes'
  | 'workouts'
  | 'resting_heart_rate'
  | 'hrv'
  | 'weight';

/** The lifecycle state of a metric read from a health provider. */
export type MetricStatus =
  | 'unavailable' // no provider / not connected
  | 'unsupported' // provider exists but doesn't support this metric
  | 'permission_denied'
  | 'no_data'
  | 'partial_data'
  | 'valid';

/** Provider-agnostic per-day passive sample. */
export interface HealthDaySample {
  date: IsoDate;
  /** Sleep in minutes. */
  sleepMinutes?: number;
  bedtime?: string; // `HH:mm`
  wakeTime?: string; // `HH:mm`
  steps?: number;
  activeMinutes?: number;
  workouts?: number;
  restingHeartRate?: number;
  hrv?: number;
  weightKg?: number;
}

export interface HealthPermission {
  kind: HealthMetricKind;
  granted: boolean;
}

// --- Category-level privacy & relevance (Phase 2) --------------------------

export type Relevance = 'care' | 'neutral' | 'ignore';

export interface SymptomPrivacy {
  relevance: Relevance;
  excludeFromHome: boolean;
  excludeFromAI: boolean;
  excludeFromReport: boolean;
}

/** Symptoms treated as sensitive by default. */
export const SENSITIVE_SYMPTOM_IDS = [
  'sym_libido',
  'sym_vaginal',
  'sym_urinary',
  'sym_mood',
  'sym_anxiety',
] as const;

// --- Insight feedback (local only) -----------------------------------------

export type InsightFeedbackValue = 'helpful' | 'not_useful' | 'wrong';

export interface InsightFeedback {
  insightKey: string; // stable key (kind + measures)
  value: InsightFeedbackValue;
  at: string; // ISO datetime
}

// --- Structured findings & AI (Phase 2) ------------------------------------

/**
 * The deterministic analysis produces these structured findings FIRST. The AI
 * layer may only reword/synthesise them — it never inspects raw data.
 */
export interface StructuredFinding {
  id: string;
  kind: InsightKind | 'summary';
  strength: PatternStrength;
  /** Machine-readable facts the wording must stay faithful to. */
  facts: Record<string, string | number>;
  /** The deterministic, already-safe sentence (the guaranteed fallback). */
  deterministicText: string;
}

export interface AISummary {
  /** Whether the text came from an AI provider or the deterministic fallback. */
  source: 'ai' | 'deterministic';
  text: string;
  /** True if AI output failed validation and we fell back. */
  fellBack?: boolean;
}

// --- Monthly reflection (Phase 2) ------------------------------------------

export interface MonthlyReflection {
  /** `YYYY-MM`. */
  month: string;
  monthLabel: string;
  checkInCount: number;
  steady: string[];
  changed: string[];
  patterns: string[];
  treatmentNotes: string[];
  cycleNote?: string;
  nextMonth: string;
}

// --- "What's changed since…?" (Phase 2) ------------------------------------

export interface SinceMeasureChange {
  key: string;
  label: string;
  direction: 'less' | 'more' | 'similar';
  description: string;
}

export interface SinceComparison {
  anchorLabel: string;
  anchorDate: IsoDate;
  beforeDays: number;
  afterDays: number;
  /** 'good' | 'limited' — plain-language data-quality flag. */
  dataQuality: 'good' | 'limited';
  changes: SinceMeasureChange[];
  unchanged: string[];
  caveat: string;
}

// ===========================================================================
// Phase 3 — accounts, sync, sharing, subscriptions
// ===========================================================================

// --- Account & auth --------------------------------------------------------

export type AuthMethod = 'local' | 'magic_link' | 'apple' | 'google';

export interface Account {
  id: Id;
  /** Email is optional for a local-only account. */
  email?: string;
  method: AuthMethod;
  displayName?: string;
  createdAt: string; // ISO datetime
}

/** A user-visible session/device the account is signed in on. */
export interface DeviceSession {
  id: Id;
  label: string; // e.g. "iPhone", "This browser"
  platform: string;
  lastActiveAt: string; // ISO datetime
  current: boolean;
}

// --- Sync ------------------------------------------------------------------

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'needs_attention' | 'local_only';

/** A tombstone marks a deletion so it doesn't reappear from another device. */
export interface Tombstone {
  collection: string;
  recordId: Id;
  deletedAt: string; // ISO datetime
}

/** Metadata attached to every syncable record (added at the sync boundary). */
export interface SyncMeta {
  updatedAt: string; // ISO datetime — used for last-write-wins on the same record
  deviceId: string;
}

// --- Consent records -------------------------------------------------------

export type ConsentType = 'ai_processing' | 'health_integration' | 'partner_sharing' | 'marketing';

export interface ConsentRecord {
  type: ConsentType;
  version: string;
  grantedAt: string; // ISO datetime
  withdrawnAt?: string; // ISO datetime
}

// --- Appointments (records) ------------------------------------------------

export interface AppointmentRecord {
  id: Id;
  date: IsoDate;
  clinicianName?: string;
  specialty?: string;
  clinic?: string;
  reason?: string;
  notes?: string;
  questions: string[];
  followUpDate?: IsoDate;
  /** Post-appointment outcomes the user recorded (as-entered, never interpreted). */
  outcomes?: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Report archive --------------------------------------------------------

export type ReportType = 'appointment' | 'six_month' | 'since_event';

export interface ReportArchiveEntry {
  id: Id;
  type: ReportType;
  rangeStart: IsoDate;
  rangeEnd: IsoDate;
  generatedAt: string;
  appointmentId?: Id;
  /** Reports are regenerated from data, so we store metadata only. */
  title: string;
}

// --- Sharing ---------------------------------------------------------------

export type ShareAudience = 'clinician' | 'partner';

export type ShareSection =
  | 'summary'
  | 'symptoms'
  | 'cycle'
  | 'treatments'
  | 'patterns'
  | 'notes'
  | 'questions';

export interface ShareLink {
  id: Id;
  token: string;
  audience: ShareAudience;
  /** Sections included (sensitive categories excluded unless re-enabled). */
  sections: ShareSection[];
  /** Symptom ids explicitly included (partner sharing is opt-in per category). */
  includedSymptomIds: Id[];
  createdAt: string; // ISO datetime
  expiresAt: string; // ISO datetime
  revokedAt?: string; // ISO datetime
  /** A short user-written line for partner shares ("what might help"). */
  partnerNote?: string;
}

// --- Subscriptions & entitlements -----------------------------------------

export type Tier = 'free' | 'plus';

export type Capability =
  | 'cloud_sync'
  | 'advanced_patterns'
  | 'since_comparison'
  | 'monthly_summary'
  | 'ai_summaries'
  | 'timeline'
  | 'unlimited_reports'
  | 'partner_sharing';

export interface Entitlement {
  tier: Tier;
  /** ISO datetime the entitlement is valid until (undefined = free/forever). */
  validUntil?: string;
  /** Set during a billing grace period. */
  inGracePeriod?: boolean;
  source: 'free' | 'apple' | 'google' | 'promo' | 'local';
}

// --- Timeline --------------------------------------------------------------

export type TimelineKind =
  | 'symptom_change'
  | 'baseline_shift'
  | 'cycle_change'
  | 'treatment'
  | 'appointment'
  | 'pattern'
  | 'milestone';

export type TimelineFilter = 'all' | 'symptoms' | 'cycle' | 'treatments' | 'appointments' | 'notes';

export interface TimelineEvent {
  id: Id;
  date: IsoDate;
  kind: TimelineKind;
  title: string;
  detail?: string;
  /** Importance 0–1 used to curate what is promoted. */
  weight: number;
  icon: string;
  relatedMeasureKeys?: Id[];
}

// --- "How have I changed?" -------------------------------------------------

export type ChangeBucket = 'improved' | 'changed' | 'stable' | 'new';

export interface ChangeLine {
  bucket: ChangeBucket;
  label: string;
  text: string;
}

export interface ChangeSummary {
  rangeStart: IsoDate;
  rangeEnd: IsoDate;
  lines: ChangeLine[];
  treatmentContext: string[];
  caveat: string;
}
