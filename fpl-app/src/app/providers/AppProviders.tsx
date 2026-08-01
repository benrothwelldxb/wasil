import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { QueryProvider } from "./QueryProvider";
import { ThemeProvider } from "./ThemeProvider";

/**
 * Composes all app-wide providers in one place so `App` stays declarative.
 * Order matters: the error boundary is outermost, then data (Query), then
 * theming and UI context.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
