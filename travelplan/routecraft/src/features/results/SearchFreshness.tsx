import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const LIVE_LABEL_INTERVAL_MS = 30_000;

export interface SearchFreshnessProps {
  isFetching: boolean;
  isError: boolean;
  /** query.failureCount */
  failureCount: number;
  /** query.dataUpdatedAt (epoch ms; 0 if never) */
  dataUpdatedAt: number;
}

function formatFreshness(dataUpdatedAt: number, now: number): string {
  const deltaMs = now - dataUpdatedAt;

  if (deltaMs < 60_000) return 'Updated just now';

  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `Updated ${minutes}m ago`;

  const updated = new Date(dataUpdatedAt);
  const hours = updated.getHours().toString().padStart(2, '0');
  const mins = updated.getMinutes().toString().padStart(2, '0');
  return `Updated at ${hours}:${mins}`;
}

/**
 * Provider-agnostic freshness/retry status line for the results header.
 * Driven entirely by TanStack Query state — never learns or reveals which
 * data provider served the results.
 */
export function SearchFreshness({
  isFetching,
  isError,
  failureCount,
  dataUpdatedAt,
}: SearchFreshnessProps): JSX.Element | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (isFetching || isError || dataUpdatedAt <= 0) return;

    const id = window.setInterval(() => setNow(Date.now()), LIVE_LABEL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isFetching, isError, dataUpdatedAt]);

  if (isError) return null;

  let label: string | null = null;
  if (isFetching && failureCount > 0) {
    label = 'Retrying…';
  } else if (isFetching) {
    label = 'Refreshing…';
  } else if (dataUpdatedAt > 0) {
    label = formatFreshness(dataUpdatedAt, now);
  }

  if (!label) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} aria-hidden="true" />
      {label}
    </p>
  );
}
