/**
 * Static catalogues: the trackable symptoms and the contextual tags. These are
 * reference data (definitions), not logged values. User-created ("custom")
 * symptoms and tags are stored separately and merged in via the helpers below.
 */

import type { ContextTag, Symptom } from '@/domain/models';

export const SYMPTOMS: readonly Symptom[] = [
  { id: 'sym_sleep', key: 'sleep', label: 'Sleep', category: 'sleep', description: 'Quality and disruption overnight', icon: 'Moon' },
  { id: 'sym_energy', key: 'energy', label: 'Energy', category: 'energy', description: 'Fatigue and get-up-and-go', icon: 'BatteryMedium' },
  { id: 'sym_mood', key: 'mood', label: 'Mood', category: 'mood', description: 'Low mood or irritability', icon: 'HeartPulse' },
  { id: 'sym_anxiety', key: 'anxiety', label: 'Anxiety', category: 'mood', description: 'Worry, tension or unease', icon: 'Wind' },
  { id: 'sym_brain_fog', key: 'brain_fog', label: 'Brain fog', category: 'cognitive', description: 'Focus, memory and clarity', icon: 'BrainCircuit' },
  { id: 'sym_hot_flushes', key: 'hot_flushes', label: 'Hot flushes', category: 'vasomotor', description: 'Daytime flushes', icon: 'Thermometer' },
  { id: 'sym_night_sweats', key: 'night_sweats', label: 'Night sweats', category: 'vasomotor', description: 'Overnight sweating', icon: 'Droplets' },
  { id: 'sym_headaches', key: 'headaches', label: 'Headaches', category: 'pain', description: 'Headaches or migraines', icon: 'Brain' },
  { id: 'sym_joint_aches', key: 'joint_aches', label: 'Joint / muscle aches', category: 'pain', description: 'Aches and stiffness', icon: 'Activity' },
  { id: 'sym_bloating', key: 'bloating', label: 'Bloating', category: 'digestive', description: 'Bloating and digestive changes', icon: 'CircleDot' },
  { id: 'sym_breast_tenderness', key: 'breast_tenderness', label: 'Breast tenderness', category: 'pain', description: 'Soreness or sensitivity', icon: 'Heart' },
  { id: 'sym_libido', key: 'libido', label: 'Libido', category: 'genitourinary', description: 'Changes in sex drive', icon: 'Flame' },
  { id: 'sym_vaginal', key: 'vaginal', label: 'Vaginal discomfort / dryness', category: 'genitourinary', description: 'Dryness or discomfort', icon: 'Droplet' },
  { id: 'sym_urinary', key: 'urinary', label: 'Urinary symptoms', category: 'genitourinary', description: 'Urgency or frequency', icon: 'Waves' },
  { id: 'sym_period_changes', key: 'period_changes', label: 'Period changes', category: 'cycle', description: 'Changes in your cycle', icon: 'CalendarClock' },
];

/** Sensible default pins offered to a brand-new user before onboarding choices. */
export const DEFAULT_PINNED_SYMPTOM_IDS: readonly string[] = ['sym_sleep', 'sym_mood', 'sym_hot_flushes'];

export const CONTEXT_TAGS: readonly ContextTag[] = [
  // Life
  { id: 'ctx_stress', key: 'stress', label: 'Stressful day', group: 'life', icon: 'Zap' },
  { id: 'ctx_travel', key: 'travel', label: 'Travel', group: 'life', icon: 'Plane' },
  { id: 'ctx_poor_sleep', key: 'poor_sleep', label: 'Poor sleep', group: 'life', icon: 'Bed' },
  { id: 'ctx_busy', key: 'busy', label: 'Busy day', group: 'life', icon: 'Briefcase' },
  { id: 'ctx_routine', key: 'routine', label: 'Unusual routine', group: 'life', icon: 'Repeat' },
  // Lifestyle
  { id: 'ctx_alcohol', key: 'alcohol', label: 'Alcohol', group: 'lifestyle', icon: 'Wine' },
  { id: 'ctx_caffeine', key: 'caffeine', label: 'Caffeine', group: 'lifestyle', icon: 'Coffee' },
  { id: 'ctx_exercise', key: 'exercise', label: 'Exercise', group: 'lifestyle', icon: 'Dumbbell' },
  { id: 'ctx_less_exercise', key: 'less_exercise', label: 'Less exercise', group: 'lifestyle', icon: 'Minus' },
  { id: 'ctx_late_meal', key: 'late_meal', label: 'Late meal', group: 'lifestyle', icon: 'Utensils' },
  // Health
  { id: 'ctx_illness', key: 'illness', label: 'Illness', group: 'health', icon: 'Thermometer' },
  { id: 'ctx_period', key: 'period', label: 'Period', group: 'health', icon: 'Droplet' },
  { id: 'ctx_hrt_change', key: 'hrt_change', label: 'HRT change', group: 'health', icon: 'Pill' },
  { id: 'ctx_medication_change', key: 'medication_change', label: 'Medication change', group: 'health', icon: 'Tablets' },
  { id: 'ctx_supplement', key: 'supplement', label: 'New supplement', group: 'health', icon: 'Leaf' },
];

/** The subset shown on the Today "anything worth noting?" quick step. */
export const QUICK_CONTEXT_TAG_IDS: readonly string[] = [
  'ctx_period',
  'ctx_poor_sleep',
  'ctx_stress',
  'ctx_alcohol',
  'ctx_exercise',
  'ctx_travel',
  'ctx_illness',
  'ctx_hrt_change',
];

// --- Lookups that include user-created symptoms/tags -----------------------

export function findSymptomIn(symptoms: readonly Symptom[], id: string): Symptom | undefined {
  return symptoms.find((s) => s.id === id);
}

export function findContextTagIn(tags: readonly ContextTag[], id: string): ContextTag | undefined {
  return tags.find((t) => t.id === id);
}

/** Catalogue-only lookup (no custom items). */
export function findSymptom(id: string): Symptom | undefined {
  return SYMPTOMS.find((s) => s.id === id);
}

export function findContextTag(id: string): ContextTag | undefined {
  return CONTEXT_TAGS.find((t) => t.id === id);
}
