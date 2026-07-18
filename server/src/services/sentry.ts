import * as Sentry from '@sentry/node'
import logger from './logger.js'
import { setErrorReporter } from './errorReporter.js'

/**
 * Wire external error reporting (O3). This is a no-op unless SENTRY_DSN is set,
 * so local dev, CI, and tests stay quiet and dependency-free at runtime. When a
 * DSN is present, every captureException() in the app — the Express error
 * middleware, the process-level rejection/exception handlers, cron callbacks,
 * and outbox give-ups — is forwarded to Sentry with the structured context we
 * already attach (schoolId, userId, route, job).
 *
 * Call once at startup, after dotenv has loaded the environment.
 */
export function initErrorReporting(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logger.info('SENTRY_DSN not set — errors go to structured logs only')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Error reporting only; we're not using Sentry for performance tracing.
    tracesSampleRate: 0,
  })

  setErrorReporter((err, context) => {
    Sentry.withScope(scope => {
      if (context) {
        const { schoolId, userId, route, job, source, ...rest } = context
        if (schoolId) scope.setTag('schoolId', String(schoolId))
        if (userId) scope.setUser({ id: String(userId) })
        if (route) scope.setTag('route', String(route))
        if (job) scope.setTag('job', String(job))
        if (source) scope.setTag('source', String(source))
        if (Object.keys(rest).length > 0) scope.setExtras(rest)
      }
      Sentry.captureException(err)
    })
    // Keep the structured log too, so stdout-based tooling still sees it.
    logger.error({ err, ...context }, 'captured exception')
  })

  logger.info({ environment: process.env.NODE_ENV || 'development' }, 'Sentry error reporting enabled')
}
