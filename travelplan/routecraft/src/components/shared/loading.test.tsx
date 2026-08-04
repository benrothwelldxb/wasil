import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DelayedFallback, Loadable, PageSkeleton } from '@/components/shared/loading';

describe('DelayedFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing before delayMs elapses', () => {
    render(
      <DelayedFallback delayMs={200}>
        <p>content</p>
      </DelayedFallback>,
    );

    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('renders children once delayMs has elapsed', () => {
    render(
      <DelayedFallback delayMs={200}>
        <p>content</p>
      </DelayedFallback>,
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('does not render children early, right up to the boundary', () => {
    render(
      <DelayedFallback delayMs={200}>
        <p>content</p>
      </DelayedFallback>,
    );

    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });
});

describe('PageSkeleton', () => {
  it('exposes a status role with an accessible name', () => {
    render(<PageSkeleton />);

    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status).toBeInTheDocument();
  });
});

describe('Loadable', () => {
  it('renders non-suspended children immediately', () => {
    render(
      <Loadable>
        <p>ready content</p>
      </Loadable>,
    );

    expect(screen.getByText('ready content')).toBeInTheDocument();
  });

  it('accepts a custom fallback override', () => {
    render(
      <Loadable fallback={<p>custom fallback</p>}>
        <p>ready content</p>
      </Loadable>,
    );

    expect(screen.getByText('ready content')).toBeInTheDocument();
  });
});
