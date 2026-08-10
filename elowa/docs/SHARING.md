# Sharing

## What a share link is

A read-only, scoped, **expiring**, **revocable** view of a summary. Two audiences
with deliberately different defaults (`src/services/sharing.ts`):

- **Clinician** — a concise clinical summary honouring report privacy exclusions.
- **Partner** — a lighter wellbeing snapshot; **sensitive categories are excluded
  by default** and only shared if the user opts each in per link.

## No health data in the link

`ShareLink.token` is an opaque `makeId`-generated string. It never encodes a
symptom, value, or note. In this web build the link resolves on-device at
`/shared/:token`; with the backend connected the same route renders from a signed
server payload keyed by a `share_tokens` scope row (`docs/BACKEND.md`). The URL is
never a data channel (`docs/SECURITY.md`).

## Scope can only narrow, never widen

- Partner defaults exclude `PARTNER_DEFAULT_EXCLUDED` (= `SENSITIVE_SYMPTOM_IDS`:
  libido, vaginal, urinary, mood, anxiety). The builder shows these as
  off-by-default toggles the user can opt into for a single link.
- `effectiveSymptomIds(link, reportExcluded)` subtracts anything the user has
  *since* hidden from reports, at resolve time. So tightening a privacy setting
  retroactively narrows every existing link; a link can never expose more than
  intended even if privacy changes after it was created
  (`sharing.test.ts`: "never widens scope").

## Lifecycle

- `createShareLink` sets `expiresAt` from a 24h / 7d / 30d choice.
- `isLinkActive` / `linkState` → `active | expired | revoked`.
- `revokeLink` sets `revokedAt`; a revoked link is dead immediately, even before
  expiry. The recipient view shows a calm "this link is no longer available",
  distinguishing revoked from expired.

The manage screen (`/share`) lists every link with its state and a one-tap revoke.

## Recipient experience

`SharedViewScreen` is a standalone read-only page — no navigation into the
owner's app, no editing. Clinician view renders the appointment summary (already
respecting report exclusions); partner view renders a gentle snapshot filtered to
the opted-in categories plus an optional supportive note, and states that
sensitive details are kept private.
