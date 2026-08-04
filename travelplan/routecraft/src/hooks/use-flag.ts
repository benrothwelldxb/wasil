import { isEnabled, type FlagName } from '@/config/flags';

/**
 * Returns whether `name` is enabled in the resolved flag snapshot.
 *
 * Reads the frozen snapshot computed once at boot (`isEnabled`), so it does
 * not re-render on any change today. It is hook-shaped rather than a plain
 * function so call sites already follow the Rules of Hooks — if flag
 * resolution becomes dynamic later (e.g. reactive to a live override), this
 * signature does not need to change at any call site.
 */
export function useFlag(name: FlagName): boolean {
  return isEnabled(name);
}
