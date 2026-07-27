# Parent auth redesign — passwordless-first (6-digit code)

**Why:** parents arrive **pre-provisioned from Hub** (email known, already
`ParentStudentLink`-ed, no password, no invitation). Today the only working
self-serve door is a mislabelled "Forgot password?" magic link, fronted by two
dead ends (password login → 401; register → needs an access code they never
get). Collapse to one front door: **enter email → type a 6-digit code → in.**

**Decisions (locked):** passwordless code is primary; password is an optional
set-later/admin-set fallback; onboarding delivery is an admin "invite parents"
action. Magic *links* rejected (deep-link fragility on iOS/Android/PWA); a typed
code needs no Universal/App Links and works identically everywhere. Long refresh
session (existing 15-min access + 30-day refresh) means the code screen is rare.
Biometric unlock = later (native-shell / WebAuthn).

## Contract

### Server (`server/src/routes/auth.ts` + a new `LoginCode` model)
- `POST /auth/code/request` `{ email }` → `200 { ok: true }` **always** (enumeration-safe).
  If a `User` with that email exists, mint a **6-digit** code (crypto RNG),
  store only its **sha256 hash** in `LoginCode` (email, codeHash, expiresAt ~10m,
  attempts=0, consumedAt), and email it. Rate-limit per email + per IP.
- `POST /auth/code/verify` `{ email, code }` → `200 { user, accessToken, refreshToken }`,
  or `200 { twoFactorRequired, twoFactorSessionToken }` (reuse existing 2FA
  handoff), or `400/401 { error }`. Verify: newest un-consumed, un-expired
  `LoginCode` for the email; sha256-compare; on miss increment `attempts` and
  **lock after 5** (invalidate the code); on hit mark `consumedAt` (single-use)
  and issue the token pair via the SAME issuance path as `/auth/login`.
- **Fix:** the sign-in email's children list reads legacy `Child` (empty for Hub
  parents) — switch to `ParentStudentLink` → `Student` names (`auth.ts:837`).
- `POST /api/parent-invitations/send-invites` (isAdmin) `{ parentUserIds?: string[] }`
  → `200 { sent, skipped }`. Omit ids = all `role:PARENT` users in the school with
  an email. Sends a **welcome** email ("You've been added to <School> on <App>.
  Open the app and sign in with your email — we'll text you a 6-digit code."),
  re-sendable. Stamp `User.welcomeSentAt` (new nullable column) for "who's been
  invited". Does NOT embed a short-lived code (would expire before they act).

### Shared (`packages/shared`)
- `api.auth.requestCode(email)`, `api.auth.verifyCode(email, code)`,
  `api.parentInvitations.sendInvites(parentUserIds?)`.
- `AuthContext`: `requestLoginCode(email)` + `verifyLoginCode(email, code)` —
  proper token storage, 2FA-aware (throw `TwoFactorRequiredError` like
  `loginWithPassword`). Parent app must use these (kills the raw-fetch bypass).

### Parent app (`apps/parent`)
- New single front door: **"Enter your email" → "Enter the 6-digit code"** (two
  steps, one screen), via the shared hook. Resend + "check spam" affordance.
- Password becomes a secondary "sign in with a password instead" link (only for
  those who set one). Retire access-code registration as the front door.

### Admin app (`apps/admin`)
- An **"Invite parents"** action (send-invites): invite all un-invited parents or
  a selection, show `welcomeSentAt` status, re-send.

## Delegation
- **Opus** — server: `LoginCode` model + migration + code request/verify (crypto,
  hashing, TTL, attempt-lock, rate-limit, 2FA-aware, enumeration-safe), the
  children-list fix, `send-invites` + welcome email + `welcomeSentAt`, shared
  client methods, tests.
- **Fable** — the shared `AuthContext` methods (central; built to this contract).
- **Sonnet** — parent-app front door; admin "invite parents" UI (after the contract lands).
