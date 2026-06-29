import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import passport from 'passport'
import dotenv from 'dotenv'
import { pinoHttp } from 'pino-http'
import logger from './services/logger.js'
import { captureException } from './services/errorReporter.js'

import { configurePassport } from './middleware/passport.js'
import authRoutes from './routes/auth.js'
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
import prisma from './services/prisma.js'
import { initFirebase } from './services/firebase.js'
import { cleanupExpiredTokens, sendConsultationReminders, sendScheduleReminders } from './services/cleanup.js'
import { cleanupOldAuditLogs } from './services/audit.js'
import { sendDueAttendanceDigests } from './services/attendanceDigest.js'
import { drainOutbox } from './services/outbox.js'

dotenv.config()

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

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server running')

  const ONE_HOUR = 60 * 60 * 1000
  const SIX_HOURS = 6 * ONE_HOUR
  const ONE_DAY = 24 * ONE_HOUR

  const tokenCleanup = runJob('cleanupExpiredTokens', cleanupExpiredTokens)
  const consultationReminders = runJob('sendConsultationReminders', sendConsultationReminders)
  const auditCleanup = runJob('cleanupOldAuditLogs', cleanupOldAuditLogs)
  const scheduleReminders = runJob('sendScheduleReminders', sendScheduleReminders)
  const attendanceDigests = runJob('sendDueAttendanceDigests', sendDueAttendanceDigests)
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

  // Drain the outbox aggressively so push/email feel near-realtime
  const THIRTY_SECONDS = 30 * 1000
  outboxDrain()
  setInterval(outboxDrain, THIRTY_SECONDS)
})
