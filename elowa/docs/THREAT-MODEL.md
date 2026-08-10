# Threat model

Scope: a single-user perimenopause health tracker with optional cloud backup,
controlled sharing, and (production) native apps. Assets, in priority order:
**health content** (symptoms, notes, cycle, sexual/urinary health), **identity**
(email), **entitlements**.

| # | Threat | Mitigation |
|---|--------|-----------|
| T1 | Server operator / breach reads health data | Client-side encryption; server stores ciphertext + non-sensitive metadata only (`docs/SECURITY.md`, `docs/BACKEND.md`). |
| T2 | Shoulder-surfing / shared device | App lock (biometric on native); demo/real namespace isolation; sign-out preserves or wipes local data by choice. |
| T3 | Share link leaks to a third party | Links are opaque tokens, read-only, **expiring** (24h/7d/30d) and **revocable**; scope is minimal per audience; partner links exclude sensitive categories by default (`docs/SHARING.md`). No health data in the token itself. |
| T4 | Over-sharing with a partner | Sensitive categories (`SENSITIVE_SYMPTOM_IDS`) excluded by default, opt-in per category per link; report exclusions subtracted at resolve time so a link can never widen its scope. |
| T5 | Health data leaks via side channels | No health data in analytics, URLs, logs, or notification payloads — enforced by construction and review (`docs/SECURITY.md`, `docs/NOTIFICATIONS-PRIVACY.md`). |
| T6 | Sync corruption / data loss | Pure, idempotent, unit-tested merge with tombstones; offline-first local copy is authoritative; export is always available as an escape hatch. |
| T7 | Account takeover | Passwordless email + platform OAuth (no reusable passwords); device session list with revoke (`docs/AUTH.md`). |
| T8 | Malicious client tampering with entitlements | Entitlement is a mirror of store receipts; server validates App Store / Play receipts; capabilities never gate data access, so tampering yields at most free→plus, never data exposure (`docs/SUBSCRIPTIONS.md`). |
| T9 | Coercion / lockout by an abuser | Data is exportable and deletable unconditionally and offline; nothing requires an account or payment to leave with your data. |
| T10 | Secrets in the client bundle | Web build ships no secrets; backend credentials are server-side only. |

## Explicit non-goals (this build)

- Real cryptographic E2E encryption is **designed, not implemented** here (no
  server). The boundary is in place (`RemoteBackend` payloads are opaque).
- Real OAuth/magic-link identity is deferred; the local account model stands in.

These are labelled honestly in the UI and docs — never presented as if the real
protection is active.
