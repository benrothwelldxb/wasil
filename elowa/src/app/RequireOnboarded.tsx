import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/queries';

/**
 * Route guard: sends a user who has not completed onboarding to the onboarding
 * flow. Demo mode seeds an onboarded user, so it passes through.
 */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!user?.onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
