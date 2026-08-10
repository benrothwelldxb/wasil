# Deferred functionality

## Done in Phase 3

Accounts & guest→account migration (`docs/AUTH.md`), an offline-first sync/merge
engine (pure, idempotent, tombstone-aware; `docs/SYNC.md`) behind a `RemoteBackend`
abstraction with an on-device mock "cloud", the longitudinal **Elowa Timeline**
(deterministic promotion of meaningful moments only), **"How have I changed?"**,
clinician appointment records with prep questions and after-visit outcomes,
controlled **sharing** (clinician + light partner links; opaque tokens, scoped,
expiring, revocable, sensitive categories excluded by default; `docs/SHARING.md`),
**capability-based entitlements** with a respectful paywall that never gates data
(`docs/SUBSCRIPTIONS.md`), an app-lock + consent-record + notification-privacy
security surface, feature flags (`docs/ENVIRONMENTS.md`), export extended to *all*
Phase 3 data, and demo fixtures for the new surfaces. New engines are unit-tested
(sync/migration idempotency/conflict/tombstone, timeline promotion, how-changed
buckets + safety language, entitlement gating, share scope/expiry/revoke).

## Explicitly deferred (Phase 3 → later)

Real managed backend + client-side encryption (`docs/BACKEND.md`, `docs/SECURITY.md`
describe the design; the web build has no server and performs no real E2E
encryption) · real passwordless/OAuth identity (local account model stands in) ·
native app wrapper for HealthKit/Health Connect, biometric keystore, push, and
store billing (`docs/NATIVE.md`; billing is simulated on-device here) · server-side
share-token hosting for anonymous recipients (links resolve on-device in this
build). Do **not** begin Phase 4.

## Done in Phase 2

Health-data provider abstraction + permission UX + mock provider (native HealthKit/Health Connect
deferred), passive sleep/activity in the baseline, Baseline v2 (unified measures, plain-language
magnitudes), change-point detection, Pattern Engine v2 (same-day / lagged / activity / intervention
associations, quality scoring, strength, ranking), reusable explainability ("Why am I seeing this?"
+ "What this means"), an optional AI interpretation pipeline (deterministic-first, consent,
validation, fallback; no client secrets), monthly reflection, notification rules + preferences,
"What's changed since…?", appointment summary v2 with printable clinical report, JSON/CSV export,
insight feedback, category-level privacy controls, and a behavioural analytics choke point (off by
default). Tests cover all of the above.

## Explicitly deferred (Phase 2 → later)

Native app wrapper for real HealthKit/Health Connect · a real server-proxied LLM provider · OS
push-notification delivery · binary-PDF/native share sheet (Phase 2 uses browser print-to-PDF) ·
home-screen widgets/shortcuts. Plus everything in the Phase 2 spec's "do not implement" list
(clinician portal, prescriptions, diagnosis, community, fertility, etc.).

## Done in Phase 1

Local persistence (versioned, real/demo namespaces), functional onboarding, personal baseline
engine, "Today feels normal" / "Something feels different", change-based check-ins, context tags,
notes, cycle tracking, treatment/HRT timeline, editable/deletable history, deterministic insights
engine with confidence + "why am I seeing this?", live Today dashboard, baseline-band
visualisations, appointment summary v1 with print, JSON export, delete-all, privacy screen, demo
mode, and tests for the non-UI logic.

## Explicitly deferred to a later phase

- backend / API / cloud sync
- authentication / accounts
- LLM / generative AI / AI interpretation
- Apple Health / Health Connect / wearables
- push notifications / reminders delivery
- subscriptions / payments
- community / social / partner accounts
- clinician portal / messaging
- medical diagnosis / medication recommendations
- real PDF generation (Phase 1 uses `window.print()` of a clean HTML view)
- voice transcription / OCR
- fertile-window / next-period prediction (intentionally never)

## Known Phase 1 limitations

- **Device-local only:** data lives in this browser's `localStorage`. Clearing browser storage, or
  switching browser/device, means history isn't available there. No sync yet.
- **Baseline is a heuristic, not a clinical measure:** it anchors "usual" at Mild=1 and learns each
  symptom's range from that. It is deliberately cautious and never claims precision.
- **Insights are associations only:** deterministic, local, and gated by minimum-evidence
  thresholds; they never assert causation or diagnosis.
- **Reminders toggle is cosmetic:** no notifications are actually scheduled.
- **`en-GB` locale** assumed for dates; no i18n.
- **Custom symptom management** is available at onboarding; a dedicated post-onboarding editor for
  pinned/custom symptoms is a small follow-up.
