import type { Insight } from '@/domain/models';

/**
 * Illustrative, mock insight cards. Every card is flagged `isExample: true` and
 * uses cautious, association-based language — never causal claims. In later
 * phases these will be derived from real (on-device) trend calculations.
 */
export const MOCK_INSIGHTS: readonly Insight[] = [
  {
    id: 'ins_night_sweats',
    kind: 'trend',
    tone: 'positive',
    title: 'Night sweats have reduced',
    framing: 'appears to be improving',
    body: 'Moderate-to-severe night sweats have been reported less often over the past three weeks.',
    isExample: true,
    spark: [0.9, 0.95, 0.85, 0.8, 0.6, 0.5, 0.4, 0.35, 0.3],
  },
  {
    id: 'ins_sleep_mood',
    kind: 'association',
    tone: 'neutral',
    title: 'Sleep and mood often move together',
    framing: 'tends to occur alongside',
    body: 'Lower sleep scores frequently occur alongside lower mood scores.',
    isExample: true,
    spark: [0.4, 0.7, 0.5, 0.8, 0.45, 0.75, 0.5, 0.85, 0.6],
  },
  {
    id: 'ins_cycle_length',
    kind: 'cycle',
    tone: 'watch',
    title: 'Your cycle length is changing',
    framing: 'may be related to perimenopause',
    body: 'Recent cycles have ranged between 23 and 45 days.',
    isExample: true,
    spark: [0.5, 0.5, 0.4, 0.9, 0.3, 0.95],
  },
  {
    id: 'ins_alcohol_flushes',
    kind: 'association',
    tone: 'watch',
    title: 'Hot flushes appear more common after alcohol',
    framing: 'appears more common when',
    body: 'Days tagged with alcohol are more often followed by stronger hot flushes.',
    isExample: true,
    spark: [0.3, 0.8, 0.35, 0.85, 0.4, 0.9],
  },
  {
    id: 'ins_walks_energy',
    kind: 'association',
    tone: 'positive',
    title: 'Energy tends to be higher on days you walk',
    framing: 'associated with',
    body: 'Since starting evening walks, energy has been logged as slightly higher on average.',
    isExample: true,
    spark: [0.4, 0.45, 0.5, 0.6, 0.65, 0.7],
  },
];
