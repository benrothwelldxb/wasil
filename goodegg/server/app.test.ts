// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import type { Db } from './db'
import { runMigrations } from './db'
import { createApp } from './app'
import * as repo from './repo'

function pgliteDb(): Db {
  const pg = new PGlite()
  const wrap = (r: { rows: unknown[] }) => ({ rows: r.rows as Record<string, unknown>[] })
  return {
    query: async (t, p) => wrap(await pg.query(t, (p ?? []) as unknown[])),
    exec: async (s) => {
      await pg.exec(s)
    },
    tx: (fn) =>
      pg.transaction(async (tx) =>
        fn({ query: async (t, p) => wrap(await tx.query(t, (p ?? []) as unknown[])) }),
      ) as Promise<never>,
    close: () => pg.close(),
  }
}

let db: Db
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  db = pgliteDb()
  await runMigrations(db)
  app = createApp(db)
})
beforeEach(async () => {
  await db.exec('truncate profiles, login_codes, groups, group_members cascade')
})

function extractCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? ''
  return raw.split(';')[0] ?? ''
}

describe('HTTP app', () => {
  it('returns null profile when unauthenticated', async () => {
    const res = await app.request('/api/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ profile: null })
  })

  it('gates protected routes with 401', async () => {
    const res = await app.request('/api/memberships')
    expect(res.status).toBe(401)
  })

  it('completes the code sign-in round trip and sets a working session cookie', async () => {
    // request (via HTTP) + fetch the code out of band for the test
    await app.request('/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'sam@x.example', displayName: 'Sam' }),
    })
    const code = await repo.requestOtp(db, 'sam@x.example', 'Sam')

    const verify = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'sam@x.example', code }),
    })
    expect(verify.status).toBe(200)
    const cookie = extractCookie(verify)
    expect(cookie).toContain('goodegg_session=')

    const me = await app.request('/api/me', { headers: { cookie } })
    const body = (await me.json()) as { profile: { display_name: string } | null }
    expect(body.profile?.display_name).toBe('Sam')

    // Authenticated request now succeeds
    const memberships = await app.request('/api/memberships', { headers: { cookie } })
    expect(memberships.status).toBe(200)
  })

  it('rejects a bad code', async () => {
    await repo.requestOtp(db, 'nope@x.example', 'Nope')
    const res = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nope@x.example', code: '000000' }),
    })
    expect(res.status).toBe(400)
  })
})
