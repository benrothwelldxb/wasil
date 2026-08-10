/**
 * Lightweight feature flags (Phase 3) for staged rollout of significant
 * features. Intentionally simple — no experimentation platform. Defaults are
 * safe/conservative; overrides persist in app-level meta storage.
 */
export interface FeatureFlags {
  aiSummaries: boolean;
  partnerSharing: boolean;
  clinicianLinks: boolean;
  subscriptions: boolean;
  healthKit: boolean;
  healthConnect: boolean;
  cloudSync: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  aiSummaries: true,
  partnerSharing: true,
  clinicianLinks: true,
  subscriptions: true,
  // Native health integrations are off by default in the web build (honest —
  // they light up only in a native wrapper).
  healthKit: false,
  healthConnect: false,
  // Cloud sync uses the local mock backend in this build; on by default so the
  // account/backup flows are usable, and clearly labelled as on-device.
  cloudSync: true,
};

const KEY = 'elowa:meta:featureFlags';

export function getFlags(): FeatureFlags {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_FLAGS, ...(JSON.parse(raw) as Partial<FeatureFlags>) } : DEFAULT_FLAGS;
  } catch {
    return DEFAULT_FLAGS;
  }
}

export function setFlag(flag: keyof FeatureFlags, value: boolean): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...getFlags(), [flag]: value }));
  } catch {
    /* no-op */
  }
}
