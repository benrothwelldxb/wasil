import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The application shell. On phones it fills the viewport; on tablet/desktop it
 * presents the app inside a centred, phone-width canvas floating on a warm
 * backdrop — rather than stretching content across a wide screen.
 */
export function AppShell({
  children,
  bottomBar,
}: {
  children: ReactNode;
  bottomBar?: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] w-full bg-canvas">
      <div
        className={cn(
          'relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-background',
          // On larger screens, give the canvas device-like framing.
          'md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-[2.5rem] md:border md:border-border/70 md:shadow-raised md:overflow-hidden',
        )}
      >
        {/* Scrollable content region */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
        >
          {children}
        </main>
        {bottomBar}
      </div>
    </div>
  );
}
