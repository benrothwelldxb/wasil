import type { SearchCriteria } from '@/domain/types';

export interface ExampleSearch {
  label: string;
  tagline: string;
  criteria: SearchCriteria;
}

const departureDate = '2026-09-15';

export const EXAMPLE_SEARCHES: ExampleSearch[] = [
  {
    label: 'Dubai → Manchester',
    tagline: 'A culture stopover beats the direct red-eye',
    criteria: {
      origin: 'DXB',
      destination: 'MAN',
      departureDate,
      pax: { adults: 1, children: 0 },
      budget: { amount: 1500, currency: 'USD' },
      cabin: 'economy',
      preferences: ['culture', 'food'],
      maxStopovers: 2,
      minStopoverNights: 1,
      maxStopoverNights: 2,
    },
  },
  {
    label: 'London → Tokyo',
    tagline: 'Break up the long haul in style',
    criteria: {
      origin: 'LHR',
      destination: 'NRT',
      departureDate,
      pax: { adults: 2, children: 0 },
      budget: { amount: 4200, currency: 'USD' },
      cabin: 'economy',
      preferences: ['food', 'relaxation'],
      maxStopovers: 2,
      minStopoverNights: 1,
      maxStopoverNights: 2,
    },
  },
  {
    label: 'New York → Rome',
    tagline: 'A taste of a third city on the way',
    criteria: {
      origin: 'JFK',
      destination: 'FCO',
      departureDate,
      pax: { adults: 2, children: 1 },
      budget: { amount: 3800, currency: 'USD' },
      cabin: 'economy',
      preferences: ['culture'],
      maxStopovers: 1,
      minStopoverNights: 1,
      maxStopoverNights: 2,
    },
  },
];
