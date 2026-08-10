# Backend

## What's built vs deferred

elowa's sync layer never talks to a cloud vendor directly. It depends on the
`RemoteBackend` interface (`src/services/sync/remoteBackend.ts`): `pull`, `push`,
`purge`, plus `isConnected()`. Two things follow from this:

- **Built now:** `LocalMockBackend`, an on-device stand-in "cloud" stored under a
  separate `elowa:cloud:` storage prefix. It lets the full account → migrate →
  sync → delete lifecycle run and be unit-tested (`syncEngine.test.ts`,
  `syncService.test.ts`) without a server or any secrets.
- **Deferred (production):** the managed backend below. No server, credentials,
  or network calls are wired into this web build — that would require secrets the
  client must never hold.

Swapping in production is a single implementation of `RemoteBackend` plus wiring
`isConnected()` to real auth; nothing above the interface changes.

## Chosen platform: Supabase

Recommended managed backend: **Supabase** (Postgres + Row-Level Security + Auth +
Edge Functions). Rationale: first-class RLS so a row is only ever readable by its
owner, managed passwordless/OAuth auth (maps onto `docs/AUTH.md`), EU data
residency for GDPR (`docs/COMPLIANCE.md`), and a small operational surface.

Alternatives considered: a bespoke Node/Postgres service (more control, more to
operate and secure); Firebase (weaker relational/RLS story for health data).

## Data model (per-account, RLS-enforced)

Every row carries `user_id uuid` and RLS `using (auth.uid() = user_id)`. Health
payloads are stored **client-side encrypted** (see `docs/SECURITY.md`) — the
server sees ciphertext blobs, not symptom values.

```
accounts        (id, created_at, display_name?, ...)          -- profile only
records          (user_id, collection, record_id, updated_at,
                  deleted boolean, ciphertext bytea)           -- one row per synced record
singletons       (user_id, key, ciphertext bytea, updated_at)  -- preferences/tracking/privacy
tombstones       (user_id, collection, record_id, deleted_at)  -- versioned deletions
share_tokens     (id, user_id, token_hash, audience, scope jsonb,
                  expires_at, revoked_at)                       -- NO health data; scope only
entitlements     (user_id, tier, valid_until, source)          -- mirror of store receipts
```

`records`/`singletons`/`tombstones` mirror the `RemoteSnapshot` shape
(`collections`, `singletons`, `tombstones`, `revision`) so the existing
`reconcile()` engine is reused unchanged. `revision` becomes an optimistic
concurrency stamp (reject a push whose base revision is stale, then re-pull and
re-reconcile — the engine is idempotent, so this is safe).

## What the server must never do

- Never receive plaintext symptom values, notes, or any health detail — only
  ciphertext and non-sensitive metadata (`updated_at`, `revision`, collection
  name, record id).
- Never place health data in a share token — tokens reference server-side scope
  rows only (`docs/SHARING.md`).
- Never log record contents.
