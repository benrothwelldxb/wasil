/**
 * Display metadata and ordered scales for domain enums.
 *
 * Keeping labels, ordering and colour keys here (rather than inline in
 * components) means the vocabulary of the product lives in one place.
 */

import type {
  LearnCategory,
  OnboardingReason,
  Severity,
  TreatmentCategory,
  WellbeingLevel,
} from './models';

// --- Wellbeing -------------------------------------------------------------

export interface WellbeingMeta {
  value: WellbeingLevel;
  label: string;
  /** Lucide icon name. */
  icon: string;
  /** Token colour key used for the selected state. */
  accent: 'sage' | 'primary' | 'beige' | 'coral';
}

export const WELLBEING_LEVELS: readonly WellbeingMeta[] = [
  { value: 'great', label: 'Great', icon: 'Sun', accent: 'sage' },
  { value: 'okay', label: 'Okay', icon: 'CloudSun', accent: 'primary' },
  { value: 'not_great', label: 'Not great', icon: 'Cloud', accent: 'beige' },
  { value: 'rough', label: 'Rough', icon: 'CloudRain', accent: 'coral' },
] as const;

// --- Severity --------------------------------------------------------------

export interface SeverityMeta {
  value: Severity;
  label: string;
  /** 0–4 ordinal for bars / comparisons. */
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

export function severityLabel(value: Severity): string {
  return SEVERITY_SCALE.find((s) => s.value === value)?.label ?? 'None';
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

// --- Learn categories ------------------------------------------------------

export const LEARN_CATEGORY_META: Record<
  LearnCategory,
  { label: string; icon: string }
> = {
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

/** Ordered list for the Learn hub. */
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
