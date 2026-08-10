import { describe, it, expect } from 'vitest';
import { effectiveTier, hasCapability } from './entitlements';
import { DEFAULT_FLAGS, type FeatureFlags } from '@/config/featureFlags';
import type { Entitlement } from '@/domain/models';

const flags = (o: Partial<FeatureFlags> = {}): FeatureFlags => ({ ...DEFAULT_FLAGS, ...o });
const NOW = Date.parse('2026-06-01T00:00:00Z');

describe('effectiveTier', () => {
  it('free stays free', () => {
    expect(effectiveTier({ tier: 'free', source: 'free' }, NOW)).toBe('free');
  });
  it('active plus stays plus', () => {
    const ent: Entitlement = { tier: 'plus', source: 'apple', validUntil: '2026-12-01T00:00:00Z' };
    expect(effectiveTier(ent, NOW)).toBe('plus');
  });
  it('expired plus falls back to free', () => {
    const ent: Entitlement = { tier: 'plus', source: 'apple', validUntil: '2026-01-01T00:00:00Z' };
    expect(effectiveTier(ent, NOW)).toBe('free');
  });
  it('expired plus in grace period is still plus', () => {
    const ent: Entitlement = { tier: 'plus', source: 'apple', validUntil: '2026-01-01T00:00:00Z', inGracePeriod: true };
    expect(effectiveTier(ent, NOW)).toBe('plus');
  });
});

describe('hasCapability', () => {
  const free: Entitlement = { tier: 'free', source: 'free' };
  const plus: Entitlement = { tier: 'plus', source: 'apple', validUntil: '2026-12-01T00:00:00Z' };

  it('with subscriptions ON, advanced_patterns is a Plus capability', () => {
    expect(hasCapability(free, 'advanced_patterns', flags({ subscriptions: true }), NOW)).toBe(false);
    expect(hasCapability(plus, 'advanced_patterns', flags({ subscriptions: true }), NOW)).toBe(true);
  });

  it('core capabilities (timeline, cloud_sync, sharing) are NEVER paywalled', () => {
    expect(hasCapability(free, 'timeline', flags({ subscriptions: true }), NOW)).toBe(true);
    expect(hasCapability(free, 'cloud_sync', flags({ subscriptions: true }), NOW)).toBe(true);
    expect(hasCapability(free, 'partner_sharing', flags({ subscriptions: true }), NOW)).toBe(true);
  });

  it('with subscriptions OFF, everything is unlocked', () => {
    expect(hasCapability(free, 'advanced_patterns', flags({ subscriptions: false }), NOW)).toBe(true);
    expect(hasCapability(free, 'monthly_summary', flags({ subscriptions: false }), NOW)).toBe(true);
  });

  it('a feature flag can hide a capability entirely, even for Plus', () => {
    expect(hasCapability(plus, 'ai_summaries', flags({ aiSummaries: false }), NOW)).toBe(false);
    expect(hasCapability(plus, 'partner_sharing', flags({ partnerSharing: false }), NOW)).toBe(false);
    expect(hasCapability(plus, 'cloud_sync', flags({ cloudSync: false }), NOW)).toBe(false);
  });
});
