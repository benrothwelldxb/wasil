/**
 * UserPreferencesRepository — profile, preferences, onboarding state and the
 * user's saved appointment questions. There is no account in Phase 1; this is
 * the closest thing to a "user record".
 */
import type { OnboardingReason, UserPreferences, UserProfile } from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import { todayIso } from '@/lib/date';
import { DEFAULT_NOTIFICATION_PREFS } from '@/domain/notifications/rules';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

interface SessionRecord {
  onboarded: boolean;
  onboardingReasons: OnboardingReason[];
  createdAt: IsoDate;
}

interface PreferencesRecord {
  profile: UserProfile;
  preferences: UserPreferences;
  appointmentQuestions: string[];
}

const DEFAULT_PREFERENCES: UserPreferences = {
  remindersEnabled: false,
  cycleTrackingEnabled: true,
};

function readSession(): SessionRecord {
  return (
    activeDriver().get<SessionRecord>(StorageKeys.session) ?? {
      onboarded: false,
      onboardingReasons: [],
      createdAt: todayIso(),
    }
  );
}

function writeSession(session: SessionRecord): void {
  activeDriver().set(StorageKeys.session, session);
}

function readPrefs(): PreferencesRecord {
  return (
    activeDriver().get<PreferencesRecord>(StorageKeys.preferences) ?? {
      profile: {},
      preferences: DEFAULT_PREFERENCES,
      appointmentQuestions: [],
    }
  );
}

function writePrefs(record: PreferencesRecord): void {
  activeDriver().set(StorageKeys.preferences, record);
}

export const preferencesRepository = {
  // --- session / onboarding ---
  isOnboarded(): boolean {
    return readSession().onboarded;
  },
  getCreatedAt(): IsoDate {
    return readSession().createdAt;
  },
  getOnboardingReasons(): OnboardingReason[] {
    return readSession().onboardingReasons;
  },
  setOnboarding(reasons: OnboardingReason[]): void {
    writeSession({ ...readSession(), onboarded: true, onboardingReasons: reasons });
  },
  markOnboarded(): void {
    writeSession({ ...readSession(), onboarded: true });
  },

  // --- profile & preferences ---
  getProfile(): UserProfile {
    return readPrefs().profile;
  },
  setProfile(profile: UserProfile): void {
    writePrefs({ ...readPrefs(), profile });
  },
  getPreferences(): UserPreferences {
    const stored = readPrefs().preferences;
    // Merge Phase 2 defaults so older records get sensible values.
    return {
      ...stored,
      notifications: { ...DEFAULT_NOTIFICATION_PREFS, ...stored.notifications },
      ai: { enabled: false, ...stored.ai },
      analyticsEnabled: stored.analyticsEnabled ?? false,
    };
  },
  setPreferences(preferences: UserPreferences): void {
    writePrefs({ ...readPrefs(), preferences });
  },

  // --- appointment questions ---
  getQuestions(): string[] {
    return readPrefs().appointmentQuestions;
  },
  setQuestions(questions: string[]): void {
    writePrefs({ ...readPrefs(), appointmentQuestions: questions });
  },
};
