# Closed-Beta Launch Checklist

Gate for inviting live parents. ✅ = done this/earlier sprint, ⬜ = required
before invites, ◻️ = recommended.

## Monitoring
- ✅ Liveness (`/health`) + readiness (`/health/ready`, checks DB) probes.
- ✅ Ops metrics API (activation funnel, logins, bookings, queue, delivery).
- ✅ System status API (DB, workers, queues, email, push, SMS, storage, Redis, Sentry, Hub — colour-coded).
- ⬜ A scheduled check that alerts when `queue.failedJobs > 0` or `oldestPendingAgeSec > 600` (data is exposed; wire it to your alerter).
- ◻️ Uptime monitor hitting `/health/ready` from outside.

## Support
- ✅ SQL-free parent lookup (search by name/email/child) + full record (invite, activation, activity, notifications, bookings, audit).
- ✅ Safe impersonation (audited, 30-min, no refresh, banner).
- ✅ Runbooks (OPERATIONS.md) for the nine common incidents.
- ⬜ A support inbox/rota and an escalation path to the on-call engineer.

## Security
- ✅ Passwordless auth hardened (atomic lock, distributed limits, audit) — see AUTHENTICATION.md.
- ✅ Impersonation cannot target admins/self/cross-school; fully audited.
- ✅ Feature-flag mutations gated (global = super-admin; overrides = own school).
- ⬜ Tenant-isolation audit of the ~300 hand-rolled `schoolId` filters **if the beta spans >1 school**.
- ◻️ Refresh token → httpOnly cookie (XSS blast radius).

## Backups
- ⬜ Automated DB backups enabled + a **restore drill** performed (you hold children's data).
- ⬜ Documented RPO/RTO for the beta.

## Feature flags
- ✅ Framework live (global/school/user) with kill-switches for clubs, catering, messaging, notifications, payments, consultations, experimental.
- ⬜ Decide the beta's flag posture (e.g. payments off; clubs/catering off unless PDPL consent has shipped).

## Error reporting
- ✅ Sentry adapter with `release`/`schoolId`/`userId`/`environment` tags.
- ⬜ Set `SENTRY_DSN` in the beta environment and confirm an event lands.
- ◻️ Frontend React error boundary → Sentry (server side is wired).

## Analytics
- ✅ Funnel data derivable from `AuthEvent` + `User` (invited → activated → active).
- ⬜ Confirm the metrics you'll review daily (activation rate, DAU/WAU, booking + notification success).
- ◻️ Product analytics for in-app funnels (first booking, repeat booking).

## Communication
- ✅ Announcements/banners (known issue / maintenance / closure / feature / emergency), scheduled + school-scoped.
- ✅ In-app "Report a Problem" capture (screen, version, device, school, user).
- ⬜ Publish a "beta — here's how to get help" announcement on day one.

## Known issues
- ⬜ Maintain a known-issues list and surface the active ones via an announcement banner.
- ⬜ Decide beta scope: clubs/catering **in or out** (PDPL consent), provider portal deferred.

## Rollback strategy
- ✅ Additive migrations only this sprint (safe to leave during a code rollback).
- ✅ Rollback runbook (OPERATIONS.md §9).
- ⬜ Rehearse a one-click redeploy of the previous release on the host.

---

## Readiness by cohort

| Cohort | Engineering | Product |
| --- | --- | --- |
| **10** | ✅ probes, ✅ status, ✅ support lookup, ⬜ Sentry DSN set | ✅ feedback capture, ⬜ day-one help announcement, personal onboarding |
| **100** | ⬜ queue/failed-job alert, ⬜ backups+restore drill | ⬜ activation dashboard reviewed daily, ⬜ known-issues process |
| **1,000** | ⬜ tenant audit (if multi-school), ⬜ PgBouncer/pool sizing, ◻️ Redis for 2FA/limits | ⬜ Arabic/RTL, ⬜ PDPL consent (if clubs) |
| **10,000** | ◻️ multi-instance + load test, ◻️ HA DB | self-serve onboarding, SLAs |
