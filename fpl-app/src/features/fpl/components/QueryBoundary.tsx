import type { ReactNode } from "react";
import { EmptyState, ErrorMessage, LoadingSpinner } from "@/components/common";
import type { ApiError } from "@/services/api";

interface QueryBoundaryProps {
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  /** Whether the successful result is empty. */
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  /** Custom loading UI (e.g. a skeleton). Falls back to a spinner. */
  loadingFallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders the appropriate UI for a query's lifecycle: a spinner while loading,
 * a retryable error on failure, an empty state when there's no data, and the
 * children once data is available. Keeps every debug section consistent.
 */
export function QueryBoundary({
  isLoading,
  isError,
  error,
  isEmpty = false,
  onRetry,
  emptyMessage = "No data returned.",
  loadingFallback,
  children,
}: QueryBoundaryProps) {
  if (isLoading) {
    return (
      loadingFallback ?? <LoadingSpinner fullPage={false} className="py-8" />
    );
  }

  if (isError) {
    return (
      <ErrorMessage
        title="Failed to load data"
        message={
          error?.message ??
          "The FPL API request failed. Check your connection and try again."
        }
        onRetry={onRetry}
      />
    );
  }

  if (isEmpty) {
    return <EmptyState title="Nothing here" description={emptyMessage} />;
  }

  return <>{children}</>;
}
