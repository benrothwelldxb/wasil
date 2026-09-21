import { PrismaClient } from '@prisma/client'

/**
 * How many database connections the API may hold.
 *
 * Prisma's default is `CPUs × 2 + 1`, which on a small container is three to
 * five for the whole API. A single consultation booking is six to eight
 * queries, so a parents' evening opening at 19:00 — three hundred families
 * arriving inside a minute — queues on that pool and, after `pool_timeout`,
 * throws. The parent sees "Failed to book slot" for a slot that is still free.
 *
 * Fifteen is chosen to be comfortably above that and comfortably below
 * Postgres's own ceiling, which Railway sets around a hundred. It is per API
 * instance, so it is worth revisiting if this ever runs more than a couple of
 * replicas.
 *
 * Set in code rather than on DATABASE_URL because that variable is a Railway
 * reference to the Postgres service — editing it by hand would break the link
 * that keeps it current when the password rotates.
 */
const CONNECTION_LIMIT = 15

/**
 * Append the pool size to a connection string.
 *
 * Exported for its tests: the logic is small but the failure is silent. A
 * malformed URL does not error, it just falls back to the default pool, and
 * nobody notices until an evening that should have worked does not.
 */
export function withConnectionLimit(url: string | undefined, limit = CONNECTION_LIMIT): string | undefined {
  if (!url) return url
  // An explicit setting wins. Someone who has tuned this deliberately — or is
  // using a pooler like PgBouncer that manages it — should not be overridden.
  if (url.includes('connection_limit=')) return url
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${limit}`
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: { db: { url: withConnectionLimit(process.env.DATABASE_URL) } },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
