/**
 * Sharing (Phase 3).
 *
 * Creates read-only, scoped, expiring, revocable share links. In this web build
 * there is no server to host a link for an anonymous recipient, so links resolve
 * locally (the payload is built on-device and rendered at an in-app route); the
 * SAME service maps onto a signed server token when the backend is connected
 * (see `docs/SHARING.md`). No health data is ever placed in the token itself.
 *
 * Two audiences with different defaults:
 *  - clinician: a minimal read-only summary, honouring report privacy exclusions.
 *  - partner: a much lighter wellbeing snapshot; sensitive categories are
 *    excluded by default and only shared if the user opts each in.
 */
import type {
  ShareAudience,
  ShareLink,
  ShareSection,
} from '@/domain/models';
import { SENSITIVE_SYMPTOM_IDS } from '@/domain/models';
import { addDays, todayIso } from '@/lib/date';
import { makeId } from '@/lib/id';

export const SHARE_EXPIRY_OPTIONS = [
  { days: 1, label: '24 hours' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const;

/** Symptoms a partner may NOT see by default (opt-in only). */
export const PARTNER_DEFAULT_EXCLUDED = SENSITIVE_SYMPTOM_IDS;

export function createShareLink(input: {
  audience: ShareAudience;
  sections: ShareSection[];
  includedSymptomIds: string[];
  expiryDays: number;
  partnerNote?: string;
  now: string; // ISO datetime
}): ShareLink {
  return {
    id: makeId('share'),
    token: makeId('tok') + makeId('tok'),
    audience: input.audience,
    sections: input.sections,
    includedSymptomIds: input.includedSymptomIds,
    createdAt: input.now,
    expiresAt: `${addDays(input.now.slice(0, 10), input.expiryDays)}T23:59:59.000Z`,
    ...(input.partnerNote ? { partnerNote: input.partnerNote } : {}),
  };
}

export function isLinkActive(link: ShareLink, now = new Date().toISOString()): boolean {
  if (link.revokedAt) return false;
  return Date.parse(link.expiresAt) >= Date.parse(now);
}

export function linkState(link: ShareLink, now = new Date().toISOString()): 'active' | 'expired' | 'revoked' {
  if (link.revokedAt) return 'revoked';
  return Date.parse(link.expiresAt) >= Date.parse(now) ? 'active' : 'expired';
}

export function revokeLink(link: ShareLink, now = new Date().toISOString()): ShareLink {
  return { ...link, revokedAt: now };
}

/**
 * Resolve the effective symptom ids a link may expose. The link's
 * `includedSymptomIds` is the authoritative allow-list, set at creation time —
 * for a partner link, sensitive categories are only ever in that list if the
 * user explicitly opted them in (see `partnerDefaults`). Here we additionally
 * subtract anything the user has *since* excluded from reports, so tightening a
 * privacy setting retroactively narrows every existing link. A link can only
 * ever narrow, never widen.
 */
export function effectiveSymptomIds(
  link: ShareLink,
  reportExcluded: ReadonlySet<string>,
): string[] {
  return link.includedSymptomIds.filter((id) => !reportExcluded.has(id));
}

export const DEFAULT_CLINICIAN_SECTIONS: ShareSection[] = ['summary', 'symptoms', 'cycle', 'treatments', 'patterns', 'questions'];
export const DEFAULT_PARTNER_SECTIONS: ShareSection[] = ['summary'];

/** Placeholder anchor for demo (today) so callers don't pass Date around. */
export function nowIso(): string {
  return `${todayIso()}T12:00:00.000Z`;
}
