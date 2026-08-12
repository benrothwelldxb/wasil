# Operations & Runbooks

How to operate the Wasil beta and resolve the common incidents — written for the
engineer on call at 9:00am on the first day of school.

## Operator surfaces (built this sprint)

All under `/api/ops` (ADMIN / SUPER_ADMIN; a plain admin is auto-scoped to their
own school, super-admin sees the platform and may pass `?schoolId=`):

| Need | Endpoint |
| --- | --- |
| Platform metrics (activation funnel, logins, bookings, queue, delivery) | `GET /api/ops/metrics` |
| Colour-coded dependency status | `GET /api/ops/status` |
| Find a parent (by name/email/child) | `GET /api/ops/support/search?q=` |
| Full parent record (invite, activation, activity, notifications, bookings, audit) | `GET /api/ops/support/parent/:id` |
| Feature flags (list / global / school / user) | `GET/POST/DELETE /api/ops/flags…` |
| Announcements (CRUD) | `…/api/ops/announcements` |
| Feedback triage | `GET/PATCH /api/ops/feedback` |
| Impersonate a parent (audited, 30-min, no refresh) | `POST /api/ops/impersonate/:userId` |

Client-facing (any signed-in user): `POST /api/feedback`, `GET /api/announcements`,
`GET /api/feature-flags`.

Health probes: `GET /health` (liveness), `GET /health/ready` (readiness — checks DB).

## Kill-switches (feature flags)

Turn a subsystem off instantly, no deploy:

```
# Whole platform (super-admin):
POST /api/ops/flags/clubs/global      { "enabled": false }
# One school (admin):
POST /api/ops/flags/catering/override { "schoolId": "<id>", "enabled": false }
# One user:
POST /api/ops/flags/payments/override { "userId": "<id>", "enabled": false }
```
Resolution precedence: **user > school > global default**. Flags: `clubs`,
`catering`, `messaging`, `notifications`, `payments`, `consultations`,
`experimental`.

---

## Runbooks

Each: **Symptoms → Likely causes → Investigate → Resolve → Verify.**

### 1. Parent can't log in
- **Symptoms:** parent reports the code is rejected / never arrives / "locked".
- **Likely causes:** wrong/expired code; 5-attempt lock on the code; email not delivered; account not provisioned; account `lockedUntil` (password path).
- **Investigate:** `GET /api/ops/support/parent/:id` → check `invited`, `activated`, `locked`, and `authEvents` (look for `verify_failed`, `lockout_triggered`, `code_issued`). Cross-check `GET /api/ops/status` → Email = ok.
- **Resolve:** ask them to request a *new* code (supersedes the old, clears the lock). If email isn't arriving, see Runbook 2. If provisioned but never invited, re-send the invite. To reproduce their view, **impersonate** them.
- **Verify:** a fresh `code_issued` then `session_created` in their `authEvents`; `activated: true`.

### 2. Invitation not received
- **Symptoms:** parent says no welcome/code email.
- **Likely causes:** email provider down/misconfigured; wrong address; spam; bulk invite still queued.
- **Investigate:** `GET /api/ops/status` → Email (Resend). `GET /api/ops/metrics` → `notifications.byKind.EMAIL` (sent vs failed) and `queue.depth`. Confirm the address on the parent record.
- **Resolve:** fix `RESEND_API_KEY`/domain (SPF/DKIM) if Email ≠ ok; correct the address; re-send. Tell them to check spam.
- **Verify:** `notifications` on the parent record shows the send; delivery in the Resend dashboard.

### 3. Booking failed
- **Symptoms:** parent can't book a club/consultation.
- **Likely causes:** flag off; capacity full; validation; provider link issue.
- **Investigate:** `GET /api/ops/feature-flags` (is `clubs`/`consultations` enabled for them?); parent record `bookings`; recent `Feedback`.
- **Resolve:** re-enable the flag if wrongly off; explain capacity; escalate provider issues.
- **Verify:** a booking row appears for the parent; impersonate to confirm the flow.

### 4. Notification failed
- **Symptoms:** parents not receiving push/email/SMS.
- **Likely causes:** provider outage; outbox worker stalled; bad credentials.
- **Investigate:** `GET /api/ops/status` → Workers/Queues + the relevant provider. `GET /api/ops/metrics` → `notifications.successRatePct`, `queue.failedJobs`, `queue.oldestPendingAgeSec`.
- **Resolve:** fix provider creds; restart the worker/dyno if `oldestPendingAgeSec` is climbing; failed outbox entries retry on their own schedule — re-queue if needed.
- **Verify:** `queue.depth` drains, `failedJobs` stops growing, success rate recovers.

### 5. Queue backlog
- **Symptoms:** `queue.depth` high / `oldestPendingAgeSec` > 600 / Workers amber.
- **Likely causes:** worker not running; DB slow; a provider timing out and retrying.
- **Investigate:** `GET /api/ops/status`; check worker process/logs; DB status.
- **Resolve:** restart the worker; if one `kind` is failing, disable it via the `notifications` flag while you fix the provider.
- **Verify:** oldest-pending age falls; depth trends to zero.

### 6. Database outage
- **Symptoms:** `GET /health/ready` = 503; Database = down; broad 500s.
- **Likely causes:** DB down/unreachable; connection pool exhausted; failover.
- **Investigate:** `/health/ready`; DB provider dashboard; connection count.
- **Resolve:** restore/failover the DB; if pool-exhausted under load, raise `connection_limit` / add PgBouncer (see AUTHENTICATION.md §8). Load balancer drains the instance automatically on 503.
- **Verify:** `/health/ready` = 200; Database = ok in `/api/ops/status`.

### 7. Redis outage
- **Symptoms:** N/A today — Redis is **not** used (status shows `not_configured`).
- **Note:** the rate-limit store is Postgres-backed and the 2FA handoff is in-memory. When Redis is later introduced (multi-instance 2FA / limits), this runbook becomes: check `REDIS_URL`, restart, verify status = ok.

### 8. Email outage
- **Symptoms:** Email = down/not_configured; no codes/invites/notifications.
- **Likely causes:** `RESEND_API_KEY` missing/invalid; domain unverified; provider incident.
- **Investigate:** `GET /api/ops/status` → Email; Resend dashboard; `notifications.byKind.EMAIL` failures.
- **Resolve:** fix key/domain; publish an **announcement** ("email delays — codes may be slow") so support isn't flooded; codes/invites are re-requestable once restored.
- **Verify:** a test invite delivers; failures stop.

### 9. Deployment rollback
- **Symptoms:** errors/crashes spike right after a deploy (watch Sentry `release`).
- **Investigate:** Sentry filtered by the new `release` tag; `/health/ready`.
- **Resolve:** redeploy the previous image/commit on the host (Railway → redeploy prior). **Migrations:** roll *code* back freely; a **schema** rollback needs a down-migration or a compensating migration — never `migrate reset` in prod. All ops migrations here are additive (safe to leave in place during a code rollback).
- **Verify:** error rate returns to baseline; `/health/ready` = 200; smoke the beta-critical path (sign in → feed → RSVP).

---

## Impersonation (support)
`POST /api/ops/impersonate/:userId { reason }` returns a **30-minute, refresh-less**
token that authenticates as the parent and carries the operator's id (`act`).
`/auth/me` then returns `impersonatedBy` so the client shows a banner; exit by
discarding the token. Every start/stop is written to `ImpersonationSession` +
`AuthEvent`. Admins/super-admins can never be impersonated, nor can you
impersonate yourself or cross school boundaries (super-admin excepted).

## Error reporting
Set `SENTRY_DSN` to forward unhandled exceptions, API failures, and worker/queue
give-ups, tagged with `schoolId`, `userId`, `environment`, and `release`
(commit SHA). Without a DSN, everything still goes to structured logs.
