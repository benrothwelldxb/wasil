import type { Store, Options, ClientRateLimitInfo } from 'express-rate-limit'
import prisma from './prisma.js'

/**
 * A Postgres-backed express-rate-limit Store.
 *
 * WHY NOT THE DEFAULT (in-memory) STORE:
 * `express-rate-limit`'s MemoryStore keeps counters in the process heap, so
 * with N app instances behind a load balancer each instance counts
 * independently — the effective limit becomes N× the configured value, and a
 * rolling deploy resets every counter. For an auth brute-force control that is
 * a correctness bug. This store keeps the counters in the database every
 * instance already shares, so the limit holds across processes and servers and
 * survives restarts. `localKeys = false` tells the library the counters are
 * shared (disables its double-count heuristic warning).
 *
 * WHY POSTGRES AND NOT REDIS:
 * The app has no Redis today; adding one is new infrastructure to provision,
 * secure and operate. Auth request volume is modest (a parent signs in rarely),
 * so one extra indexed upsert per auth request is negligible, and it reuses the
 * transactional store we already run. If auth RPS ever grows enough to matter,
 * swapping in `rate-limit-redis` is a drop-in change behind this same Store
 * contract. See AUTHENTICATION.md → "Future scaling strategy".
 *
 * ATOMICITY:
 * Each `increment` is a single `INSERT … ON CONFLICT DO UPDATE` statement.
 * Postgres takes a row lock on the conflicting row for the duration of the
 * UPDATE, so concurrent increments serialise and the count is exact — never a
 * lost update. The window is fixed: the first hit sets `expiresAt = now +
 * windowMs`; subsequent hits in the window bump `count`; once the row is past
 * `expiresAt` the next hit resets it to 1 and opens a new window.
 */
export class PrismaRateLimitStore implements Store {
  /** Counters live in a shared DB, not this process. */
  localKeys = false
  prefix: string
  private windowMs = 60_000

  constructor(prefix: string) {
    // Namespaces this limiter's keys so different limiters (per-email vs
    // per-IP, request vs verify) never collide on the same subject string.
    this.prefix = `${prefix}:`
  }

  init(options: Options): void {
    this.windowMs = options.windowMs
  }

  private k(key: string): string {
    return this.prefix + key
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const fullKey = this.k(key)
    const expires = new Date(Date.now() + this.windowMs)

    // Row-locked, race-safe fixed-window upsert. On an existing but expired
    // row the CASE resets both count and window; otherwise it increments.
    const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${fullKey}, 1, ${expires})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."expiresAt" <= now()
                       THEN 1 ELSE "RateLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= now()
                           THEN ${expires} ELSE "RateLimit"."expiresAt" END
      RETURNING "count", "expiresAt"
    `

    const row = rows[0]!
    return { totalHits: Number(row.count), resetTime: row.expiresAt }
  }

  async decrement(key: string): Promise<void> {
    // Used when a request is later "skipped" (skipSuccessfulRequests etc.).
    // Never drops below zero, and only within the live window.
    await prisma.$executeRaw`
      UPDATE "RateLimit"
      SET "count" = GREATEST(0, "count" - 1)
      WHERE "key" = ${this.k(key)} AND "expiresAt" > now()
    `
  }

  async resetKey(key: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${this.k(key)}`
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
      SELECT "count", "expiresAt" FROM "RateLimit"
      WHERE "key" = ${this.k(key)} AND "expiresAt" > now()
    `
    const row = rows[0]
    return row ? { totalHits: Number(row.count), resetTime: row.expiresAt } : undefined
  }
}

/** Factory: one namespaced store per limiter. */
export function prismaRateLimitStore(prefix: string): PrismaRateLimitStore {
  return new PrismaRateLimitStore(prefix)
}
