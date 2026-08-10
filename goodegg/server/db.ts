import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

/**
 * Minimal database interface. Both node-postgres (production) and PGlite (tests)
 * satisfy `query(text, params) -> { rows }`, so the repository code is identical
 * in both environments.
 */
export type SqlRow = Record<string, unknown>

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: SqlRow[] }>
}

export interface Db extends Queryable {
  /** Run a multi-statement SQL script (used for migrations). */
  exec(sql: string): Promise<void>
  /** Run `fn` inside a transaction; rolls back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** Production database backed by a node-postgres pool. */
export function createPgDb(connectionString: string): Db {
  const useSsl = process.env.DATABASE_SSL === 'true'
  const pool = new pg.Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  })
  return {
    query: (text, params) => pool.query(text, params as unknown[]),
    exec: async (sql) => {
      await pool.query(sql)
    },
    tx: async (fn) => {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const result = await fn({
          query: (text, params) => client.query(text, params as unknown[]),
        })
        await client.query('commit')
        return result
      } catch (err) {
        await client.query('rollback')
        throw err
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

/**
 * Zero-Postgres dev database backed by PGlite (an in-process Postgres). Enabled
 * with USE_PGLITE=true; optionally persisted to PGLITE_PATH. Never used in
 * production. PGlite is a devDependency, imported dynamically so it is never
 * bundled into a real deployment.
 */
export async function createPgliteDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = new PGlite(process.env.PGLITE_PATH)
  const wrap = (r: { rows: unknown[] }) => ({ rows: r.rows as SqlRow[] })
  return {
    query: async (text, params) => wrap(await pg.query(text, (params ?? []) as unknown[])),
    exec: async (sql) => {
      await pg.exec(sql)
    },
    tx: (fn) =>
      pg.transaction(async (tx) =>
        fn({ query: async (text, params) => wrap(await tx.query(text, (params ?? []) as unknown[])) }),
      ) as Promise<never>,
    close: () => pg.close(),
  }
}

/** Read the schema.sql that lives next to this file. */
export function readSchema(): string {
  return readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8')
}

/** Create every table if it doesn't already exist. Safe to run on every boot. */
export async function runMigrations(db: Db): Promise<void> {
  await db.exec(readSchema())
}
