import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { router } from '@/app/router';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ErrorFallback } from '@/components/shared/ErrorFallback';
import { log } from '@/lib/logger';

export default function App() {
  return (
    <AppProviders>
      <ErrorBoundary
        fallback={ErrorFallback}
        onError={(error, info) =>
          log.error('uncaught app error', {
            error: error.message,
            componentStack: info.componentStack,
          })
        }
      >
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster richColors position="top-center" />
    </AppProviders>
  );
}
