import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Root logger. Line-delimited JSON in production (cheap to parse for any log
 * aggregator), pretty-printed for local dev.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  // Don't ever log secrets even if a careless caller passes them in
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
      '*.accessToken',
      '*.twoFactorSecret',
      '*.googleCalendarRefreshToken',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout in dev too, but readable
        },
      }),
})

export default logger
