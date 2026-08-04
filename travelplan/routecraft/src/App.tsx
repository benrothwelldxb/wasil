import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AppProviders } from '@/app/providers';
import { router } from '@/app/router';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ErrorFallback } from '@/components/shared/ErrorFallback';
import { log } from '@/lib/logger';

export default function App() {
  return (
    <AppProviders>
      {/* Honour the OS "reduce motion" setting across every Framer animation —
          the CSS kill-switch in index.css can't reach Framer's JS-driven
          transforms (card stagger, layout, ring/path draw), so this makes the
          per-component `useReducedMotion` guards belt-and-braces. */}
      <MotionConfig reducedMotion="user">
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
      </MotionConfig>
    </AppProviders>
  );
}
