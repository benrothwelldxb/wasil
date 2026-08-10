/**
 * Entitlements (Phase 3).
 *
 * Components ask "does this user have this capability?" — never which payment
 * provider they used. The paywall is respectful: core tracking, history, export
 * and deletion are ALWAYS free and never gated. Only advanced conveniences are
 * Plus. See `docs/SUBSCRIPTIONS.md`.
 */
import type { Capability, Entitlement, Tier } from '@/domain/models';
import type { FeatureFlags } from '@/config/featureFlags';

/**
 * Capabilities that are NEVER paywalled. These protect the product's core
 * promise and the user's data: seeing your own Timeline ("understand what's
 * changing"), backing up so you can't lose your history, and sharing your own
 * data with a clinician or partner (data portability). Export and deletion are
 * not even modelled as capabilities — they are unconditional (see below).
 */
export const ALWAYS_FREE: Capability[] = ['timeline', 'cloud_sync', 'partner_sharing'];

/**
 * Capabilities added by Plus — genuinely advanced *conveniences* only. Nothing
 * here blocks recording, viewing, understanding, exporting or deleting data.
 */
const TIER_CAPABILITIES: Record<Tier, Capability[]> = {
  free: [],
  plus: ['advanced_patterns', 'since_comparison', 'monthly_summary', 'ai_summaries', 'unlimited_reports'],
};

function isActive(ent: Entitlement, now: number): boolean {
  if (ent.tier === 'free') return true;
  if (!ent.validUntil) return true;
  return Date.parse(ent.validUntil) >= now || Boolean(ent.inGracePeriod);
}

/** Effective tier accounting for expiry + grace period. */
export function effectiveTier(ent: Entitlement, now = Date.now()): Tier {
  return ent.tier === 'plus' && isActive(ent, now) ? 'plus' : 'free';
}

/**
 * Whether a capability is available, considering the tier AND the feature flag
 * that governs it (a flag can hide a capability entirely during rollout).
 */
export function hasCapability(
  ent: Entitlement,
  capability: Capability,
  flags: FeatureFlags,
  now = Date.now(),
): boolean {
  // Feature-flag gates first: a disabled flag hides a capability entirely,
  // regardless of tier (used for staged rollout).
  if (capability === 'ai_summaries' && !flags.aiSummaries) return false;
  if (capability === 'partner_sharing' && !flags.partnerSharing) return false;
  if (capability === 'cloud_sync' && !flags.cloudSync) return false;

  // Core capabilities are always available.
  if (ALWAYS_FREE.includes(capability)) return true;

  // With subscriptions disabled entirely, Plus conveniences are simply free.
  if (!flags.subscriptions) return true;

  return TIER_CAPABILITIES[effectiveTier(ent, now)].includes(capability);
}
