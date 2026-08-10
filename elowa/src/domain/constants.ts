/**
 * Display metadata and ordered scales for domain enums.
 *
 * Keeping labels, ordering and colour keys here (rather than inline in
 * components) means the vocabulary of the product lives in one place.
 */

import type {
  FlowLevel,
  LearnCategory,
  OnboardingReason,
  RelativeStatus,
  Severity,
  TreatmentCategory,
} from './models';

// --- Relative status (elowa's primary "change from usual" scale) -----------

export interface RelativeStatusMeta {
  value: RelativeStatus;
  label: string;
  short: string;
  /** Signed deviation in severity units, used by the analysis engine. */
  delta: number;
  tone: 'positive' | 'neutral' | 'watch';
}

export const RELATIVE_STATUS_SCALE: readonly RelativeStatusMeta[] = [
  { value: 'better', label: 'Better than usual', short: 'Better', delta: -1, tone: 'positive' },
  { value: 'about_usual', label: 'About usual', short: 'About usual', delta: 0, tone: 'neutral' },
  { value: 'a_little_worse', label: 'A little worse', short: 'A little worse', delta: 1, tone: 'watch' },
  { value: 'much_worse', label: 'Much worse', short: 'Much worse', delta: 2, tone: 'watch' },
] as const;

export function relativeStatusMeta(value: RelativeStatus): RelativeStatusMeta {
  return RELATIVE_STATUS_SCALE.find((s) => s.value === value) ?? RELATIVE_STATUS_SCALE[1]!;
}

// --- Severity (absolute, retained where useful) ----------------------------

export interface SeverityMeta {
  value: Severity;
  label: string;
  ordinal: number;
}

export const SEVERITY_SCALE: readonly SeverityMeta[] = [
  { value: 'none', label: 'None', ordinal: 0 },
  { value: 'mild', label: 'Mild', ordinal: 1 },
  { value: 'moderate', label: 'Moderate', ordinal: 2 },
  { value: 'strong', label: 'Strong', ordinal: 3 },
  { value: 'severe', label: 'Severe', ordinal: 4 },
] as const;

export function severityOrdinal(value: Severity): number {
  return SEVERITY_SCALE.find((s) => s.value === value)?.ordinal ?? 0;
}

export function severityFromOrdinal(ordinal: number): Severity {
  const clamped = Math.max(0, Math.min(4, Math.round(ordinal)));
  return SEVERITY_SCALE[clamped]!.value;
}

export function severityLabel(value: Severity): string {
  return SEVERITY_SCALE.find((s) => s.value === value)?.label ?? 'None';
}

// --- Flow ------------------------------------------------------------------

export const FLOW_LEVELS: readonly { value: FlowLevel; label: string }[] = [
  { value: 'spotting', label: 'Spotting' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
] as const;

export function flowLabel(value: FlowLevel): string {
  return FLOW_LEVELS.find((f) => f.value === value)?.label ?? value;
}

// --- Onboarding reasons ----------------------------------------------------

export const ONBOARDING_REASONS: readonly {
  value: OnboardingReason;
  label: string;
}[] = [
  { value: 'periods_changed', label: 'My periods have changed' },
  { value: 'poor_sleep', label: "I'm not sleeping properly" },
  { value: 'not_myself', label: "I don't feel like myself" },
  { value: 'hot_flushes', label: 'Hot flushes or night sweats' },
  { value: 'mood_different', label: 'My mood feels different' },
  { value: 'low_energy', label: "I'm struggling with energy" },
  { value: 'considering_hrt', label: "I'm considering HRT" },
  { value: 'started_hrt', label: "I've recently started HRT" },
  { value: 'understand', label: 'I want to understand what’s happening' },
  { value: 'other', label: 'Something else' },
] as const;

// --- Treatment categories --------------------------------------------------

export const TREATMENT_CATEGORY_META: Record<
  TreatmentCategory,
  { label: string; icon: string; accent: 'primary' | 'lilac' | 'sage' | 'coral' | 'beige' }
> = {
  hrt: { label: 'HRT', icon: 'Pill', accent: 'primary' },
  medication: { label: 'Medication', icon: 'Tablets', accent: 'lilac' },
  supplement: { label: 'Supplement', icon: 'Leaf', accent: 'sage' },
  lifestyle: { label: 'Lifestyle', icon: 'Footprints', accent: 'beige' },
  other: { label: 'Other', icon: 'Circle', accent: 'coral' },
};

export const TREATMENT_CATEGORY_ORDER: readonly TreatmentCategory[] = [
  'hrt',
  'medication',
  'supplement',
  'lifestyle',
  'other',
] as const;

// --- Learn categories ------------------------------------------------------

export const LEARN_CATEGORY_META: Record<LearnCategory, { label: string; icon: string }> = {
  understanding: { label: 'Understanding perimenopause', icon: 'Compass' },
  sleep: { label: 'Sleep', icon: 'Moon' },
  vasomotor: { label: 'Hot flushes & night sweats', icon: 'Thermometer' },
  mood: { label: 'Mood & anxiety', icon: 'HeartPulse' },
  brain_fog: { label: 'Brain fog', icon: 'BrainCircuit' },
  cycle: { label: 'Cycle changes', icon: 'CalendarClock' },
  hrt: { label: 'HRT basics', icon: 'Pill' },
  genitourinary: { label: 'Vaginal & urinary symptoms', icon: 'Droplets' },
  lifestyle: { label: 'Lifestyle', icon: 'Salad' },
  clinician: { label: 'Talking to your clinician', icon: 'Stethoscope' },
};

export const LEARN_CATEGORY_ORDER: readonly LearnCategory[] = [
  'understanding',
  'sleep',
  'vasomotor',
  'mood',
  'brain_fog',
  'cycle',
  'hrt',
  'genitourinary',
  'lifestyle',
  'clinician',
] as const;
