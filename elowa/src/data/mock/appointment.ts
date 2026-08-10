import type { AppointmentSummary } from '@/domain/models';

/**
 * Mock appointment summary. Designed to demonstrate that the eventual output
 * could fit on a single printed page: a date range, the most disruptive
 * symptoms, cycle changes, the treatment timeline, a trend note and a short
 * list of discussion points.
 */
export const MOCK_APPOINTMENT: AppointmentSummary = {
  id: 'appt_summary_1',
  rangeStart: '2026-02-24',
  rangeEnd: '2026-05-22',
  mostDisruptiveSymptoms: [
    { symptomId: 'sym_sleep', label: 'Poor sleep', disruption: 0.92 },
    { symptomId: 'sym_mood', label: 'Anxiety / low mood', disruption: 0.74 },
    { symptomId: 'sym_hot_flushes', label: 'Hot flushes', disruption: 0.61 },
  ],
  cycleSummary:
    'Two cycles recorded in this period, ranging from 23 to 45 days — increasingly irregular compared with earlier in the year.',
  treatmentEventIds: ['trt_hrt_start', 'trt_hrt_adjust', 'trt_alcohol', 'trt_walks'],
  symptomTrendNote:
    'Night sweats and hot flushes have eased since the HRT dose was adjusted in early April. Sleep remains disrupted on some nights, often alongside lower mood the next day.',
  discussionPoints: [
    'Whether the current HRT dose is the right level.',
    'Ongoing early-morning waking despite improvement in night sweats.',
    'Low mood on days that follow poor sleep.',
  ],
  generatedAt: '2026-05-22T09:00:00.000Z',
};
