/**
 * Bloom domain models.
 *
 * These interfaces describe the product's data shapes independently of any
 * storage or transport. They are intentionally backend-agnostic: IDs are
 * opaque strings, dates are ISO strings, and there are no ORM/framework types.
 * A future backend can map rows/documents onto these shapes without the UI
 * needing to change.
 */

import type { IsoDate } from '@/lib/date';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type Id = string;

/** Ordered wellbeing scale used for the daily overall check-in. */
export type WellbeingLevel = 'great' | 'okay' | 'not_great' | 'rough';

/** Ordered severity scale used for individual symptoms. */
export type Severity = 'none' | 'mild' | 'moderate' | 'strong' | 'severe';

/** Categories a symptom can belong to (drives grouping and iconography). */
export type SymptomCategory =
  | 'sleep'
  | 'mood'
  | 'energy'
  | 'vasomotor' // hot flushes / night sweats
  | 'pain'
  | 'digestive'
  | 'cognitive'
  | 'cycle'
  | 'genitourinary'
  | 'other';

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface User {
  id: Id;
  displayName: string;
  age?: number;
  /** Symptom ids the user has pinned to their daily check-in. */
  pinnedSymptomIds: Id[];
  /** Set during onboarding — why they downloaded the app. */
  onboardingReason?: OnboardingReason;
  preferences: UserPreferences;
  createdAt: IsoDate;
}

export interface UserPreferences {
  /** Cosmetic only in Phase 0. */
  reminderTime?: string; // `HH:mm`
  remindersEnabled: boolean;
  /** Whether cycle tracking surfaces are shown at all. */
  cycleTrackingEnabled: boolean;
}

export type OnboardingReason =
  | 'periods_changed'
  | 'poor_sleep'
  | 'not_myself'
  | 'hot_flushes'
  | 'considering_hrt'
  | 'started_hrt'
  | 'understand'
  | 'other';

// ---------------------------------------------------------------------------
// Symptoms
// ---------------------------------------------------------------------------

/** A trackable symptom definition (the catalogue, not a logged value). */
export interface Symptom {
  id: Id;
  /** Stable machine key, e.g. `sleep`, `hot_flushes`. */
  key: string;
  label: string;
  category: SymptomCategory;
  /** Short helper text shown under the label. */
  description?: string;
  /** Lucide icon name, resolved in the UI layer. */
  icon: string;
}

/** A single symptom reading captured within a daily check-in. */
export interface SymptomEntry {
  symptomId: Id;
  severity: Severity;
}

// ---------------------------------------------------------------------------
// Context tags ("what changed?")
// ---------------------------------------------------------------------------

export type ContextTagGroup = 'lifestyle' | 'health' | 'treatment';

export interface ContextTag {
  id: Id;
  key: string;
  label: string;
  group: ContextTagGroup;
  icon: string;
}

// ---------------------------------------------------------------------------
// Daily check-in & notes
// ---------------------------------------------------------------------------

export interface DailyNote {
  id: Id;
  date: IsoDate;
  text: string;
  createdAt: string; // ISO datetime
}

export interface DailyCheckIn {
  id: Id;
  date: IsoDate;
  /** Overall wellbeing for the day. */
  wellbeing: WellbeingLevel;
  /** Individual symptom readings (only those the user logged). */
  symptoms: SymptomEntry[];
  /** Context tag ids selected for the day. */
  contextTagIds: Id[];
  /** Optional free-text note. */
  note?: string;
  /** User flagged the day as unusual, for later analysis. */
  flaggedUnusual: boolean;
  completedAt: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Cycle & periods
// ---------------------------------------------------------------------------

export type FlowLevel = 'spotting' | 'light' | 'medium' | 'heavy';

/** A single day marked as a period day. */
export interface PeriodEntry {
  id: Id;
  date: IsoDate;
  flow: FlowLevel;
}

/** A derived/observed menstrual cycle (start to next start). */
export interface CycleEntry {
  id: Id;
  startDate: IsoDate;
  /** End of bleeding (not end of cycle). */
  bleedEndDate?: IsoDate;
  /** Length in days from this start to the next start, if known. */
  lengthDays?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Treatments & interventions
// ---------------------------------------------------------------------------

export type TreatmentCategory =
  | 'hrt'
  | 'medication'
  | 'supplement'
  | 'lifestyle'
  | 'other';

export interface TreatmentEvent {
  id: Id;
  date: IsoDate;
  category: TreatmentCategory;
  title: string;
  description?: string;
  /** e.g. "50mcg patch, twice weekly". */
  dosage?: string;
  /** Optional note intended for/from a clinician. */
  clinicianNote?: string;
}

// ---------------------------------------------------------------------------
// Insights (mock, illustrative)
// ---------------------------------------------------------------------------

export type InsightKind = 'trend' | 'association' | 'cycle' | 'summary';
export type InsightTone = 'positive' | 'neutral' | 'watch';

export interface Insight {
  id: Id;
  kind: InsightKind;
  tone: InsightTone;
  title: string;
  body: string;
  /** Cautious framing label, e.g. "associated with". */
  framing?: string;
  /** Always true in Phase 0 — these are illustrative examples. */
  isExample: boolean;
  /** Optional tiny sparkline series for the card (0–1 normalised). */
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
}

export interface AppointmentSummary {
  id: Id;
  rangeStart: IsoDate;
  rangeEnd: IsoDate;
  mostDisruptiveSymptoms: RankedSymptom[];
  cycleSummary: string;
  treatmentEventIds: Id[];
  symptomTrendNote: string;
  discussionPoints: string[];
  generatedAt: string; // ISO datetime
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
  /** Body as an array of paragraphs (placeholder content in Phase 0). */
  body: string[];
  readMinutes: number;
  reviewedBy?: string;
  reviewedAt?: IsoDate;
  sources: LearningSource[];
}
