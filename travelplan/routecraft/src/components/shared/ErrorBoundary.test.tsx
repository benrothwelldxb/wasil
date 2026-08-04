import type { ErrorInfo } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ErrorFallback } from '@/components/shared/ErrorFallback';
import { env } from '@/config/env';

/** Throws on render when `shouldThrow` is true; renders safe content otherwise. */
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('boom');
  }
  return <p>safe content</p>;
}

function CustomFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <p>custom fallback: {error.message}</p>
      <button type="button" onClick={reset}>
        custom reset
      </button>
    </div>
  );
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <p>safe content</p>
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('catches a thrown render error and renders the default fallback', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Bomb shouldThrow />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('safe content')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('renders a custom `fallback` component when supplied', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <ErrorBoundary fallback={CustomFallback}>
          <Bomb shouldThrow />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('custom fallback: boom')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('reset() restores children once the child stops throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    const { rerender } = render(
      <MemoryRouter>
        <ErrorBoundary>
          <Bomb shouldThrow />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // The child no longer throws, but the boundary stays in its error state
    // until reset() is called.
    rerender(
      <MemoryRouter>
        <ErrorBoundary>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('safe content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('auto-resets when resetKeys changes between renders', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <MemoryRouter>
        <ErrorBoundary resetKeys={['a']}>
          <Bomb shouldThrow />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ErrorBoundary resetKeys={['b']}>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('safe content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('does not reset when resetKeys is unchanged', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <MemoryRouter>
        <ErrorBoundary resetKeys={['a']}>
          <Bomb shouldThrow />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ErrorBoundary resetKeys={['a']}>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('calls onError with the thrown error and React error info', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <MemoryRouter>
        <ErrorBoundary onError={onError}>
          <Bomb shouldThrow />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [error, info] = onError.mock.calls[0] as [Error, ErrorInfo];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
    expect(typeof info.componentStack).toBe('string');

    consoleSpy.mockRestore();
  });
});

describe('ErrorFallback', () => {
  it('renders with role="alert" and shows message/stack detail in the current (dev) environment', () => {
    // Sanity check: this suite runs under Vitest, where `env.isDev` is
    // true, so the assertions below exercise the dev-detail branch.
    expect(env.isDev).toBe(true);

    render(
      <MemoryRouter>
        <ErrorFallback error={new Error('boom')} reset={() => {}} />
      </MemoryRouter>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('exposes labelled, keyboard-focusable "Try again" and "Back to search" actions', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(
      <MemoryRouter>
        <ErrorFallback error={new Error('boom')} reset={reset} />
      </MemoryRouter>,
    );

    const tryAgain = screen.getByRole('button', { name: 'Try again' });
    const backToSearch = screen.getByRole('link', { name: 'Back to search' });

    await user.tab();
    expect(tryAgain).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(reset).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(backToSearch).toHaveFocus();
    expect(backToSearch).toHaveAttribute('href', '/');
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <ErrorFallback error={new Error('boom')} reset={() => {}} />
      </MemoryRouter>,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
