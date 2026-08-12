# Go-Live Checklist

Run this before inviting the first real school. `[ ]` = verify/act, `[x]` = done
in code this sprint. Companion to `BETA-CHECKLIST.md` (cohort readiness) and
`OPERATIONS.md` (runbooks).

## Database
- [x] Migrations build a fresh DB from scratch (`prisma migrate deploy`, CI-verified).
- [x] All migrations additive this sprint (safe during a code rollback).
- [ ] `migrate status` clean against the **production** DB before deploy.
- [ ] Automated backups enabled; **restore rehearsed** at least once.

## Environment variables & secrets
- [ ] `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` set (server refuses to boot without the JWT secrets).
- [ ] `AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`.
- [ ] `SENTRY_DSN`, `CORS_ORIGIN`, `PARENT_APP_URL`, `ADMIN_APP_URL`.
- [ ] Storage: `S3_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY`.
- [ ] Optional: `FIREBASE_*` (push), `TWILIO_*` (SMS), `HUB_BASE_URL` (MIS).
- [ ] Secrets stored in the platform secret manager, not in the repo.

## Observability
- [x] Liveness `/health` + readiness `/health/ready` (DB-checked).
- [x] Sentry adapter tags school / user / environment / **release** / **correlationId** / feature-flag state; 500s return the correlation id.
- [x] Every request carries an `x-request-id` (honours inbound, else minted).
- [ ] `SENTRY_DSN` set in prod and a test event confirmed to land.
- [ ] Alert wired on `queue.failedJobs > 0` / `oldestPendingAgeSec > 600` (data exposed at `/api/ops/metrics`).
- [ ] External uptime monitor on `/health/ready`.

## Email
- [x] Delivery webhook (`POST /api/webhooks/resend`) records delivered/opened/bounced/complained; shown per-parent in the console.
- [ ] SPF/DKIM verified on the sending domain; a real invite delivers end-to-end.
- [ ] Resend webhook endpoint registered + `RESEND_WEBHOOK_SECRET` matches.

## Queues & workers
- [x] Outbox worker drains PENDING; failures visible + retryable in the console (`/ops/jobs`).
- [ ] Worker process/dyno running in prod; confirmed draining.

## Redis
- [x] Not required today (rate-limit store is Postgres-backed; 2FA handoff in-memory). Status shows `not_configured`.
- [ ] If running multiple instances, provision Redis for the 2FA handoff + rate limits (see AUTHENTICATION.md §9).

## Feature flags
- [x] Kill-switches live (clubs/catering/messaging/notifications/payments/consultations/experimental), global/school/user, audited.
- [ ] Beta posture set (e.g. payments off; clubs/catering off unless PDPL consent shipped).

## Security
- [x] Passwordless auth hardened (atomic lock, distributed limits, audit) — AUTHENTICATION.md.
- [x] Tenant isolation on every ops read + support action (integration-tested).
- [x] `helmet()` security headers enabled.
- [ ] Tenant-isolation audit of legacy hand-rolled `schoolId` filters **if beta spans >1 school**.
- [ ] Refresh token → httpOnly cookie (XSS blast radius) — post-beta.

## Support
- [x] Operations Console (`/ops`): overview, parent support + actions, jobs, audit, health, flags, runbooks; ⌘K palette.
- [x] Runbooks (OPERATIONS.md) for the nine common incidents.
- [ ] Support rota + escalation path to on-call; a day-one "how to get help" announcement.

## Monitoring / runbooks / contacts
- [ ] On-call engineer + support contact documented and reachable.
- [x] Runbooks embedded in the console and in OPERATIONS.md.

## Rollback plan
- [x] Rollback runbook (OPERATIONS.md §9); additive migrations this sprint.
- [ ] One-click redeploy of the previous release rehearsed on the host.
