import * as Sentry from '@sentry/node'
import { setErrorReporter } from './errorReporter.js'
import logger from './logger.js'

/**
 * Initialise Sentry if SENTRY_DSN is set. Safe to call unconditionally — when
 * no DSN is configured, this is a no-op and the default pino-only error
 * reporter stays in place.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logger.info('Sentry disabled (no SENTRY_DSN set)')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // Don't auto-attach long stack traces from breadcrumbs to every event —
    // we explicitly call captureException with context where it matters.
    tracesSampleRate: 0,
  })

  setErrorReporter((err, context) => {
    Sentry.withScope(scope => {
      if (context?.schoolId) scope.setTag('schoolId', context.schoolId)
      if (context?.userId) scope.setUser({ id: context.userId })
      if (context?.route) scope.setTag('route', context.route)
      if (context?.job) scope.setTag('job', context.job)
      if (context) scope.setContext('extra', context)
      Sentry.captureException(err)
    })
  })

  logger.info('Sentry error reporting enabled')
}
