// Must be imported before any routes are defined: patches Express 4 so that a
// rejected promise thrown from an async route handler is forwarded to the error
// middleware instead of hanging the request until timeout.
import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import passport from 'passport'
import dotenv from 'dotenv'
import { pinoHttp } from 'pino-http'
import logger from './services/logger.js'
import { captureException } from './services/errorReporter.js'
import { initErrorReporting } from './services/sentry.js'

import { configurePassport } from './middleware/passport.js'
import authRoutes from './routes/auth.js'
import hubAuthRoutes from './routes/hubAuth.js'
import hubSyncRoutes from './routes/hubSync.js'
import hubWebhookRoutes from './routes/hubWebhook.js'
import messagesRoutes from './routes/messages.js'
import formsRoutes from './routes/forms.js'
import eventsRoutes from './routes/events.js'
import scheduleRoutes from './routes/schedule.js'
import termDatesRoutes from './routes/termDates.js'
import weeklyMessageRoutes from './routes/weeklyMessage.js'
import knowledgeRoutes from './routes/knowledge.js'
import pulseRoutes from './routes/pulse.js'
import usersRoutes from './routes/users.js'
import classesRoutes from './routes/classes.js'
import policiesRoutes from './routes/policies.js'
import filesRoutes from './routes/files.js'
import schoolsRoutes from './routes/schools.js'
import staffRoutes from './routes/staff.js'
import yearGroupsRoutes from './routes/yearGroups.js'
import auditLogsRoutes from './routes/auditLogs.js'
import notificationsRoutes from './routes/notifications.js'
import deviceTokensRoutes from './routes/deviceTokens.js'
import parentInvitationsRoutes from './routes/parentInvitations.js'
import studentsRoutes from './routes/students.js'
import linksRoutes from './routes/links.js'
import groupsRoutes from './routes/groups.js'
import ecaRoutes from './routes/eca.js'
import consultationsRoutes from './routes/consultations.js'
import analyticsRoutes from './routes/analytics.js'
import emergencyAlertsRoutes from './routes/emergencyAlerts.js'
import schoolServicesRoutes from './routes/schoolServices.js'
import inboxRoutes from './routes/inbox.js'
import searchRoutes from './routes/search.js'
import inclusionRoutes from './routes/inclusion.js'
import cafeteriaRoutes from './routes/cafeteria.js'
import attendanceRoutes from './routes/attendance.js'
import schoolSettingsRoutes from './routes/schoolSettings.js'
import providerAuthRoutes from './routes/providerAuth.js'
import providersRoutes from './routes/providers.js'
import providerPortalRoutes from './routes/providerPortal.js'
import clubsRoutes from './routes/clubs.js'
import timetableRoutes from './routes/timetable.js'
import prisma from './services/prisma.js'
import { initFirebase } from './services/firebase.js'
import { cleanupExpiredTokens, sendConsultationReminders, sendScheduleReminders } from './services/cleanup.js'
import { cleanupOldAuditLogs } from './services/audit.js'
import { sendDueAttendanceDigests } from './services/attendanceDigest.js'
import { drainOutbox } from './services/outbox.js'
import { withJobLock } from './services/jobLock.js'
import { sendEventRsvpReminders } from './services/eventReminders.js'

dotenv.config()

// Forward captured exceptions to Sentry when SENTRY_DSN is configured (no-op otherwise).
initErrorReporting()

// Validate required environment variables
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL', 'TOTP_ENCRYPTION_KEY', 'CORS_ORIGIN']
if (process.env.NODE_ENV === 'production') {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
}

// Initialize Firebase for push notifications (optional)
initFirebase()

const app = express()
const PORT = process.env.PORT || 4000

// Per-request structured logger. Attaches `req.log` carrying `reqId` and a
// sane summary of the request/response. Auth middleware later enriches it
// with schoolId/userId via withUserLogContext().
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err) return 'error'
      if (res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    // Drop the chatty request/response objects from the default serializers
    // — keep just what's useful in production logs.
    serializers: {
      req: req => ({ method: req.method, url: req.url, id: req.id }),
      res: res => ({ statusCode: res.statusCode }),
    },
  }),
)

// Security headers
app.use(helmet())

// Middleware
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  credentials: true,
}))
// Wasil Hub webhook receiver — MUST be mounted before express.json() because
// its HMAC signature is computed over the raw request bytes (it parses the body
// with express.raw internally). See routes/hubWebhook.ts.
app.use('/api/hub', hubWebhookRoutes)

// JSON body limit. Explicit cap stops a single client from queueing
// arbitrarily large payloads (default in Express is 100kb; this raises it to
// 1mb to comfortably fit forms with many fields, but no larger). Anything
// bigger should go through multer (multipart upload).
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// Passport initialization (OAuth strategies only, no sessions)
app.use(passport.initialize())
configurePassport()

// Static file serving removed — files served from Cloudflare R2

// Routes
app.use('/auth', authRoutes)
// Wasil Hub SSO exchange (GET/POST /auth/hub/exchange)
app.use('/auth/hub', hubAuthRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/forms', formsRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/schedule', scheduleRoutes)
app.use('/api/term-dates', termDatesRoutes)
app.use('/api/weekly-message', weeklyMessageRoutes)
app.use('/api/knowledge', knowledgeRoutes)
app.use('/api/pulse', pulseRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/classes', classesRoutes)
app.use('/api/policies', policiesRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/schools', schoolsRoutes)
app.use('/api/staff', staffRoutes)
app.use('/api/year-groups', yearGroupsRoutes)
app.use('/api/audit-logs', auditLogsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/device-tokens', deviceTokensRoutes)
app.use('/api/parent-invitations', parentInvitationsRoutes)
app.use('/api/students', studentsRoutes)
app.use('/api/links', linksRoutes)
app.use('/api/groups', groupsRoutes)
app.use('/api/eca', ecaRoutes)
app.use('/api/consultations', consultationsRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/emergency-alerts', emergencyAlertsRoutes)
app.use('/api/school-services', schoolServicesRoutes)
app.use('/api/inbox', inboxRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/inclusion', inclusionRoutes)
app.use('/api/cafeteria', cafeteriaRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/school-settings', schoolSettingsRoutes)
// External provider portal: separate auth surface + admin-side management.
app.use('/provider/auth', providerAuthRoutes)
app.use('/api/providers', providersRoutes)
app.use('/api/provider-portal', providerPortalRoutes)
app.use('/api/clubs', clubsRoutes)
// "Today your child has …" timetable helper, sourced from Wasil Hub.
app.use('/api/timetable', timetableRoutes)
// Admin-triggered Wasil Hub MIS sync (POST /api/admin/hub-sync)
app.use('/api/admin', hubSyncRoutes)

// Liveness probe — the process is up. Cheap and always returns 200.
// Use this to decide "should we restart the container?".
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Readiness probe — the process can actually serve traffic.
// Verifies the DB connection so a load balancer stops routing to an instance
// whose Postgres has gone away. Returns 503 on failure.
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ready', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Readiness check failed:', error)
    res.status(503).json({ status: 'not_ready', error: 'database unreachable' })
  }
})

// Error handling middleware. Logs through the per-request pino child (so the
// reqId/schoolId/userId context is preserved), then funnels through the error
// reporter so a future Sentry hook captures it too.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const reqAny = req as express.Request & { log?: typeof logger }
  ;(reqAny.log ?? logger).error({ err, route: req.path }, 'unhandled error')
  captureException(err, {
    route: req.path,
    schoolId: req.user?.schoolId,
    userId: req.user?.id,
  })
  res.status(500).json({ error: 'Internal server error' })
})

// Don't lose async errors that escape the express stack
process.on('unhandledRejection', reason => {
  logger.error({ err: reason }, 'unhandled promise rejection')
  captureException(reason, { source: 'unhandledRejection' })
})
process.on('uncaughtException', err => {
  logger.error({ err }, 'uncaught exception')
  captureException(err, { source: 'uncaughtException' })
})

// Wraps a periodic job so neither a sync throw nor a rejected promise can take
// the process down or silently disappear. Every failure is structured-logged
// AND funneled through the error reporter (so Sentry, once wired, sees it).
function runJob(job: string, fn: () => unknown | Promise<unknown>): () => void {
  return () => {
    try {
      const result = fn()
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        ;(result as Promise<unknown>).catch(err => {
          logger.error({ err, job }, 'scheduled job failed')
          captureException(err, { job })
        })
      }
    } catch (err) {
      logger.error({ err, job }, 'scheduled job threw synchronously')
      captureException(err, { job })
    }
  }
}

// Bucket the current UTC time into a string key for idempotency.
// 'hour' buckets give "YYYY-MM-DD-HH" (e.g. 2026-06-29-14); 'day' gives
// "YYYY-MM-DD". A job using the same bucket as periodKey runs at most once
// per bucket per (jobKey).
function bucketKey(bucket: 'hour' | 'day'): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  if (bucket === 'day') return date
  const hour = String(now.getUTCHours()).padStart(2, '0')
  return `${date}-${hour}`
}

// Wrap a job in withJobLock so cross-process replicas don't double-run it,
// AND a job that has already completed for the current bucket is skipped.
// Pass-through for jobs that legitimately want to run on every tick (like
// the outbox drain).
function locked(
  jobKey: string,
  bucket: 'hour' | 'day',
  fn: () => Promise<void> | void,
): () => Promise<void> {
  return async () => {
    await withJobLock(jobKey, bucketKey(bucket), async () => {
      await fn()
    })
  }
}

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server running')

  const ONE_HOUR = 60 * 60 * 1000
  const SIX_HOURS = 6 * ONE_HOUR
  const ONE_DAY = 24 * ONE_HOUR

  // All scheduled work goes through runJob() (catches errors) and locked()
  // (mutual exclusion + per-bucket idempotency). The outbox drain
  // legitimately wants to run on every tick — no idempotency wrapper.
  const tokenCleanup = runJob(
    'cleanupExpiredTokens',
    locked('cleanupExpiredTokens', 'day', cleanupExpiredTokens),
  )
  const consultationReminders = runJob(
    'sendConsultationReminders',
    locked('sendConsultationReminders', 'hour', sendConsultationReminders),
  )
  const auditCleanup = runJob(
    'cleanupOldAuditLogs',
    locked('cleanupOldAuditLogs', 'day', cleanupOldAuditLogs),
  )
  const scheduleReminders = runJob(
    'sendScheduleReminders',
    locked('sendScheduleReminders', 'hour', sendScheduleReminders),
  )
  const attendanceDigests = runJob(
    'sendDueAttendanceDigests',
    locked('sendDueAttendanceDigests', 'hour', sendDueAttendanceDigests),
  )
  const eventReminders = runJob(
    'sendEventRsvpReminders',
    locked('sendEventRsvpReminders', 'hour', sendEventRsvpReminders),
  )
  const outboxDrain = runJob('drainOutbox', drainOutbox)

  tokenCleanup()
  setInterval(tokenCleanup, SIX_HOURS)

  consultationReminders()
  setInterval(consultationReminders, ONE_HOUR)

  auditCleanup()
  setInterval(auditCleanup, ONE_DAY)

  scheduleReminders()
  setInterval(scheduleReminders, ONE_HOUR)

  attendanceDigests()
  setInterval(attendanceDigests, ONE_HOUR)

  eventReminders()
  setInterval(eventReminders, ONE_HOUR)

  // Drain the outbox aggressively so push/email feel near-realtime
  const THIRTY_SECONDS = 30 * 1000
  outboxDrain()
  setInterval(outboxDrain, THIRTY_SECONDS)
})
