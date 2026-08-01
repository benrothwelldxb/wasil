import { useMemo } from "react";
import { usePreferenceStore } from "./preferenceStore";
import { PreferenceService } from "./PreferenceService";
import type { PreferenceProfile, Preferences } from "./schema";

/**
 * The active profile's preferences.
 */
export function useActivePreferences(): Preferences {
  return usePreferenceStore((s) => {
    const active = s.profiles.find((p) => p.id === s.activeProfileId);
    return (active ?? s.profiles[0])!.preferences;
  });
}

/** The active profile object. */
export function useActiveProfile(): PreferenceProfile {
  return usePreferenceStore((s) => {
    const active = s.profiles.find((p) => p.id === s.activeProfileId);
    return (active ?? s.profiles[0])!;
  });
}

/**
 * A memoized {@link PreferenceService} built from the active profile.
 *
 * **This is the entry point every future recommendation engine should use.**
 * Call `usePreferenceService()` and pass players through `adjustPlayerScore`
 * (or the individual `adjust*` methods) — the engine stays oblivious to the
 * user's preferences while its output is fully personalised.
 */
export function usePreferenceService(): PreferenceService {
  const preferences = useActivePreferences();
  return useMemo(() => new PreferenceService(preferences), [preferences]);
}
