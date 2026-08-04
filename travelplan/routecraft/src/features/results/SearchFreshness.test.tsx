import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';
import { SearchFreshness } from './SearchFreshness';

describe('SearchFreshness', () => {
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
        dataUpdatedAt={Date.now()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Updated just now');
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
        dataUpdatedAt={Date.now()}
      />,
    );

    const text = screen.getByRole('status').textContent ?? '';
    expect(text).not.toMatch(/synthetic|http|api|provider/i);
  });
});
