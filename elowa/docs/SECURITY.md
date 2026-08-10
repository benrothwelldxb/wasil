# Security

## Posture

elowa holds intimate health data. The security model is: **the server is
untrusted with plaintext.** Health content is encrypted on the device before it
ever leaves it; the backend stores ciphertext and non-sensitive metadata only.

## Client-side encryption (production design)

- A per-user **data key** encrypts record payloads (symptom values, notes, cycle
  detail) before sync. Envelope: the data key is wrapped by a key derived from
  the user's authenticated session / platform keystore.
- On native, the wrapping key lives in the **iOS Keychain / Android Keystore**,
  optionally gated by biometric unlock (`docs/NATIVE.md`).
- The server sees: `updated_at`, `revision`, collection name, record id, and an
  opaque ciphertext blob. It cannot read a symptom, a note, or a cycle date.

This is a design, honestly labelled: the web build has no server and does not
perform real E2E encryption. The abstraction boundary (`RemoteBackend`) is where
encryption slots in — payloads are already opaque `unknown[]` at that layer.

## What is never done, anywhere

These are hard rules, enforced by construction and reviewed:

- **No health data in analytics.** There is no analytics SDK; if one is added, it
  receives event *names* only, never symptom values, notes, or measures.
- **No health data in URLs.** Share links carry an opaque token
  (`makeId`-generated), never a symptom id or value in a query string. The share
  route resolves scope server-side (or on-device in this build).
- **No health data in logs.** Record contents are never logged client- or
  server-side.
- **No health data in notifications.** Reminders/nudges carry a soft prompt only
  (`docs/NOTIFICATIONS-PRIVACY.md`), never a symptom or measure.
- **No production secrets in client code.** The web build ships no keys; the
  managed backend's service credentials live server-side only.

## App lock

`appLockService` toggles an on-open lock. On native this maps to Face ID / Touch
ID / device passcode via the platform biometric API; in the browser it is a
simple on-open gate. Copy is honest about which is in effect (`/security`).

## Local storage

On-device data is namespaced (`elowa:v1:real:` vs `elowa:v1:demo:`) so demo and
real data never mix. `deleteAllData()` clears the entire active namespace —
including all Phase 3 collections (appointments, share links, consents, account,
tombstones). The "cloud" mock lives under a separate `elowa:cloud:` prefix and is
purged by account deletion (`RemoteBackend.purge`).
