# Wasil Connect → Wasil Hub integration plan

Hub is the ecosystem's identity provider and shared MIS layer (Better Auth,
**RS256 JWT + JWKS**; Prisma/Postgres; Next.js). Connect becomes a *relying
party*: staff sign in once at Hub and launch Connect from the Hub dashboard.

Two stages, sequenced:
- **Stage 1 — Staff SSO** (this ask): Connect trusts Hub-issued JWTs for staff;
  the admin area no longer hosts its own login.
- **Stage 2 — MIS data**: Hub is the source of truth for pupils, staff,
  guardians, classes, year-groups, calendar and timetable; Connect syncs.

> Note: Hub ships `@wasil/sso-client`, but its helpers are **Next.js-only**
> (`createSso().exchangeRoute()`, middleware). Connect is a **Vite SPA + Express
> API**, so we port the framework-agnostic core (`verify.ts`: `jose`
> `createRemoteJWKSet` + `jwtVerify`, ~15 lines) onto Express and reuse Connect's
> existing OAuth handoff (`authCodeStore` → `?code=` → admin `AuthCallback`).

---

## Stage 1 — Staff SSO

### The launch flow (mirrors Connect's existing OAuth callback)

```
Hub dashboard ──click "Connect" tile──▶ Hub /launch/connect
  (Hub verifies session + subscription, resolves this user's Connect roles,
   mints an RS256 JWT: iss=hub, aud=wasil-connect, sub=hubUserId, sid=hubSchoolId,
   gr=[globalRoles], ar=[connectAppRoles], exp=5m)
        │
        ▼  redirect  https://<connect-api>/auth/hub/exchange?hub_token=<JWT>
  Connect API  /auth/hub/exchange
     1. Verify JWT via Hub JWKS (issuer + audience + exp), single-use/replay guard
     2. Resolve School by token.sid → School.hubSchoolId  (reject if unlinked)
     3. Resolve staff User by hubUserId → else link by email → else JIT-create
     4. Map Hub roles (gr/ar) → Connect role (ADMIN | STAFF); reject non-staff
     5. Issue Connect access+refresh tokens (existing jwt.ts)
     6. generateAuthCode() → redirect ADMIN_APP_URL/auth/callback?code=…
        │
        ▼
  Admin app AuthCallback → stores tokens → admin dashboard
```

Connect keeps its **own** session tokens (nothing else in the API changes —
`isAuthenticated` still verifies Connect tokens). Only the *entry point* moves.

### Connect-side work

1. **Config + deps** — add `jose`; env: `HUB_URL`, `HUB_ISSUER`
   (`https://hub.wasil.app`), `HUB_AUDIENCE` (`wasil-connect`), `HUB_JWKS_URL`
   (default `${HUB_URL}/.well-known/jwks.json`), `HUB_LAUNCH_URL`
   (`${HUB_URL}/launch/connect`).
2. **`services/hubSso.ts`** — `verifyHubToken(token)` (JWKS verify: issuer,
   audience, HS→RS256, exp) + single-use replay guard (in-memory now, Redis when
   multi-instance — same caveat as today's `authCodeStore`).
3. **Schema (additive migration)** — `School.hubSchoolId String? @unique`,
   `User.hubUserId String? @unique`.
4. **`POST/GET /auth/hub/exchange`** — the flow above, reusing
   `generateAuthCode` + the admin `AuthCallback`. Clear, non-leaky errors for:
   invalid/expired token, unknown/unlinked school, replay, non-staff role.
5. **Identity resolution** (`services/hubProvisioning.ts`) — match `hubUserId`,
   else link an existing staff `User` by lowercased email (covers the 22 current
   staff), else JIT-create `{ email, name, role, schoolId, hubUserId }`. Staff
   only.
6. **Role mapping** — a small table Hub role → Connect role *(confirm the
   mapping)*. Default: Hub app role `admin` or global `SCHOOL_ADMIN` → `ADMIN`;
   `TEACHER`/`TEACHING_ASSISTANT`/other Connect app roles → `STAFF`. No mapping →
   reject (don't silently grant).
7. **2FA** — Hub is the IdP (it owns MFA). Skip Connect's own 2FA prompt on
   Hub-SSO logins; retain it only for any legacy password fallback.
8. **Admin app** — unauthenticated → redirect to `HUB_LAUNCH_URL` instead of the
   login page; keep `AuthCallback` for the `?code=` handoff; hide the
   password/Google/MS login UI (behind the coexistence flag).
9. **Coexistence flag** — `STAFF_AUTH_MODE = hub | legacy | both` so we can run
   both during cutover, then switch staff to `hub`.

### Hub-side work (in `wasilhub`)

- Register Connect in the App catalogue (`packages/db/src/seed.ts`): slug
  `connect`, `audience = wasil-connect`, launch/return URL, non-sensitive, app
  roles + `autoAssignFor` mappings; (later) `webhookUrl`.
- Link the Hub school ↔ Connect school (record Connect's `hubSchoolId`).
- Issue a `wsk_` **service token** for Stage 2.

### Decisions (locked)
- **Cutover: Hub-only immediately.** Remove the legacy staff password/Google/MS
  login once SSO works. (Legacy code kept behind a disabled flag for emergency
  rollback, not exposed in the UI.)
- **Linking: admin pre-maps = link-to-existing-only, never auto-create.** On
  exchange: match `hubUserId`; else match a *pre-existing* Connect staff `User`
  by verified email (Hub asserts it) and set `hubUserId`; else **403** "no
  Connect account — an administrator must add you first." New staff get a Connect
  account (email + role) from an admin first, then SSO. Resolves the
  hub-only/pre-map chicken-and-egg: the existing 22 staff are already mapped.
- **Role authority: Connect's own role governs.** The admin sets the staff
  member's role in Connect; Hub role claims are not used to auto-grant in Stage 1
  (only to confirm staff-eligibility). Reconsider when/if we auto-provision.
- **Scope: staff SSO now + begin Stage-2 data pull (pupils/staff) in parallel.**
  Parents stay on invitations/magic-link for now.
- **School linking:** set `School.hubSchoolId` for VHPS via a one-off (the Hub
  `sid` from the first admin's token, applied by SQL/CLI); an admin "link to Hub"
  action can come later.

---

## Stage 2 — MIS data (outline; sequence after SSO ships)

Hub is source of truth for pupils, staff, guardians, classes, year-groups,
calendar, timetable. Use `@wasil/pupils-client` with the `wsk_` service token.

- **Pull**: `/api/v1/pupils|staff|guardians|classes|year-groups` → idempotent
  upserts into Connect keyed by hub ids (`Student.hubPupilId`, etc.).
- **Freshness**: subscribe to webhooks (`pupil.*`, `staff.*`, `guardian.*`,
  `roles.updated`, `class.updated`, `timetable.version_published`,
  `calendar.updated`) — HMAC-verified via `verifyWebhookSignature`; plus polling
  `GET /api/v1/sync-status`; surface a **stale-data banner** with admin-triggered
  sync (Hub doesn't push data, you pull).
- **Consequence**: Connect's own student/parent/staff/class CRUD becomes
  read-mostly / sync-driven — a significant behavioural change to plan carefully
  (what stays Connect-owned vs Hub-owned).
- **Calendar/timetable**: map Hub calendar events → Connect events; Hub timetable
  versions → Connect schedule.

Later stages: server-to-server notifications back to Hub (`wasil-hub-service`
audience); parent SSO if/when parents become Hub identities.

---

## Delegation map (Fable plans; Opus + Sonnet implement)

| Owner | Work |
| --- | --- |
| **Fable** (plan/orchestrate) | Architecture, sequencing, decision capture, reviewing + integrating agent output, cross-repo coordination. |
| **Opus** (security-critical, must be correct) | `hubSso.ts` verify + replay; `/auth/hub/exchange`; identity resolution + JIT provisioning; role mapping; schema/migration; guardrail tests (valid/expired/wrong-aud/replay/unlinked-school/non-staff). Stage 2: the sync engine (idempotent upserts, webhook signature verify, conflict rules). |
| **Sonnet** (mechanical / UI / scaffolding) | Env + config wiring; admin login-removal + redirect-to-Hub + `AuthCallback` tweak; coexistence-flag plumbing; Hub-side seed/catalogue registration; Stage-2 stale-data banner + sync buttons; docs. |

Each agent's output lands as its own reviewed commit; Fable integrates and runs
CI (Batch 2 pipeline) before merge.

---

# Stage 3 — Timetable "today" helpers (class-based)

Surface per-child, on the parent dashboard, the day's *reminder-worthy* subjects
from Hub's timetable (source of truth): "Today Eshaal has **Swimming** — kit 🩱",
"…**Library** — return your books 📚". Replaces Connect's manually-maintained
`ScheduleItem` helper. Generic **reminder map** covers Swimming/PE/Library and
future items — not hardcoded to one subject.

**Approach B (class-based) — chosen.** Specialist subjects (PE/Swimming/Library)
are timetabled per *class*, not per pupil, so Connect fetches ~16 class-days
(cacheable, shared across all parents) rather than fanning out per child.

## Hub side (already built)
- `GET /api/v1/timetable/effective/day?schoolId=&date=YYYY-MM-DD&class_id=<hubClassId>`
  → `{ blocks:[{ subject:{id,name,color,isStatutory}, specialist:boolean, start, end }], version_id, state_hash }` or `404 no published timetable`.
- `specialist:true` = Swimming/PE (blockType SPECIALIST); Library appears as a
  normal subject block (`subject.name = "Library"`).
- Freshness: `timetable.version_published` webhook (payload carries versionId/stateHash).
- **Prereq:** the connect `wsk_` token needs `timetable:read:class` scope — confirmed **missing** today (Hub team to add).

## Connect side
- `hubMis.getClassDay(hubSchoolId, hubClassId, date)` → blocks | null.
- **Timetable cache**, per `(hubClassId, date)`, TTL + invalidated on the
  `timetable.version_published` webhook (extend the existing `/api/hub/webhook` stub).
- `GET /api/timetable/today` (parent auth): resolve parent → children
  (`ParentStudentLink`) → distinct `Class.hubClassId` → class-day (cached) →
  **reminder map** → per-child `{ studentId, name, className, items:[{subject, specialist, emoji, reminder}] }`. **"Today" in Asia/Dubai** (school tz). Falls back to Connect `ScheduleItem`s if Hub has no published timetable.
- **Reminder map** (`services/timetableReminders.ts`): specialist flag / subject
  name → `{ emoji, reminder }` (Swimming/PE → kit, Library → books, …).
  Only reminder-worthy items are surfaced — not the full lesson list.
- **Shared client**: `api.timetable.today()` + response type.
- **Parent app**: ParentDashboard child cards show the reminder items,
  replacing/augmenting the current manual-schedule line.

## Prereqs before it works live
1. `timetable:read:class` scope on the connect token.
2. A published 2026/27 timetable in Hub.
3. Parent↔child links populated (pupils synced for 2026/27 + parents linked).

## Delegation
- **Opus**: `hubMis` timetable call + cache + webhook invalidation +
  `/api/timetable/today` + reminder map + Asia/Dubai "today" + shared api method + tests.
- **Sonnet**: ParentDashboard child-card UI + fallback (after the server contract lands).

---

## Stage 4 — School Calendar (Hub events → Connect) + teacher proposals

Hub owns the school calendar (`CalendarEvent`). Connect should **display** those
events (its "School Calendar" / `EventsPage`) instead of admins re-entering them,
and later let teachers **propose** events from Connect for Hub super-admin
approval. Two phases; Phase A is a straight pull, Phase B needs new Hub write +
moderation surface (coordinate on the Hub side first).

### Hub surface that already exists (read)
- `GET /api/v1/calendar/events?schoolId=&from=&to=[&guardian_email=|&staff_id=][&category=][&scoped=1]`
  → `{ from, to, events:[CalendarEventDTO], state_hash, cursor }`. Windowed
  (≤400d), identity-scoped (guardian view = WHOLE_SCHOOL + GUARDIAN_FACING only),
  `calendar:read` (or `calendar:read:guardian`) scope.
- `GET /api/v1/calendar/changes?...&since=<cursor>` — incremental deltas.
- `calendar.updated` webhook (already in our subscribe list).
- **CalendarEventDTO**: `{ id, title, description, category, location, all_day,
  starts_at, ends_at, kit (TRIP→true), audience?, cohort?:{year_groups[],classes[]}|{whole_school} }`.
- **Hub CalendarEvent model** carries: category, audience (WHOLE_SCHOOL /
  GUARDIAN_FACING / …), cohort targeting (`wholeSchool` + `CalendarEventTarget`),
  consent requirements, `externalMisId` / `misSource` (MANUAL default),
  `createdByUserId`, recurrence (reserved).

### Phase A — Hub calendar → Connect (one-way pull, Hub-owned)
- **Link column**: `Event.hubCalendarEventId String? @unique` (mirror Hub id,
  same pattern as the other hub-link columns).
- **Client**: `hubCalendar.getEvents(hubSchoolId, from, to)` +
  `getChanges(since)` → the DTO above. Needs `calendar:read` on the wsk token.
- **Sync** (`services/hubCalendarSync.ts`): idempotent upsert keyed on
  `hubCalendarEventId`. Map `starts_at`→`date`+`time`, `all_day`, `location`,
  `title`, `description`; `kit`/category → a display badge; `audience` decides
  parent visibility; **cohort → Connect targeting** (see decision 1). Windowed
  pull on demand + `calendar.updated` webhook invalidation + `/changes` cursor
  for incremental refresh (persist the cursor per school).
- **Ownership**: Hub-sourced events become **read-only in Connect** (edit in Hub);
  Connect-local events (if any remain) stay editable. Surface both, merged, under
  **Engagement → Events** (`EventsPage`), with a small "from Hub" marker on synced
  ones.
- **Retire the CSV upload**: the admin Events page's client-side CSV bulk-import
  (CsvRow / showCsvModal / showCsvGuide in `apps/admin/.../EventsPage.tsx`) becomes
  redundant once Hub feeds events — remove that UI in Phase A (no server route to
  delete; it's client-side create-per-row).

**Open decisions (Phase A):**
1. **Cohort mismatch** — Hub events can target *multiple* year-groups/classes;
   Connect `Event` was single-target. **DECIDED: extend `Event` to multi-target**
   via a new `EventTarget` join (class/year-group rows; no rows = whole school),
   used by both Hub-synced and manual events. Migrate existing events'
   `classId`/`yearGroupId` into `EventTarget` rows; the parent visibility query
   reads the join. **DECIDED: build Phase A now**, dormant behind `calendar:read`
   with graceful fallback (like the timetable helper), and retire the CSV upload.
2. **RSVP/consent** — Hub has `consentRequirements`; Connect has `requiresRsvp`.
   Phase A can ignore consent (display only) or map consent-required → RSVP.
3. **Recurrence** — Hub recurrence is reserved/null today; treat each event as a
   single occurrence until Hub emits expansions.

### Phase B — teacher proposals in Connect → Hub approval (write-back)
- Connect **STAFF** create a *proposed* event via a Connect form → stored locally
  as `PENDING` with the teacher's `hubUserId` as proposer.
- Connect POSTs it to a **new Hub endpoint** (Hub must build):
  `POST /api/v1/calendar/events` with a pending/approval status + `createdByUserId`
  + a Connect correlation id. Needs a new **`calendar:propose`/`calendar:write`**
  scope.
- Hub **super-admin** approves/rejects in Hub moderation UI → on approve it
  becomes a normal `CalendarEvent` (`misSource = CONNECT`) and flows back via the
  Phase A sync, replacing the local `PENDING` placeholder (matched on the
  correlation id); on reject, the placeholder is marked rejected with a reason.
- **Hub-side prerequisites (not ours to build):** a pending/approval **status**
  on `CalendarEvent`, a moderation UI, `event.approved` / `event.rejected`
  webhooks, and the `calendar:propose` scope + create endpoint. Flag & agree
  these with Hub before Connect-side Phase B starts.

### Prereqs before it works live
1. `calendar:read` scope on the connect wsk token (Phase A).
2. Hub write/approval surface + `calendar:propose` scope + approval webhooks (Phase B).

### Delegation
- **Opus**: `Event.hubCalendarEventId` migration + `hubCalendar` client + sync
  service (upsert, cohort mapping, cursor, webhook invalidation) + read-only
  guard on Hub-owned events + tests.
- **Sonnet**: `EventsPage` merge/marker (Phase A); teacher proposal form +
  pending/approved states (Phase B, after the Hub contract lands).
