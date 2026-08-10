import { describe, it, expect } from 'vitest';
import {
  createShareLink,
  effectiveSymptomIds,
  isLinkActive,
  linkState,
  revokeLink,
  PARTNER_DEFAULT_EXCLUDED,
} from './sharing';
import { SENSITIVE_SYMPTOM_IDS } from '@/domain/models';

const NOW = '2026-06-01T12:00:00.000Z';

describe('createShareLink', () => {
  it('sets an expiry N days out and carries no health data in the token', () => {
    const link = createShareLink({
      audience: 'clinician',
      sections: ['summary'],
      includedSymptomIds: ['sym_sleep'],
      expiryDays: 7,
      now: NOW,
    });
    expect(link.expiresAt.startsWith('2026-06-08')).toBe(true);
    // Token is an opaque id — never contains a symptom id or note.
    expect(link.token).not.toContain('sym_');
    expect(link.token.length).toBeGreaterThan(8);
  });
});

describe('link lifecycle', () => {
  const link = createShareLink({
    audience: 'clinician',
    sections: ['summary'],
    includedSymptomIds: ['sym_sleep'],
    expiryDays: 7,
    now: NOW,
  });

  it('is active before expiry', () => {
    expect(isLinkActive(link, '2026-06-02T00:00:00Z')).toBe(true);
    expect(linkState(link, '2026-06-02T00:00:00Z')).toBe('active');
  });

  it('is expired after the expiry datetime', () => {
    expect(isLinkActive(link, '2026-07-01T00:00:00Z')).toBe(false);
    expect(linkState(link, '2026-07-01T00:00:00Z')).toBe('expired');
  });

  it('revocation immediately overrides an unexpired link', () => {
    const revoked = revokeLink(link, '2026-06-02T00:00:00Z');
    expect(isLinkActive(revoked, '2026-06-02T00:01:00Z')).toBe(false);
    expect(linkState(revoked, '2026-06-02T00:01:00Z')).toBe('revoked');
  });
});

describe('partner scope', () => {
  it('excludes sensitive categories by default', () => {
    expect(PARTNER_DEFAULT_EXCLUDED).toEqual(SENSITIVE_SYMPTOM_IDS);
  });

  it('strips a sensitive id from a partner link unless it was explicitly opted in', () => {
    // Caller passes a sensitive id in the base list but does NOT opt it in.
    const link = createShareLink({
      audience: 'partner',
      sections: ['summary'],
      includedSymptomIds: ['sym_sleep', 'sym_libido', 'sym_mood'],
      expiryDays: 7,
      now: NOW,
    });
    expect(link.includedSymptomIds).toEqual(['sym_sleep']);
    expect(effectiveSymptomIds(link, new Set())).toEqual(['sym_sleep']);
  });

  it('includes a sensitive category only when explicitly opted in', () => {
    const link = createShareLink({
      audience: 'partner',
      sections: ['summary'],
      includedSymptomIds: ['sym_sleep'],
      optInSensitiveIds: ['sym_mood'],
      expiryDays: 7,
      now: NOW,
    });
    expect(link.includedSymptomIds).toContain('sym_mood');
    expect(link.includedSymptomIds).toContain('sym_sleep');
  });

  it('clinician links are unaffected by the partner sensitive filter', () => {
    const link = createShareLink({
      audience: 'clinician',
      sections: ['symptoms'],
      includedSymptomIds: ['sym_sleep', 'sym_mood'],
      expiryDays: 7,
      now: NOW,
    });
    expect(link.includedSymptomIds).toEqual(['sym_sleep', 'sym_mood']);
  });

  it('never widens scope: report exclusions are subtracted at resolve time', () => {
    const link = createShareLink({
      audience: 'clinician',
      sections: ['symptoms'],
      includedSymptomIds: ['sym_sleep', 'sym_mood'],
      expiryDays: 30,
      now: NOW,
    });
    const visible = effectiveSymptomIds(link, new Set(['sym_mood']));
    expect(visible).toEqual(['sym_sleep']);
  });
});
