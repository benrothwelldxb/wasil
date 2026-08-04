import type { ReactNode } from 'react';
import type { FlagName } from '@/config/flags';
import { useFlag } from '@/hooks/use-flag';

export interface FlagProps {
  /** Registered flag name to gate on. */
  name: FlagName;
  /** Rendered when the flag is disabled. Defaults to `null`. */
  fallback?: ReactNode;
  /** Rendered when the flag is enabled. */
  children: ReactNode;
}

/** Renders `children` when `name` is enabled, otherwise `fallback`. */
export function Flag({ name, fallback = null, children }: FlagProps): ReactNode {
  const enabled = useFlag(name);
  return enabled ? children : fallback;
}
