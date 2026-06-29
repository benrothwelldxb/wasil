import logger from './logger.js'

/**
 * Centralised error capture. Right now this just logs through pino at error
 * level — but every caller goes through this single funnel, so swapping in
 * Sentry (or Datadog, etc.) later is a one-file change. The wire-up point
 * is `init()` below.
 *
 * Usage in code paths that catch errors at the top level (express error
 * middleware, cron callbacks): `captureException(err, { route, schoolId })`.
 */

interface ExceptionContext {
  route?: string
  schoolId?: string
  userId?: string
  job?: string
  [key: string]: unknown
}

type CaptureFn = (err: unknown, context?: ExceptionContext) => void

let captureFn: CaptureFn = (err, context) => {
  logger.error({ err, ...context }, 'captured exception')
}

/**
 * Replace the default capture implementation. Call this once at startup.
 * Right now nothing does — every captured exception flows through pino only.
 * When you're ready to add Sentry / Datadog / Honeybadger / etc, install the
 * SDK and call setErrorReporter() with an adapter that wraps its capture API.
 */
export function setErrorReporter(fn: CaptureFn): void {
  captureFn = fn
}

export function captureException(err: unknown, context?: ExceptionContext): void {
  try {
    captureFn(err, context)
  } catch (e) {
    // Never let the error reporter itself crash a caller
    logger.error({ err: e }, 'error reporter itself threw')
  }
}
