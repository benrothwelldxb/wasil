import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  PROFILE_EXPORT_KIND,
  preferencesSchema,
  profileExportSchema,
  type PreferenceProfile,
  type Preferences,
} from "./schema";
import { BUILT_IN_PROFILES, DEFAULT_PROFILE_ID } from "./profiles";

const EXPORT_VERSION = 1;

function newId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Result of an import attempt. */
export type ImportResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface PreferenceStore {
  profiles: PreferenceProfile[];
  activeProfileId: string;
  onboardingComplete: boolean;

  // Selection
  setActiveProfile: (id: string) => void;

  // Read helpers
  getActiveProfile: () => PreferenceProfile;

  // CRUD
  createProfile: (name: string, preferences: Preferences) => string;
  renameProfile: (id: string, name: string) => void;
  deleteProfile: (id: string) => void;
  duplicateProfile: (id: string, name?: string) => string | null;
  /**
   * Update a profile's preferences. Built-in profiles are read-only: editing
   * one transparently duplicates it into a custom profile and activates it.
   * Returns the id that actually holds the update.
   */
  updateProfilePreferences: (
    id: string,
    patch: Partial<Preferences>,
  ) => string;

  // Import / export
  exportProfile: (id: string) => string | null;
  importProfile: (json: string) => ImportResult;

  // Onboarding
  /** The profile the onboarding flow created, so replaying updates it in place. */
  onboardingProfileId: string | null;
  setOnboardingComplete: (complete: boolean) => void;
  /**
   * Apply onboarding answers: update the profile a previous onboarding created
   * (so replays don't stack duplicates), or create it the first time. Activates
   * the profile and marks onboarding complete.
   */
  applyOnboarding: (name: string, preferences: Preferences) => void;
}

function findProfile(
  profiles: PreferenceProfile[],
  id: string,
): PreferenceProfile | undefined {
  return profiles.find((p) => p.id === id);
}

export const usePreferenceStore = create<PreferenceStore>()(
  persist(
    (set, get) => ({
      profiles: BUILT_IN_PROFILES,
      activeProfileId: DEFAULT_PROFILE_ID,
      onboardingComplete: false,
      onboardingProfileId: null,

      setActiveProfile: (id) => {
        if (findProfile(get().profiles, id)) set({ activeProfileId: id });
      },

      getActiveProfile: () => {
        const { profiles, activeProfileId } = get();
        return (
          findProfile(profiles, activeProfileId) ??
          profiles[0] ??
          BUILT_IN_PROFILES[0]!
        );
      },

      createProfile: (name, preferences) => {
        const id = newId();
        const now = Date.now();
        const profile: PreferenceProfile = {
          id,
          name: name.trim() || "Untitled profile",
          builtIn: false,
          preferences,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          profiles: [...s.profiles, profile],
          activeProfileId: id,
        }));
        return id;
      },

      renameProfile: (id, name) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === id && !p.builtIn
              ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() }
              : p,
          ),
        })),

      deleteProfile: (id) =>
        set((s) => {
          const target = findProfile(s.profiles, id);
          if (!target || target.builtIn) return s;
          const profiles = s.profiles.filter((p) => p.id !== id);
          const activeProfileId =
            s.activeProfileId === id
              ? (profiles[0]?.id ?? DEFAULT_PROFILE_ID)
              : s.activeProfileId;
          return { profiles, activeProfileId };
        }),

      duplicateProfile: (id, name) => {
        const source = findProfile(get().profiles, id);
        if (!source) return null;
        const newProfileId = newId();
        const now = Date.now();
        const copy: PreferenceProfile = {
          id: newProfileId,
          name: name?.trim() || `${source.name} (copy)`,
          builtIn: false,
          preferences: { ...source.preferences },
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          profiles: [...s.profiles, copy],
          activeProfileId: newProfileId,
        }));
        return newProfileId;
      },

      updateProfilePreferences: (id, patch) => {
        const source = findProfile(get().profiles, id);
        if (!source) return id;

        // Built-in profiles are read-only — fork instead of mutating.
        if (source.builtIn) {
          const forkId = newId();
          const now = Date.now();
          const fork: PreferenceProfile = {
            id: forkId,
            name: `${source.name} (custom)`,
            builtIn: false,
            preferences: { ...source.preferences, ...patch },
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({
            profiles: [...s.profiles, fork],
            activeProfileId: forkId,
          }));
          return forkId;
        }

        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === id
              ? {
                  ...p,
                  preferences: { ...p.preferences, ...patch },
                  updatedAt: Date.now(),
                }
              : p,
          ),
        }));
        return id;
      },

      exportProfile: (id) => {
        const profile = findProfile(get().profiles, id);
        if (!profile) return null;
        return JSON.stringify(
          {
            kind: PROFILE_EXPORT_KIND,
            version: EXPORT_VERSION,
            profile,
          },
          null,
          2,
        );
      },

      importProfile: (json) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(json);
        } catch {
          return { ok: false, error: "That doesn't look like valid JSON." };
        }

        // Accept either the wrapped export format or a bare preferences object.
        const asExport = profileExportSchema.safeParse(parsed);
        let name: string;
        let preferences: Preferences;

        if (asExport.success) {
          name = `${asExport.data.profile.name} (imported)`;
          preferences = asExport.data.profile.preferences;
        } else {
          const asPrefs = preferencesSchema.safeParse(parsed);
          if (!asPrefs.success) {
            return {
              ok: false,
              error: "The file isn't a valid preference profile.",
            };
          }
          name = "Imported profile";
          preferences = asPrefs.data;
        }

        const id = newId();
        const now = Date.now();
        set((s) => ({
          profiles: [
            ...s.profiles,
            {
              id,
              name,
              builtIn: false,
              preferences,
              createdAt: now,
              updatedAt: now,
            },
          ],
          activeProfileId: id,
        }));
        return { ok: true, id };
      },

      setOnboardingComplete: (onboardingComplete) =>
        set({ onboardingComplete }),

      applyOnboarding: (name, preferences) => {
        const { onboardingProfileId, profiles } = get();
        const existing = onboardingProfileId
          ? findProfile(profiles, onboardingProfileId)
          : undefined;

        if (existing && !existing.builtIn) {
          // Replay: overwrite the profile onboarding created last time.
          const now = Date.now();
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id === existing.id
                ? {
                    ...p,
                    name: name.trim() || p.name,
                    preferences,
                    updatedAt: now,
                  }
                : p,
            ),
            activeProfileId: existing.id,
            onboardingComplete: true,
          }));
          return;
        }

        // First run: create the profile and remember it for future replays.
        const id = get().createProfile(name, preferences);
        set({ onboardingProfileId: id, onboardingComplete: true });
      },
    }),
    {
      name: "fpl-preferences-storage",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Persist only user data; built-ins are always sourced fresh from code.
      partialize: (state) => ({
        profiles: state.profiles.filter((p) => !p.builtIn),
        activeProfileId: state.activeProfileId,
        onboardingComplete: state.onboardingComplete,
        onboardingProfileId: state.onboardingProfileId,
      }),
      // Reconcile persisted custom profiles with the current built-ins.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PreferenceStore>;
        const customProfiles = (saved.profiles ?? [])
          .filter((p) => !p.builtIn)
          // Backfill fields added after a profile was first stored.
          .map((p) => ({
            ...p,
            preferences: {
              ...p.preferences,
              avoidClubIds: p.preferences.avoidClubIds ?? [],
            },
          }));
        const profiles = [...BUILT_IN_PROFILES, ...customProfiles];
        const activeProfileId =
          saved.activeProfileId &&
          profiles.some((p) => p.id === saved.activeProfileId)
            ? saved.activeProfileId
            : DEFAULT_PROFILE_ID;
        return {
          ...current,
          profiles,
          activeProfileId,
          onboardingComplete: saved.onboardingComplete ?? false,
          onboardingProfileId: saved.onboardingProfileId ?? null,
        };
      },
    },
  ),
);
