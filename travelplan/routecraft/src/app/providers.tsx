import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/use-theme';

function ThemeGate({ children }: { children: ReactNode }) {
  // Applies the persisted theme class to <html> on mount / change.
  useTheme();
  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </ThemeGate>
    </QueryClientProvider>
  );
}
