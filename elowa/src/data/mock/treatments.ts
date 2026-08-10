import type { TreatmentEvent } from '@/domain/models';

/**
 * Mock treatment / intervention timeline for Emma. These events are overlaid
 * against symptom history conceptually (the HRT start and dose change drive the
 * "night sweats reduced" narrative in the seeded data).
 */
export const MOCK_TREATMENTS: readonly TreatmentEvent[] = [
  {
    id: 'trt_hrt_start',
    date: '2026-03-12',
    category: 'hrt',
    title: 'Started HRT',
    description: 'Began transdermal oestrogen, discussed with GP.',
    dosage: '25mcg estradiol patch, twice weekly',
    clinicianNote: 'Review in 8 weeks to assess symptom response.',
  },
  {
    id: 'trt_hrt_adjust',
    date: '2026-04-08',
    category: 'hrt',
    title: 'Dose adjusted',
    description: 'Increased dose as night sweats were still frequent.',
    dosage: '50mcg estradiol patch, twice weekly',
  },
  {
    id: 'trt_alcohol',
    date: '2026-04-22',
    category: 'lifestyle',
    title: 'Reduced alcohol during weekdays',
    description: 'Cutting back on weekday drinks to see if flushes settle.',
  },
  {
    id: 'trt_walks',
    date: '2026-05-02',
    category: 'lifestyle',
    title: 'Started regular evening walks',
    description: 'A 20–30 minute walk most evenings after dinner.',
  },
];
