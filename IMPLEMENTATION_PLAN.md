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
