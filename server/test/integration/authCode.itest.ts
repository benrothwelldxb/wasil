import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

// End-to-end passwordless sign-in against a REAL Postgres. The database is not
// mocked — these tests prove the atomic attempt-lock and single-use consume
// hold under genuine concurrency (Tasks 6 & 7). Only the outbound EMAIL is
// stubbed, and solely to capture the plaintext code the server generates (it is
// never persisted — only its hash is — so the test cannot read it any other way).

const emailedCodes: Record<string, string> = {}
vi.mock('../../src/services/email', () => ({
  sendLoginCodeEmail: vi.fn(async ({ to, code }: { to: string; code: string }) => {
    emailedCodes[to.toLowerCase()] = code
    return true
  }),
  sendMagicLinkEmail: vi.fn(async () => true),
  sendInvitationEmail: vi.fn(async () => true),
  sendParentWelcomeEmail: vi.fn(async () => true),
}))

const prisma = (await import('../../src/services/prisma')).default
const { default: authRoutes } = await import('../../src/routes/auth')
const { cleanupExpiredTokens } = await import('../../src/services/cleanup')

const TAG = 'itest-authcode'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', authRoutes)
  return app
}

let schoolId = ''
let emailSeq = 0
const freshEmail = () => `${TAG}-${Date.now()}-${emailSeq++}@example.com`

async function makeParent(email: string) {
  await prisma.user.create({
    data: { email: email.toLowerCase(), name: 'Test Parent', role: 'PARENT', schoolId },
  })
}

/** Request a code and return the plaintext the server generated. */
async function requestCode(app: express.Express, email: string): Promise<string> {
  const res = await request(app).post('/auth/code/request').send({ email })
  expect(res.status).toBe(200)
  const code = emailedCodes[email.toLowerCase()]
  expect(code).toMatch(/^\d{6}$/)
  return code
}

beforeAll(async () => {
  const school = await prisma.school.create({
    data: { name: `${TAG}-school`, shortName: `${TAG}`.slice(0, 10), city: 'Dubai' },
  })
  schoolId = school.id
})

afterAll(async () => {
  await prisma.authEvent.deleteMany({ where: { email: { startsWith: TAG } } })
  await prisma.loginCode.deleteMany({ where: { email: { startsWith: TAG } } })
  await prisma.refreshToken.deleteMany({ where: { user: { email: { startsWith: TAG } } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } })
  await prisma.school.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  // Reset rate-limit windows so limiter state never leaks between tests.
  await prisma.rateLimit.deleteMany({})
})

describe('passwordless sign-in — happy path (real PG)', () => {
  it('request → verify issues a session and burns the code', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)

    const code = await requestCode(app, email)
    const res = await request(app).post('/auth/code/verify').send({ email, code })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.refreshToken).toBeTruthy()
    expect(res.body.user.email).toBe(email.toLowerCase())

    // Code is now consumed.
    const row = await prisma.loginCode.findFirst({ where: { email: email.toLowerCase() } })
    expect(row?.consumedAt).not.toBeNull()

    // Exactly one refresh token (one session) was created.
    const tokens = await prisma.refreshToken.count({ where: { user: { email: email.toLowerCase() } } })
    expect(tokens).toBe(1)
  })

  it('is enumeration-safe: unknown email still returns 200 and mints nothing', async () => {
    const app = makeApp()
    const email = freshEmail() // never created
    const res = await request(app).post('/auth/code/request').send({ email })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    const count = await prisma.loginCode.count({ where: { email: email.toLowerCase() } })
    expect(count).toBe(0)
  })
})

describe('single-use + supersede (real PG)', () => {
  it('rejects a reused (already-consumed) code', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)
    const code = await requestCode(app, email)

    const first = await request(app).post('/auth/code/verify').send({ email, code })
    expect(first.status).toBe(200)

    const second = await request(app).post('/auth/code/verify').send({ email, code })
    expect(second.status).toBe(400)
    expect(second.body.error).toBe('invalid_or_expired_code')
  })

  it('supersedes an older code when a new one is requested', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)

    const oldCode = await requestCode(app, email)
    const newCode = await requestCode(app, email)
    expect(newCode).not.toBe(oldCode) // practically always true

    // Old code no longer works — its row was superseded (deleted), so it's now
    // just a wrong guess against the current code (401), never a valid session.
    const oldTry = await request(app).post('/auth/code/verify').send({ email, code: oldCode })
    expect(oldTry.status).toBe(401)
    expect(oldTry.body.accessToken).toBeUndefined()

    // …only the newest does.
    const newTry = await request(app).post('/auth/code/verify').send({ email, code: newCode })
    expect(newTry.status).toBe(200)
  })

  it('rejects an expired code', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)
    await requestCode(app, email)

    // Force-expire the live code.
    await prisma.loginCode.updateMany({
      where: { email: email.toLowerCase() },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const code = emailedCodes[email.toLowerCase()]!
    const res = await request(app).post('/auth/code/verify').send({ email, code })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_or_expired_code')
  })
})

describe('attempt lock (real PG)', () => {
  it('locks the code after 5 wrong attempts and refuses the correct code afterwards', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)
    const code = await requestCode(app, email)

    for (let i = 0; i < 5; i++) {
      const wrong = await request(app).post('/auth/code/verify').send({ email, code: '000000' })
      expect(wrong.status).toBe(401)
    }

    const row = await prisma.loginCode.findFirst({ where: { email: email.toLowerCase() } })
    expect(row?.attempts).toBe(5)
    expect(row?.consumedAt).not.toBeNull() // killed at the ceiling

    // Even the correct code cannot revive a locked code.
    const correct = await request(app).post('/auth/code/verify').send({ email, code })
    expect([400, 429]).toContain(correct.status)
    expect(correct.body.accessToken).toBeUndefined()
  })
})

describe('CONCURRENCY — single success (real PG)', () => {
  it('only one of many simultaneous correct verifications succeeds; no duplicate sessions', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)
    const code = await requestCode(app, email)

    // 5 truly-concurrent correct submissions (fits the 5-slot attempt budget).
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/auth/code/verify').send({ email, code })),
    )
    const successes = results.filter(r => r.status === 200)
    expect(successes).toHaveLength(1)

    // Exactly one session (refresh token) was ever created.
    const tokens = await prisma.refreshToken.count({ where: { user: { email: email.toLowerCase() } } })
    expect(tokens).toBe(1)

    // The code is consumed exactly once.
    const row = await prisma.loginCode.findFirst({ where: { email: email.toLowerCase() } })
    expect(row?.consumedAt).not.toBeNull()
  })
})

describe('CONCURRENCY — attempt count cannot be bypassed (real PG)', () => {
  it('20 simultaneous wrong guesses never push attempts past the ceiling', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)
    await requestCode(app, email)

    // Fire 20 concurrent WRONG guesses. Even with the race, the atomic
    // slot-claim guarantees attempts is capped at exactly MAX (5) — never more.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request(app).post('/auth/code/verify').send({ email, code: '999999' })),
    )
    // Not a single one succeeded.
    expect(results.some(r => r.status === 200)).toBe(false)

    const row = await prisma.loginCode.findFirst({ where: { email: email.toLowerCase() } })
    expect(row?.attempts).toBeLessThanOrEqual(5)
    expect(row?.attempts).toBe(5) // exactly the ceiling, no overshoot
    expect(row?.consumedAt).not.toBeNull()
  })
})

describe('audit trail (real PG)', () => {
  it('records the sign-in lifecycle without ever storing the code', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)
    const code = await requestCode(app, email)
    await request(app).post('/auth/code/verify').send({ email, code: '111111' }) // one failure
    await request(app).post('/auth/code/verify').send({ email, code }) // success

    const events = await prisma.authEvent.findMany({
      where: { email: email.toLowerCase() },
      orderBy: { createdAt: 'asc' },
    })
    const names = events.map(e => e.event)
    expect(names).toContain('login_requested')
    expect(names).toContain('code_issued')
    expect(names).toContain('verify_failed')
    expect(names).toContain('verify_succeeded')
    expect(names).toContain('session_created')

    // The plaintext code must never appear anywhere in the audit payloads.
    const blob = JSON.stringify(events)
    expect(blob).not.toContain(code)
  })
})

describe('lifecycle cleanup (real PG)', () => {
  it('purges expired and consumed codes but never an active one', async () => {
    const base = `${TAG}-cleanup-${Date.now()}`
    const activeEmail = `${base}-active@example.com`
    const expiredEmail = `${base}-expired@example.com`
    const consumedEmail = `${base}-consumed@example.com`

    await prisma.loginCode.create({
      data: { email: activeEmail, codeHash: 'h1', expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    })
    await prisma.loginCode.create({
      data: { email: expiredEmail, codeHash: 'h2', expiresAt: new Date(Date.now() - 60 * 1000) },
    })
    await prisma.loginCode.create({
      data: { email: consumedEmail, codeHash: 'h3', expiresAt: new Date(Date.now() + 5 * 60 * 1000), consumedAt: new Date() },
    })

    await cleanupExpiredTokens()

    // Active survives; expired + consumed are swept.
    expect(await prisma.loginCode.count({ where: { email: activeEmail } })).toBe(1)
    expect(await prisma.loginCode.count({ where: { email: expiredEmail } })).toBe(0)
    expect(await prisma.loginCode.count({ where: { email: consumedEmail } })).toBe(0)
  })
})

describe('rate limiting is DB-backed (real PG)', () => {
  it('per-email verify limiter trips and is recorded in the shared RateLimit table', async () => {
    const app = makeApp()
    const email = freshEmail()
    await makeParent(email)
    await requestCode(app, email)

    // Per-email verify max is 10 / 10 min. Fire 12 sequential wrong guesses;
    // the limiter must trip before the 12th (independent of the 5-attempt lock,
    // which returns 429 too, so we assert the shared counter exists).
    for (let i = 0; i < 12; i++) {
      await request(app).post('/auth/code/verify').send({ email, code: '000000' })
    }
    const counters = await prisma.rateLimit.findMany({ where: { key: { startsWith: 'code_vrf_email:' } } })
    expect(counters.length).toBeGreaterThan(0)
    expect(counters[0]!.count).toBeGreaterThanOrEqual(10)
  })
})
