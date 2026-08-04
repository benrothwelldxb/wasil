import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';
import { SearchFreshness } from './SearchFreshness';

// Freeze the clock so "Updated just now" is deterministic rather than relying
// on the wall clock being within ~1s of the fixture's timestamp.
const NOW = new Date('2026-08-04T12:00:00Z').getTime();

describe('SearchFreshness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a refreshing label while fetching with no failures', () => {
    render(
      <SearchFreshness isFetching isError={false} failureCount={0} dataUpdatedAt={0} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…');
  });

  it('shows a retrying label while fetching after a failure', () => {
    render(
      <SearchFreshness isFetching isError={false} failureCount={1} dataUpdatedAt={0} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Retrying…');
  });

  it('shows a relative freshness label once settled with recent data', async () => {
    const { container } = render(
      <SearchFreshness
        isFetching={false}
        isError={false}
        failureCount={0}
        dataUpdatedAt={NOW}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
    // axe-core drives its own timers/promises; restore real timers before
    // running it or it never settles under the frozen clock.
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when the query is in an error state', () => {
    const { container } = render(
      <SearchFreshness isFetching={false} isError failureCount={1} dataUpdatedAt={0} />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when settled with no prior data', () => {
    const { container } = render(
      <SearchFreshness isFetching={false} isError={false} failureCount={0} dataUpdatedAt={0} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('never mentions a data provider or transport detail — freshness copy only', () => {
    render(
      <SearchFreshness
        isFetching={false}
        isError={false}
        failureCount={0}
        dataUpdatedAt={NOW}
      />,
    );

    const text = screen.getByRole('status').textContent ?? '';
    expect(text).not.toMatch(/synthetic|http|api|provider/i);
  });
});
