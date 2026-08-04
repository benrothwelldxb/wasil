import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';

import { ErrorFallback } from '@/components/shared/ErrorFallback';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback renderer. Defaults to the shared `ErrorFallback`. */
  fallback?: ComponentType<{ error: Error; reset: () => void }>;
  /**
   * Called once per catch, after `getDerivedStateFromError` has already
   * updated state. Intentionally undecorated here — Phase One wires
   * `log.error` (and any future reporting) through this prop rather than
   * this component importing the logger directly, so the boundary itself
   * stays free of a logging dependency.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * When any entry changes (shallow, by `!==`) between renders, an active
   * error is cleared automatically — e.g. pass the current route path or
   * search params so navigating away from the failing view recovers it.
   */
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

function haveResetKeysChanged(previous: unknown[] | undefined, next: unknown[] | undefined): boolean {
  if (previous === next) {
    return false;
  }
  if (!previous || !next) {
    return previous !== next;
  }
  if (previous.length !== next.length) {
    return true;
  }
  return previous.some((key, index) => key !== next[index]);
}

/**
 * Class-based React error boundary. Catches thrown render/lifecycle errors
 * in its subtree and renders a fallback instead of unmounting the whole
 * app. See `docs/conventions/errors.md` for how this composes with the
 * root boundary, route `errorElement`s, and query-level error UI.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && haveResetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback: Fallback } = this.props;

    if (error) {
      if (Fallback) {
        return <Fallback error={error} reset={this.reset} />;
      }
      return <ErrorFallback error={error} reset={this.reset} />;
    }

    return children;
  }
}
