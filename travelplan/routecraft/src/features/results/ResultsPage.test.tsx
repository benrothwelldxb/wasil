import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitForElementToBeRemoved } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';
import type { SearchCriteria, SearchResult } from '@/domain/types';
import type { JourneyProvider } from '@/data/provider/JourneyProvider';
import { criteriaToSearchParams } from '@/domain/url';
import { generateSearchResult } from '@/data/synthetic/SyntheticJourneyProvider';
import { ResultsPage } from './ResultsPage';

// Deterministic provider double, injected via a hoisted ref (same pattern as
// use-journey-search.test) so the page's data source is fully controlled.
const h = vi.hoisted(() => ({ provider: undefined as unknown as JourneyProvider }));
vi.mock('@/data/provider/provider-registry', () => ({
  getJourneyProvider: () => h.provider,
}));

const baseCriteria: SearchCriteria = {
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

const fullResult: SearchResult = generateSearchResult(baseCriteria);

function providerReturning(result: SearchResult): JourneyProvider {
  return {
    id: 'fake',
    searchJourneys: async () => result,
    getJourney: async () => null,
  };
}

const route = { route: `/results?${criteriaToSearchParams(baseCriteria).toString()}`, path: '/results' };

describe('ResultsPage', () => {
  beforeEach(() => {
    h.provider = providerReturning(fullResult);
  });

  it('shows the crafting/loading state on first render', () => {
    renderWithProviders(<ResultsPage />, route);
    expect(screen.getByText('Crafting journeys…')).toBeInTheDocument();
  });

  it('renders journey cards once the search resolves', async () => {
    const { container } = renderWithProviders(<ResultsPage />, route);

    await waitForElementToBeRemoved(() => screen.queryByText('Crafting journeys…'));

    const rings = await screen.findAllByRole('img', { name: /journey score/i });
    expect(rings.length).toBeGreaterThan(0);
    expect(screen.getByText(/within budget/i)).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  it('renders the empty state when the provider returns no journeys', async () => {
    h.provider = providerReturning({ ...fullResult, journeys: [] });
    renderWithProviders(<ResultsPage />, route);

    expect(await screen.findByText('No journeys within your budget')).toBeInTheDocument();
  });

  it('renders an error state for an invalid search link', () => {
    renderWithProviders(<ResultsPage />, { route: '/results?origin=not-valid', path: '/results' });
    expect(screen.getByText(/search link looks invalid/i)).toBeInTheDocument();
  });
});

