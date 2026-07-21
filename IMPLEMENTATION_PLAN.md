# Wasil — Architecture Separation Implementation Plan

## Goal
Separate the monolithic app into distinct, independently deployable pieces:
- **API server** (Express, Railway) — shared backend
- **Admin web app** (Vite/React, Vercel) — staff & admin access only, browser-based
- **Parent mobile app** (Capacitor wrapping React) — parent-only, iOS & Android
- **Parent web app** (optional) — browser fallback for parents who don't install the app

All clients authenticate against the same API using JWTs. Role-based access is enforced server-side.

---

## Phase 1: JWT Authentication (replace sessions)

### Why first
Session cookies don't work in native mobile apps. JWT unblocks mobile, cross-domain deployments, and horizontal server scaling (no sticky sessions).

### Server changes

1. **Add dependencies**: `jsonwebtoken`, `@types/jsonwebtoken`
2. **Create `server/src/services/jwt.ts`**:
   - `generateAccessToken(userId)` — short-lived (15 min), signed with `JWT_SECRET`
   - `generateRefreshToken(userId)` — long-lived (30 days), stored in DB
   - `verifyAccessToken(token)` — returns decoded payload or throws
3. **Add `RefreshToken` model to Prisma schema**:
   - `id`, `token` (hashed), `userId`, `expiresAt`, `createdAt`
   - Index on `token` for lookup
4. **New auth endpoints**:
   - `POST /auth/token/refresh` — accepts refresh token, returns new access token
   - `POST /auth/logout` — revokes refresh token
5. **Update OAuth callbacks** (`/auth/google/callback`, `/auth/microsoft/callback`):
   - Instead of creating a session, issue access + refresh tokens
   - Redirect to client with tokens (via URL fragment or secure cookie)
6. **Update `isAuthenticated` middleware**:
   - Read `Authorization: Bearer <token>` header
   - Verify JWT, attach `req.user`
   - Fall back to session check during migration (remove later)
7. **Add new env vars**: `JWT_SECRET`, `JWT_REFRESH_SECRET`
8. **Remove session dependency** once all clients use JWT:
   - Remove `express-session`, `cookie-parser`, passport serialization
   - Remove session-related config from `index.ts`

### Client changes

9. **Update `client/src/services/api.ts`**:
   - Store access token in memory (module-level variable, not localStorage)
   - Attach `Authorization: Bearer <token>` header to all requests
   - On 401 response, attempt silent refresh via `/auth/token/refresh`
   - On refresh failure, redirect to login
10. **Update `AuthContext`**:
    - `login()` stores tokens, `logout()` calls revoke endpoint
    - `checkAuth()` uses `/auth/me` with JWT header instead of cookie

---

## Phase 2: Object Storage for Files

### Why
Serving uploads from Express disk (`/server/uploads`) is stateful and doesn't scale. Mobile apps need direct URLs to assets.

### Changes

1. **Set up Cloudflare R2 or AWS S3 bucket** for school files, logos, policy PDFs
2. **Add `server/src/services/storage.ts`**:
   - `uploadFile(buffer, key, contentType)` → returns public URL
   - `getSignedUrl(key)` → returns time-limited download URL (for private files)
   - `deleteFile(key)`
3. **Update upload routes** (policies, files, school branding):
   - Replace Multer disk storage with memory storage → pipe to R2/S3
   - Store the object URL in the database instead of a local path
4. **Remove `/uploads` static serving** from Express
5. **Migrate existing files**: one-time script to upload `/server/uploads/*` to bucket and update DB URLs
6. **New env vars**: `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT` (for R2)

---

## Phase 3: API Versioning

### Why
Once multiple clients (admin web, parent mobile) exist with independent release cycles, you need to evolve the API without breaking older app versions.

### Changes

1. **Prefix all routes with `/api/v1/`**:
   - Move `server/src/routes/*.ts` registrations from `/api/*` to `/api/v1/*`
   - Auth routes: `/auth/v1/*`
2. **Update all client API calls** to use `/api/v1/` prefix
3. **Add API version header**: `X-API-Version: 1` (informational)
4. **Document the versioning policy**: breaking changes get a new version, additive changes are fine in-place

---

## Phase 4: Split Client into Admin + Parent Apps

### Why
Parents don't need admin UI (smaller bundle, simpler UX, clearer security boundary). Admin doesn't need to be on mobile.

### Directory structure

```
wasil/
├── server/                  # API (unchanged)
├── apps/
│   ├── admin/               # Admin web app (Vite/React)
│   │   ├── src/
│   │   │   ├── pages/       # AdminDashboard, SuperAdminDashboard, analytics
│   │   │   ├── components/  # Admin-specific components
│   │   │   ├── services/    # api.ts (shared or copied)
│   │   │   └── App.tsx      # Admin routes only
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── parent/              # Parent app (Vite/React — becomes Capacitor shell)
│   │   ├── src/
│   │   │   ├── pages/       # ParentDashboard, Events, Policies, etc.
│   │   │   ├── components/  # Parent-facing components
│   │   │   ├── services/    # api.ts
│   │   │   └── App.tsx      # Parent routes only
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── shared/              # Shared code (extracted)
│       ├── services/        # api.ts base, auth helpers
│       ├── types/           # Shared TypeScript types
│       ├── contexts/        # AuthContext, ThemeContext
│       └── components/      # Truly shared UI (LoadingScreen, ConfirmModal, etc.)
```

### Steps

1. **Create `apps/shared/`**: extract types, API service, auth context, theme context, and generic UI components
2. **Create `apps/admin/`**:
   - Move `AdminDashboard.tsx`, `SuperAdminDashboard.tsx`, staff/class/yearGroup management
   - Login page only shows OAuth (no demo), redirects non-admin roles away
   - Deploy to Vercel (e.g. `admin.wasil.app`)
3. **Create `apps/parent/`**:
   - Move `ParentDashboard.tsx`, `EventsPage`, `PoliciesPage`, `TermDatesPage`, `FilesPage`, `PrincipalUpdatesPage`
   - Login page for parents only
   - Deploy to Vercel (e.g. `app.wasil.app`) and wrap with Capacitor (Phase 5)
4. **Retire `client/`** once both apps are live
5. **Server CORS update**: allow origins for both `admin.wasil.app` and `app.wasil.app`

---

## Phase 5: Capacitor Mobile App

### Why
Wraps the parent web app in a native shell for iOS/Android. Same codebase, native distribution.

### Setup

1. **In `apps/parent/`**:
   - `npm install @capacitor/core @capacitor/cli`
   - `npx cap init "Wasil" "app.wasil" --web-dir dist`
   - `npx cap add ios && npx cap add android`
2. **Configure `capacitor.config.ts`**:
   - `server.url` in dev: point to local Vite server
   - Production: loads from bundled `dist/` assets
   - `server.allowNavigation`: API domain
3. **Set `VITE_API_URL`** to production API URL for mobile builds
4. **Handle OAuth on mobile**:
   - Use Capacitor Browser plugin for OAuth flow (opens in-app browser)
   - Server OAuth callback redirects to a deep link (`app.wasil://auth/callback?token=...`)
   - App intercepts deep link, extracts tokens
5. **Secure token storage**:
   - Use `@capacitor-community/secure-storage` for refresh token (Keychain on iOS, Keystore on Android)
   - Access token stays in memory
6. **Build & test**:
   - `npm run build && npx cap sync`
   - `npx cap open ios` / `npx cap open android`
   - Test on simulators, then physical devices

---

## Phase 6: Push Notifications

### Why
Highest-value mobile feature for a school communications app — parents need to know about new messages, events, and urgent alerts immediately.

### Changes

1. **Set up Firebase Cloud Messaging (FCM)** — works for both iOS and Android
2. **Add `@capacitor/push-notifications`** plugin to parent app
3. **Server: add `DeviceToken` model**:
   - `id`, `userId`, `token`, `platform` (ios/android/web), `createdAt`
4. **New endpoints**:
   - `POST /api/v1/devices` — register device token
   - `DELETE /api/v1/devices/:token` — unregister on logout
5. **Server: add `server/src/services/push.ts`**:
   - `sendPush(userId, { title, body, data })` — looks up user's device tokens, sends via FCM
6. **Trigger pushes on**:
   - New message targeting user's child's class
   - New event requiring RSVP
   - Urgent message flag
   - Pulse survey opens
7. **Web push** (optional): add service worker + web push for the parent web app

---

## Phase 7: Offline Caching (optional, lower priority)

1. **Service worker** (web): cache messages, events, term dates for offline reading
2. **Capacitor HTTP plugin**: cache API responses locally
3. **Sync queue**: queue acknowledgments/RSVPs made offline, replay when back online

---

## Execution Summary

| Phase | Effort | Dependency | Deploys to |
|-------|--------|------------|------------|
| 1. JWT Auth | Medium | None | Server |
| 2. Object Storage | Small | None | Server |
| 3. API Versioning | Small | None | Server + Client |
| 4. Split Clients | Large | Phase 1 | Admin (Vercel), Parent (Vercel) |
| 5. Capacitor Mobile | Medium | Phase 1 + 4 | App Store, Google Play |
| 6. Push Notifications | Medium | Phase 5 | Server + Mobile |
| 7. Offline Caching | Small | Phase 5 | Mobile + Web |

Phases 1, 2, and 3 can be done in parallel. Phase 4 depends on Phase 1 (JWT). Phase 5 depends on 1 + 4. Phase 6 depends on 5.

---

# External Provider Portal (ECA & Catering)

## Goal
Let external commercial parties — extra-curricular club operators and the
catering provider — self-manage their offerings through a **separate portal
with its own login**, without touching the staff/parent hub. Providers create
activities, upload visuals, and view their bookings; parents browse and book
provider-run paid clubs alongside school-run ECAs.

## Decisions (locked)
- **Reach:** `Provider` is modelled multi-school-capable (`ProviderSchoolLink`
  many-to-many); v1 links each provider to exactly one school.
- **Payments:** link + status only — provider sets a price and an external
  payment link; Wasil records booking + `PaymentStatus`. No card data, no
  marketplace. Reuses the `schoolServices` pattern.
- **Booking data shared with providers:** child name, class, safety/allergy
  flags, **and** parent contact (name/email/phone), governed per-provider-per-
  school by `ProviderSchoolLink.shareParentContact`. Access is audit-logged.

## Identity model
A provider is a **new principal type**, deliberately kept out of the `User`
table so none of the parent/staff `schoolId` assumptions gain a nullable
exception. Providers get:
- Their own tables: `Provider`, `ProviderUser`, `ProviderRefreshToken`,
  `ProviderInvitation`, `ProviderSchoolLink`.
- Their own login surface (`/provider/auth/*`) reusing the **same** hardened
  crypto/token services (bcrypt cost 12, lockout, atomic refresh rotation).
- Tokens carry `kind: 'provider'` — `verifyAccessToken` rejects them and
  `verifyProviderAccessToken` rejects staff/parent tokens. Hard boundary.
- A future `apps/provider` web app (Vite + `packages/shared`, no Capacitor).

## Security posture (this is the #1 risk — a new external actor with write access)
- `requireProvider` verifies the provider token, confirms the ProviderUser and
  its Provider are ACTIVE, attaches `req.providerUser`.
- Every provider query MUST filter by `req.providerUser.providerId`. Admin
  management routes scope every action through `ProviderSchoolLink` for the
  admin's own school (`getLinkedProvider`).
- Ownership on activities (Phase B) = `activity.providerId === me.providerId`.
- 2FA fields present on `ProviderUser` now; endpoints follow.
- Parent-contact sharing needs consent copy + a privacy-policy line.

## Phases
- **A — Foundation (DONE):** provider tables + migration, provider auth
  (`/provider/auth`: login, register-from-invitation, refresh, logout, /me),
  `requireProvider` middleware, token `kind` isolation, admin management
  (`/api/providers`: create+link, list, get, update, invite). Guardrail tests:
  token isolation, provider rotation, login lockout/suspension, register.
- **B — Activities (DONE):** `EcaActivity.providerId` (nullable) + `paymentUrl`
  + migration; provider activity CRUD (`/api/provider-portal/activities` + `/terms`)
  scoped to (providerId, linked schools); admin `ProvidersPage` (create/link,
  invite, suspend, contact-sharing toggle) wired into sidebar; `apps/provider`
  `ActivitiesPage` (create/edit/delete clubs with term, schedule, capacity, cost,
  payment link). Guardrail tests: activity ownership + unlinked-school scoping.
  Still open: 2FA endpoints, logo/photo uploads.
- **C — Parent-facing clubs (DONE):** `EcaProviderBooking` model + migration;
  parent `/api/clubs` (browse/book/cancel, capacity-checked, ownership-scoped)
  + parent `ClubsPage` (book a child, pay on the provider link, track status);
  provider `/api/provider-portal/bookings` (child+class+parent contact **gated by
  the per-school `shareParentContact` toggle**, access-logged) + PATCH payment
  status; provider `BookingsPage`. Guardrail tests: booking ownership/tenancy/
  capacity/dedupe, contact gating both ways, payment-update ownership.
  NOTE: "safety/allergy flags" deferred — no per-student medical field exists in
  the schema yet (would need `Student.medicalNotes` + admin UI first).
- **D — Notifications + catering (DONE):**
  - Outbox notifications on booking events: parent gets a booking-confirmation
    (push + in-app) and a payment-confirmed notification; the provider's users
    get a new-booking email — all via the reliable-delivery outbox
    (`services/clubNotify.ts`, wired into `clubs.ts` + the payment PATCH).
  - Catering variant: `CafeteriaMenu.providerId` + migration; provider-scoped
    weekly-menu CRUD (`/api/provider-portal/menus`, ownership + linked-school
    scoped, whole-menu save with per-day items); the portal shell is now
    **type-aware** (CATERING → Menus; ECA → Activities + Bookings) with a
    `MenusPage` and a type-adaptive dashboard. Guardrail tests: menu
    ownership/tenancy scoping.

## Status — Phases A–D complete
Providers can be onboarded (admin), self-manage clubs or menus (portal), take
paid bookings, and get notified; parents browse/book/pay. All server code
typechecks with 55 guardrail tests passing; all four frontends build clean.
Remaining follow-ups: provider 2FA endpoints, logo/photo uploads, per-student
medical/allergy flags (needs a `Student.medicalNotes` field first), and running
the 4 provider migrations against a dev Postgres.

## Status
Phase A backend is complete, typechecks clean, and is covered by guardrail
tests. Remaining Phase A work: the `apps/provider` frontend shell and the 2FA
endpoints. DB-dependent behavior (the migration, live auth) needs one run
against a dev Postgres to confirm.

---

# Pre-launch hardening & product roadmap

Prioritised plan agreed after Phases A–D. Each batch is independently
shippable and verified (typecheck + guardrail tests + app builds).
**Descoped:** payment-processor integration — clubs stay link-only; Wasil tracks
the manual paid/unpaid status only.

## Batch 1 — Security close-out + tenant-scoping helper  (DONE)
Delivered: `tenant()` scoping helper (`services/tenant.ts`); M1 refresh-token
hashing (staff + provider); M3 files folder delete + parent/folder ownership;
M4 inbox reply-target validation; M5 inbox reaction/typing participant checks;
M6 forms-respond school scope; M7 form-activation school scope; M8 consultation
teacher-removal scope; M9 school-services registration status/payment scope; M11
parent search audience filter (messages + forms); L2 SVG event-handler
rejection; L8 staff class-assignment school validation. +8 guardrail tests (64
total). **Deferred:** L4 refresh-token reuse detection (needs a token-family
schema change + rotation rework — own change); L5–L7 eca/child-write
cross-tenant integrity writes (cuid-gated, lower risk); full repository refactor
(using the `tenant()` helper + incremental migration instead).

### Original scope

The provider portal added a new external write-actor; tenant isolation is now
the highest-risk surface. Close the remaining review cluster and centralise
scoping so it's one testable thing.
- Extract a `scopedWhere(user, extra)` / thin repository helper; migrate the
  hand-rolled `schoolId` filters (~300 call sites) incrementally, starting with
  the deviations.
- Fix remaining items (verify each against current code first):
  M1 hash refresh tokens (staff + provider); M3 files folder delete +
  parent/folder ownership; M4 inbox `replyToId` conversation check; M5 inbox
  reactions/typing participant check; M6 cross-tenant form respond; M7 form
  activation via `formId`; M8 consultation teacher removal scope; M9
  schoolServices registration status/payment scope; M11 parent search audience
  filter; L2 strip SVG event handlers; L4 refresh-token reuse detection; L5–L8
  eca/child-write/staff class-assignment tenant checks.
- Guardrail tests: tenant-A-cannot-touch-tenant-B per fixed route.

## Batch 2 — CI + test floor  (DONE)
Delivered: `.github/workflows/ci.yml` — a `server` job (Postgres service →
prisma generate → **migrate deploy** → migrate status → typecheck → unit tests →
db push → **integration tests**) and a `web` matrix job (typecheck + vite build
for admin/parent/provider) on every PR/push. A real-Postgres integration harness
(`vitest.integration.config.ts`, `test/integration/`) with a provider
tenant-isolation test proving scoping holds at the SQL layer.

**Migration history repaired (important):** CI surfaced that the migration chain
could never build a fresh database — there was *no* initial migration creating
the base tables (only incremental ALTERs on a `db push` base), so `migrate
deploy` failed on `School` not existing. Squashed the whole history to a single
`00000000000000_init` baseline generated from the schema; `migrate deploy` now
builds from scratch (validated locally against Postgres) and O1's deploy switch
actually works. Existing db-push databases reconcile via
`scripts/baseline-migrations.sh` (updated).

### Original scope

No CI exists today; 35 route modules are near-uncovered while money now flows.
- GitHub Actions: install workspaces, `prisma generate`, typecheck (server +
  all apps), run server vitest, build all four frontends — on every PR.
- Add a Postgres service + a small integration layer for the money/auth paths
  (booking lifecycle, payment-status transitions, refresh/rotation, register)
  alongside the existing mocked unit tests.
- Extend unit coverage to the highest-traffic existing routes (messages create,
  forms respond, notifications).

## Batch 3 — Data protection & governance
New PII flow: parent contact + child allergy/medical data shared with external
companies. Under UAE PDPL this needs real controls.
- `ParentConsent` record (parent + provider + version + timestamp) captured at
  booking time; surface consent copy before the first booking with a provider.
- Provider audit trail: extend `AuditLog` to support a provider actor
  (`actorType` + nullable `providerUserId`) and log provider mutations + PII
  access to the table (not just structured logs).
- Provider offboarding flow: decide + implement handling of a removed provider's
  activities/menus/bookings (soft-archive vs the current FK `SET NULL` detach).
- Draft privacy-policy language + a provider data-processing agreement template
  (content — flag for legal review, not a code deliverable).

## Batch 4 — Parent experience: failure surfacing + timezone
Small fixes, high daily value; low risk.
- Wire `ToastProvider` into `apps/parent/main.tsx`; surface the silent
  `catch`/console.error sites (send, RSVP, react, mute, book) as toasts; add a
  shared `ErrorState` with retry for failed fetches (they currently render as
  empty states).
- Shared `todayLocalISO()` (Asia/Dubai); replace the UTC `new Date().toISO...`
  "today" logic in parent + admin pages.

## Batch 5 — RTL + Arabic completeness  (highest product value for a .ae school)
- On `i18n.changeLanguage`, set `document.documentElement.dir`/`lang`; audit
  directional CSS (Tailwind logical utilities / `rtl:` variants).
- Complete translation coverage for the ~half of parent pages with no
  `useTranslation`, and the hardcoded `BottomTabBar` labels.
- QA pass in Arabic across the main flows (incl. the new Clubs page).

## Batch 6 — Provider ops: invite emails + admin analytics
- Send provider invitation emails via the outbox (registration link) instead of
  returning the raw token for copy-paste.
- Admin analytics for clubs/catering: enrolment, paid vs unpaid, fill rates,
  revenue-at-manual-status, per provider — scoped to the school.

## Batch 7 — Observability
- Wire `SENTRY_DSN` (env + deploy config; adapter already built).
- Outbox monitoring: an admin view + alert for `FAILED` entries, prioritising
  emergency-alert and booking/payment kinds; a cron that flags stuck entries.

## Later (post-launch)
Waitlists for full clubs; provider↔parent messaging; two-way calendar sync.

## Suggested order
1 → 2 (both launch-blocking) → 3 (legal) → 4 (quick wins) → 5 (RTL, large) →
6 → 7. Batches 1, 2, 4, 6, 7 are squarely code+test; 3 and 5 carry
legal/QA components beyond code.
