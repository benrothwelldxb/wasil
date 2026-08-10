/**
 * Static catalogues: the trackable symptoms and the "what changed?" context
 * tags. These are reference data (definitions), not logged values.
 */

import type { ContextTag, Symptom } from '@/domain/models';

export const SYMPTOMS: readonly Symptom[] = [
  {
    id: 'sym_sleep',
    key: 'sleep',
    label: 'Sleep',
    category: 'sleep',
    description: 'Quality and disruption overnight',
    icon: 'Moon',
  },
  {
    id: 'sym_mood',
    key: 'mood',
    label: 'Mood',
    category: 'mood',
    description: 'Low mood, irritability or anxiety',
    icon: 'HeartPulse',
  },
  {
    id: 'sym_energy',
    key: 'energy',
    label: 'Energy',
    category: 'energy',
    description: 'Fatigue and get-up-and-go',
    icon: 'BatteryMedium',
  },
  {
    id: 'sym_hot_flushes',
    key: 'hot_flushes',
    label: 'Hot flushes',
    category: 'vasomotor',
    description: 'Daytime flushes',
    icon: 'Thermometer',
  },
  {
    id: 'sym_night_sweats',
    key: 'night_sweats',
    label: 'Night sweats',
    category: 'vasomotor',
    description: 'Overnight sweating',
    icon: 'Droplets',
  },
  {
    id: 'sym_pain',
    key: 'pain',
    label: 'Pain / aches',
    category: 'pain',
    description: 'Joint aches and body pain',
    icon: 'Activity',
  },
  {
    id: 'sym_bloating',
    key: 'bloating',
    label: 'Bloating',
    category: 'digestive',
    description: 'Bloating and digestive changes',
    icon: 'CircleDot',
  },
  {
    id: 'sym_brain_fog',
    key: 'brain_fog',
    label: 'Brain fog',
    category: 'cognitive',
    description: 'Focus, memory and clarity',
    icon: 'BrainCircuit',
  },
  {
    id: 'sym_other',
    key: 'other',
    label: 'Other symptoms',
    category: 'other',
    description: 'Anything else worth noting',
    icon: 'Sparkles',
  },
];

/** Look up a symptom by id (returns undefined if unknown). */
export function findSymptom(id: string): Symptom | undefined {
  return SYMPTOMS.find((s) => s.id === id);
}

export const CONTEXT_TAGS: readonly ContextTag[] = [
  { id: 'ctx_poor_sleep', key: 'poor_sleep', label: 'Poor sleep', group: 'lifestyle', icon: 'MoonStar' },
  { id: 'ctx_stress', key: 'stress', label: 'Stressful day', group: 'lifestyle', icon: 'Wind' },
  { id: 'ctx_alcohol', key: 'alcohol', label: 'Alcohol', group: 'lifestyle', icon: 'Wine' },
  { id: 'ctx_exercise', key: 'exercise', label: 'Exercise', group: 'lifestyle', icon: 'Footprints' },
  { id: 'ctx_illness', key: 'illness', label: 'Illness', group: 'health', icon: 'Thermometer' },
  { id: 'ctx_travel', key: 'travel', label: 'Travel', group: 'lifestyle', icon: 'Plane' },
  { id: 'ctx_hrt_change', key: 'hrt_change', label: 'HRT change', group: 'treatment', icon: 'Pill' },
  { id: 'ctx_medication_change', key: 'medication_change', label: 'Medication change', group: 'treatment', icon: 'Tablets' },
];

export function findContextTag(id: string): ContextTag | undefined {
  return CONTEXT_TAGS.find((t) => t.id === id);
}

/** The subset shown on the Today "Anything different today?" card. */
export const TODAY_CONTEXT_TAG_IDS: readonly string[] = [
  'ctx_poor_sleep',
  'ctx_stress',
  'ctx_alcohol',
  'ctx_exercise',
  'ctx_travel',
  'ctx_medication_change',
];
