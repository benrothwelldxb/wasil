import { beforeEach, describe, expect, it } from "vitest";
import { usePreferenceStore } from "./preferenceStore";
import { NEUTRAL_PREFERENCES } from "./profiles";

const customProfiles = () =>
  usePreferenceStore.getState().profiles.filter((p) => !p.builtIn);

describe("applyOnboarding", () => {
  beforeEach(() => {
    // Reset to a clean, first-run state (built-ins only).
    usePreferenceStore.setState((s) => ({
      profiles: s.profiles.filter((p) => p.builtIn),
      onboardingProfileId: null,
      onboardingComplete: false,
    }));
  });

  it("creates a profile and completes onboarding on first run", () => {
    usePreferenceStore.getState().applyOnboarding("My Team", NEUTRAL_PREFERENCES);

    const state = usePreferenceStore.getState();
    expect(customProfiles()).toHaveLength(1);
    expect(state.onboardingComplete).toBe(true);
    expect(state.onboardingProfileId).toBe(customProfiles()[0]?.id);
    expect(state.activeProfileId).toBe(customProfiles()[0]?.id);
  });

  it("updates the same profile in place when replayed (no duplicates)", () => {
    const store = usePreferenceStore.getState();
    store.applyOnboarding("My Team", NEUTRAL_PREFERENCES);
    const firstId = customProfiles()[0]?.id;

    const changed = { ...NEUTRAL_PREFERENCES, formBias: 0.9 };
    usePreferenceStore.getState().applyOnboarding("My Team", changed);

    // Still exactly one custom profile, same id, updated preferences.
    expect(customProfiles()).toHaveLength(1);
    expect(customProfiles()[0]?.id).toBe(firstId);
    expect(customProfiles()[0]?.preferences.formBias).toBe(0.9);
    expect(usePreferenceStore.getState().onboardingProfileId).toBe(firstId);
  });
});
