# Phase 3 — Final report

**Accounts, continuity & production product.** Phase 3 turns elowa from a
sophisticated single-device product into a secure, persistent, production-shaped
health companion — without ever faking the pieces that need a real server,
native runtime, or secrets. Where a capability can't be genuinely built in a
web sandbox, we shipped the **real abstraction + an honest local/mock
implementation + a tested deterministic engine**, and documented the production
integration point (the same pattern Phases 1–2 used for native health and AI).

## Definition of Done — walkthrough

The user can, end to end:

| # | Requirement | How it's met |
|---|-------------|--------------|
| Start without an account | Guest-first onboarding, fully offline (`docs/AUTH.md`). |
| Create an account later | `/account` → `accountService.createAccount` (local account model; real OAuth/magic-link deferred and labelled). |
| Migrate local history | First sync = union of local into empty cloud; preserves everything (`syncService.test.ts`). |
| Sign in on another device / restore | Device sessions + `sync()` pull; in this build the mock "cloud" stands in. |
| Track offline & sync safely | Offline-first; pure, idempotent, tombstone-aware merge (`docs/SYNC.md`). |
| Connect native health | `HealthDataProvider` seam + honest "not available in browser"; native via `registerNativeHealthProvider` (`docs/NATIVE.md`). |
| Optional biometric lock | `appLockService` at `/security`; maps to Face ID/Touch ID on native. |
| See a meaningful Timeline | `/timeline` — deterministic promotion of meaningful moments only. |
| Understand "how things changed" | `/how-changed` — cautious, non-causal half-vs-half summary. |
| Prepare for an appointment | `/appointments` prep questions + existing summary. |
| Record after-appointment changes | Appointment outcomes + follow-up date. |
| Create / revoke a clinician link | `/share` — scoped, expiring, revocable. |
| Share a light partner summary | Partner links; sensitive categories excluded by default, opt-in per link. |
| Manage privacy exclusions | Report/home/AI exclusions honoured across timeline, sharing, summaries. |
| Export all data | `buildExportBundle` includes every Phase 3 collection; never paywalled. |
| Delete account + data | `deleteAllData` clears the namespace; `RemoteBackend.purge` for cloud. |
| Subscribe / restore (if enabled) | `/plus` capability-gated; simulated on-device billing (`docs/SUBSCRIPTIONS.md`). |

## What was built

- **Sync engine** (`src/services/sync/syncEngine.ts`) — pure `reconcile` /
  `mergeById` / `mergeTombstones`: id-union + last-write-wins + tombstones,
  idempotent, local-wins on ties. Wired to repositories in `syncService.ts`
  behind the `RemoteBackend` abstraction (`LocalMockBackend`).
- **Accounts & auth** (`src/services/auth.ts`) — account lifecycle, device
  sessions, guest→account migration.
- **Elowa Timeline** (`src/domain/analysis/timeline.ts`) and **How have I
  changed?** (`howChanged.ts`) — deterministic, safety-filtered.
- **Appointments** — records with prep questions and after-visit outcomes.
- **Sharing** (`src/services/sharing.ts`) — opaque tokens, per-audience scope,
  expiry, revoke; partner sensitive-category opt-in enforced at link creation.
- **Entitlements** (`src/domain/entitlements/`) — capability model where core
  (timeline, backup, sharing, export, delete) is never paywalled.
- **Security surface** — app lock, notification-privacy preview, consent records.
- **Feature flags** (`src/config/featureFlags.ts`) for staged rollout.
- **UI**: 8 new screens wired into routes and the Profile hub; demo mode seeds
  appointments.

## Quality

- **120 tests** (was 72 at the start of Phase 3), all passing. New coverage:
  sync idempotency / conflict / tombstone / deletion-survives-round-trip /
  local-edit-wins, migration flow, timeline promotion, how-changed buckets +
  health-language safety, entitlement gating, share scope / expiry / revoke /
  partner sensitive opt-in.
- `tsc -b`, `eslint` (zero warnings), and production `vite build` all clean.
- A review pass found three real defects (deletion resurrection, lost
  period/treatment edits, a tautological partner guard); all three were fixed and
  covered by new tests before sign-off.

## Constraints honoured

- No production secrets in client code; the web build ships none.
- Nothing native / backend / encryption / compliance is faked — each is a
  documented design with an honest local stand-in.
- No symptom values, notes, or health data in analytics, URLs, logs, or
  notification payloads.
- The paywall never blocks export, deletion, or access to one's own data.
- Sensitive categories excluded from partner sharing by default.
- Friendly, honest copy throughout ("Up to date", "This link is no longer
  available").
- Elowa's visual identity and all existing user data are preserved.

## Explicitly deferred (not started)

Real managed backend + client-side encryption, real passwordless/OAuth identity,
the native app wrapper (HealthKit / Health Connect / keystore / push / store
billing), and server-hosted share tokens — all designed and documented, none
faked. **Phase 4 was not started**, per instruction.

## Docs added

`BACKEND`, `AUTH`, `SYNC`, `SECURITY`, `THREAT-MODEL`, `COMPLIANCE`, `NATIVE`,
`SUBSCRIPTIONS`, `SHARING`, `ENVIRONMENTS`, and this report; `DEFERRED.md`
updated.
