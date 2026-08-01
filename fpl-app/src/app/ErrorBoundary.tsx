import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorMessage } from "@/components/common";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level React error boundary. Catches render-time errors anywhere below it
 * and shows a recoverable fallback instead of a blank screen.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Hook for an error-reporting service (Sentry, etc.).
    if (import.meta.env.DEV) {
      console.error("Uncaught error:", error, info);
    }
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="flex min-h-dvh items-center justify-center p-6">
          <ErrorMessage
            title="Application error"
            message={error.message}
            onRetry={this.reset}
            className="max-w-md"
          />
        </div>
      );
    }
    return this.props.children;
  }
}
