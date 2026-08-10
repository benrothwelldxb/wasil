# Authentication

## Model

An account is a small record — `Account { id, method, email?, displayName?,
createdAt }` (`src/domain/models.ts`) — plus a list of `DeviceSession`s. The
account *lifecycle* is implemented and testable; the cloud *identity provider* is
deferred.

`authService` (`src/services/auth.ts`):

- `createAccount({ method, email?, displayName? })` — the guest → account step.
  Creates a local account and registers the current device session. Immediately
  followed by the first sync, which migrates existing local history
  (`accountService.createAccount` in `src/services/index.ts`).
- `signOut({ wipeLocal? })` — **preserves local health data by default** so the
  user keeps offline access; only the account link is dropped. `wipeLocal` is for
  a shared device (handled together with `deleteAllData`).
- `sessions()` / `revokeSession(id)` — device management (the current device
  can't revoke itself).

## Guest-first, always

Onboarding never requires an account (Phase 0 principle, unchanged). Tracking
works fully offline and on-device. An account is opt-in and only adds backup +
multi-device continuity. This is why nothing in the paywall or auth flow can gate
recording, viewing, exporting, or deleting data.

## Production sign-in (deferred)

`AuthMethod` already enumerates the intended real methods: `magic_link`, `apple`,
`google` (plus `local` for this build). Production wiring:

- **Passwordless email (magic link)** as the primary method — no passwords to
  leak or phish.
- **Sign in with Apple / Google** for one-tap on native.

All three resolve to the same `Account`/`DeviceSession` model and the same
first-sync migration, so no code above `authService` changes. In this browser
build these are intentionally not wired (they need a server + OAuth), and the
Account screen says so plainly rather than showing dead buttons.

## Migration correctness

Guest → account migration is just `sync()` (`docs/SYNC.md`): local is the working
copy, the cloud starts empty, so the union is exactly the local data. Re-running
is idempotent. This is covered by `syncService.test.ts`
("migrates a guest's existing history … without losing it").
