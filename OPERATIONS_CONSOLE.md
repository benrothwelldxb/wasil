# Operations Console

The internal control centre for supporting the Wasil beta. This document covers
the **backend** that powers the console (built and tested) and the **UI build
plan** (the React modules, deferred to a follow-up — see "Status" below).

> **Status.** The console's API + support-action layer is complete, audited,
> tenant-safe and covered by real-Postgres integration tests. The **React UI is
> now built** (`apps/admin/src/ops/`) — a dark "Mission Control" console mounted
> at `/ops`, with a global ⌘K command palette. It reuses the platform data layer
> (`api.ops`, `useApi`) and design-system primitives (`ConfirmModal`, `Toast`),
> and is verified by `tsc` + a clean production `vite build`. Pages: Overview,
> Parent Support, School Health, Incidents, Background Jobs, Audit Explorer,
> System Health, Feature Flags, Invitations, Runbooks. Remaining UI gaps (light
> mode, virtualised tables, component/E2E tests, lazy-loading the bundle) are
> listed under "Future improvements".

---

## 1. Architecture

```
apps/admin  ── Operations Console (React, deferred) ──▶  /api/ops/*  (server-side authz)
                                                          │
   server/src/routes/ops.ts   (thin handlers, tenant scoping, audit)
        ├─ services/opsMetrics.ts     platform metrics        (Module 1, 12)
        ├─ services/systemStatus.ts   dependency health       (Module 8)
        ├─ services/opsQueries.ts     schools / audit / jobs / incidents / release
        │                                                    (Modules 2, 7, 9, 11, 14)
        ├─ services/opsSupport.ts     support actions         (Module 3)
        ├─ services/featureFlags.ts   flags                   (Module 10)
        └─ services/impersonation.ts  safe impersonation      (Module 3)
                                                          │
                                    Postgres (Prisma) — reuses existing data:
                                    User · AuthEvent · AuditLog · OutboxEntry ·
                                    bookings · FeatureFlag · Announcement · Feedback
```

The console reads data the platform **already writes** — there is no separate
analytics pipeline. `AuthEvent` (from the auth-hardening sprint) is the backbone
of the activation/login funnel; `OutboxEntry` is the backbone of queue/delivery
health.

## 2. Operational APIs

All under `/api/ops` (ADMIN / SUPER_ADMIN). A plain admin is auto-scoped to their
own school; a super-admin sees the platform and may pass `?schoolId=`.

| Module | Endpoint | Purpose |
| --- | --- | --- |
| 1, 12 | `GET /metrics` | activation funnel, DAU/WAU, logins/failures, bookings, notifications, queue |
| 8 | `GET /status` | colour-coded DB/workers/queue/email/push/SMS/storage/redis/sentry/hub |
| 11 | `GET /incidents` | derived incidents (severity, affected, suggested action, runbook link) |
| 14 | `GET /release` | version, commit, environment, applied migration, sentry-configured |
| 2 | `GET /schools` | per-school rollup (parents, activated %, pending, failed jobs, last activity) |
| 3 | `GET /support/search?q=` | find parents by name / email / child |
| 3 | `GET /support/parent/:id` | full record: invite, activation, auth history, notifications, bookings, audit |
| 3 | `POST /support/parent/:id/resend-invite` | re-send welcome; stamp `welcomeSentAt` |
| 3 | `POST /support/parent/:id/unlock` | clear `lockedUntil` + failed attempts |
| 3 | `POST /support/parent/:id/invalidate-sessions` | revoke all refresh tokens |
| 3 | `POST /support/parent/:id/reset-onboarding` | clear `welcomeSentAt` (re-invitable) |
| 3 | `POST /support/parent/:id/magic-link` | mint a one-time 15-min login link to hand over |
| 3 | `POST /impersonate/:userId` · `/impersonate/stop` | audited, 30-min, refresh-less |
| 9 | `GET /audit` | unified AuthEvent + AuditLog, filter by user/action/date |
| 7 | `GET /jobs` · `POST /jobs/:id/retry` · `POST /jobs/retry-failed` | outbox jobs + retry |
| 10 | `GET /flags` · `POST /flags/:key/global` · `POST /flags/:key/override` · `DELETE …` | feature flags |
| 6/8 | `GET/POST/PATCH/DELETE /announcements` · `GET/PATCH /feedback` | comms + feedback triage |

Client-facing (any signed-in user): `POST /api/feedback`, `GET /api/announcements`,
`GET /api/feature-flags`. Health: `GET /health`, `GET /health/ready`.

## 3. Permission model

- **Route gate:** every `/api/ops` endpoint requires `isAdmin` (ADMIN or
  SUPER_ADMIN). Client endpoints require `isAuthenticated`.
- **Tenant scoping:** `scopeSchool(req)` pins a plain admin to `req.user.schoolId`;
  a super-admin sees all (optionally `?schoolId=`). Every read filters by it.
- **Write scoping:** support actions call `loadTargetInScope(actor, id)` which
  **403s** if a non-super admin targets another school's parent. Job retry
  re-checks the entry's `schoolId`. Global flag defaults and platform-wide
  announcements require **super-admin**.
- **Impersonation:** never targets an admin/super-admin, self, or (for non-super)
  another school.
- **No client trust:** authorisation is entirely server-side; the UI only renders
  what the API returns.

## 4. Security model

- Server-side authz only; every mutating action is **audited twice** — a business
  `AuditLog` row (who/what/when/ip) and, for auth-relevant actions, an `AuthEvent`
  on the parent's authentication history.
- Secrets are never logged: the support magic link is returned only over the
  authed ops channel and the audit records *issuance*, not the token.
- Tenant isolation is tested explicitly (an admin from school B is refused on a
  school A parent and on a school A job).
- Impersonation tokens are short-lived and refresh-less — they cannot be silently
  extended.

## 5. Operational workflows (the two-minute answers)

| Question | Console path |
| --- | --- |
| Is the platform healthy? | `GET /status` + `GET /incidents` |
| Can this parent log in? | `GET /support/parent/:id` → check `locked`, auth history → `unlock` / `magic-link` |
| Why no invite? | parent record `invited` + `GET /status` (Email) + `GET /metrics` (EMAIL delivery) → `resend-invite` |
| Why did a booking fail? | parent record `bookings` + `GET /jobs` (failed notifications) |
| Is email working? | `GET /status` → Email; `GET /metrics` → `notifications.byKind.EMAIL` |
| Is the queue healthy? | `GET /jobs` summary + `GET /metrics` → `queue` |
| Is one school in trouble? | `GET /schools` → sort by failed jobs / activation % |

## 6. Support model

First-line support resolves the common cases without SQL: search → open record →
follow the matching runbook (OPERATIONS.md) → take a quick action (resend, unlock,
invalidate, reset, magic link) or impersonate to reproduce. Anything structural
escalates to the on-call engineer with the correlation already in the audit trail.

## 7. UI build plan (deferred, next sprint)

Add an **Operations** area to `apps/admin` (super-admin/admin guarded), reusing
`@wasil/shared` (`useTheme`, `useApi`, `api`, `ConfirmModal`, `useToast`) — desktop
first, responsive, dark-mode via `useTheme`, every destructive action behind
`ConfirmModal`.

| Priority | Module(s) | Component | Consumes |
| --- | --- | --- | --- |
| P0 | 1, 8, 11, 14 | `OpsOverviewPage` — health tiles, incident list, status grid, release footer; auto-refresh (React Query, 15s) | `/metrics` `/status` `/incidents` `/release` |
| P0 | 3 | `ParentSupportPage` — search box → result list → detail drawer with quick-action buttons (each `ConfirmModal`-guarded) | `/support/*` |
| P1 | 2 | `SchoolHealthPage` — sortable table, row → school drill-down | `/schools` `/metrics?schoolId=` |
| P1 | 7 | `JobsPage` — status summary + failed-job table with Retry / Retry-all | `/jobs` `/jobs/*/retry` |
| P1 | 9 | `AuditExplorerPage` — filters (user/action/date) + virtualised table | `/audit` |
| P2 | 10 | `FlagsPage` — flag grid, global/school/user toggles | `/flags` |
| P2 | 6 | `CommsPage` — announcements CRUD + feedback triage | `/announcements` `/feedback` |
| P2 | 13 | `RunbooksPage` — render OPERATIONS.md, searchable | static |

Add one `api.ops.*` namespace in `packages/shared` mirroring the table in §2, an
`/ops` route group in `apps/admin/App.tsx` behind `ProtectedRoute superAdminOnly`,
and a nav entry. Estimated ~1 sprint for P0+P1.

## 8. Future improvements

- Email **delivery/open/bounce** states (Modules 4/6) need Resend webhooks —
  today the funnel reports *sent* (welcome email) and *activated* (first login);
  delivered/opened are not yet observable.
- A **dead-letter queue** view (Module 7) once the outbox grows a DLQ status.
- **Support notes** on a parent (Module 3, marked "future" in the brief).
- Move the derived incident centre to a lightweight persisted incident log if you
  want history/ack/resolve.
- Correlation/request IDs threaded end-to-end for the audit explorer.
