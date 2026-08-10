# Compliance & data protection

elowa processes **special-category health data** (GDPR Art. 9), so the bar is
high. This documents the data map and the user rights the product must honour.
It is a design/operational reference, not a legal opinion.

## Lawful basis

Processing rests on **explicit consent** (Art. 9(2)(a)), captured as versioned
`ConsentRecord`s (`accountRepository`): `ai_processing`, `health_integration`,
`partner_sharing`, `marketing`. Consent is granular, off by default for anything
non-essential, viewable and withdrawable at `/security`. Withdrawal stops the
processing going forward.

## Data map

| Category | Examples | Stored | Leaves device? |
|----------|----------|--------|----------------|
| Health content | symptoms, notes, cycle, sexual/urinary health | on-device, namespaced | only as **ciphertext** if the user enables backup |
| Passive health | sleep, steps (via HealthKit/Health Connect) | on-device | as above; opt-in per metric |
| Identity | email, display name | on-device / account | to the auth provider only |
| Derived | baselines, insights, timeline | computed on-device, not stored raw | no |
| Entitlement | tier, source, validity | on-device / account | store receipt validation only |
| Share scope | audience, sections, expiry — **no health values** | on-device / `share_tokens` | token references scope only |

## User rights → product features

- **Access / portability (Art. 15, 20):** `buildExportBundle` exports *all* data
  as JSON — check-ins, cycle, treatments, appointments, reports, share links,
  consents, account. Available offline, never paywalled.
- **Erasure (Art. 17):** `deleteAllData()` clears the entire local namespace;
  `RemoteBackend.purge` removes the cloud copy for account deletion. Never
  paywalled.
- **Rectification (Art. 16):** all records are editable in-app.
- **Restriction / objection:** per-category privacy controls (exclude from home /
  AI / report) and consent withdrawal.

## Data minimisation

- Partner sharing excludes sensitive categories by default (opt-in per link).
- The Timeline promotes only meaningful moments, not raw logs.
- No analytics/telemetry collects health content (`docs/SECURITY.md`).

## Residency & processors

Production: host in an **EU region** (Supabase EU project). Sub-processors (auth,
push, billing) are minimised and documented; each must be covered by a DPA. Push
providers and analytics (if any) receive **no** health content.

## Retention

Data persists until the user deletes it. Account deletion purges cloud data;
local deletion is immediate. Expired/revoked share tokens carry no health data
and can be hard-deleted.
