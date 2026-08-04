import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';
import type { SearchCriteria } from '@/domain/types';
import { criteriaToSearchParams } from '@/domain/url';
import {
  getJourneyProvider,
  resetJourneyProviderForTests,
} from '@/data/provider/provider-registry';
import { JourneyDetailPage } from './JourneyDetailPage';

const criteria: SearchCriteria = {
  origin: 'DXB',
  destination: 'MAN',
  departureDate: '2026-09-15',
  pax: { adults: 1, children: 0 },
  budget: { amount: 2500, currency: 'USD' },
  cabin: 'economy',
  preferences: ['culture'],
  maxStopovers: 2,
  minStopoverNights: 1,
  maxStopoverNights: 2,
};

const qs = criteriaToSearchParams(criteria).toString();

async function firstJourneyId(): Promise<string> {
  const provider = getJourneyProvider();
  const result = await provider.searchJourneys(criteria);
  const journey = result.journeys[0];
  expect(journey).toBeDefined();
  return journey.id;
}

describe('JourneyDetailPage', () => {
  beforeEach(() => {
    resetJourneyProviderForTests();
  });

  it('renders a journey with exactly one page-level h1 (route title)', async () => {
    const id = await firstJourneyId();
    renderWithProviders(<JourneyDetailPage />, {
      route: `/journeys/${encodeURIComponent(id)}?${qs}`,
      path: '/journeys/:journeyId',
    });

    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent(/→/); // "Dubai → Manchester"
    // Heading order integrity: a single h1 on the page.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('surfaces the Journey Score panel and itinerary', async () => {
    const id = await firstJourneyId();
    renderWithProviders(<JourneyDetailPage />, {
      route: `/journeys/${encodeURIComponent(id)}?${qs}`,
      path: '/journeys/:journeyId',
    });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('heading', { name: /your itinerary/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /journey score/i })).toBeInTheDocument();
  });

  it('is accessible (no axe violations) in the loaded state', async () => {
    const id = await firstJourneyId();
    const { container } = renderWithProviders(<JourneyDetailPage />, {
      route: `/journeys/${encodeURIComponent(id)}?${qs}`,
      path: '/journeys/:journeyId',
    });

    await screen.findByRole('heading', { level: 1 });
    await expectNoA11yViolations(container);
  });

  it('shows an error state for an unknown journey id', async () => {
    renderWithProviders(<JourneyDetailPage />, {
      route: `/journeys/does-not-exist?${qs}`,
      path: '/journeys/:journeyId',
    });

    expect(await screen.findByText(/couldn't find that journey/i)).toBeInTheDocument();
  });
});
