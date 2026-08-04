import { lazy, Suspense, useState, type ReactNode } from 'react';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/use-theme';
import { flags } from '@/config/flags';
import { log } from '@/lib/logger';

const queryLogger = log.child('query');

// Lazily loaded and only mounted behind the flag, so it stays out of the
// runtime unless explicitly enabled.
const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })),
);

function ThemeGate({ children }: { children: ReactNode }) {
  // Applies the persisted theme class to <html> on mount / change.
  useTheme();
  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) =>
            queryLogger.error('query failed', {
              key: query.queryKey,
              error: error instanceof Error ? error.message : String(error),
            }),
        }),
        mutationCache: new MutationCache({
          onError: (error) =>
            queryLogger.error('mutation failed', {
              error: error instanceof Error ? error.message : String(error),
            }),
        }),
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeGate>
        <TooltipProvider delayDuration={200}>
          {children}
          {flags.queryDevtools && (
            <Suspense fallback={null}>
              <ReactQueryDevtools initialIsOpen={false} />
            </Suspense>
          )}
        </TooltipProvider>
      </ThemeGate>
    </QueryClientProvider>
  );
}
