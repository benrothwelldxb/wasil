import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

// Chaos / graceful-degradation checks against real Postgres. The point is not
// that failures never happen — it's that a failing DEPENDENCY degrades safely:
// the parent still gets a usable outcome and support can recover.

// Simulate the email provider being DOWN: every send rejects.
vi.mock('../../src/services/email', () => ({
  sendLoginCodeEmail: vi.fn(async () => { throw new Error('resend unavailable') }),
  sendParentWelcomeEmail: vi.fn(async () => { throw new Error('resend unavailable') }),
  sendMagicLinkEmail: vi.fn(async () => { throw new Error('resend unavailable') }),
  sendInvitationEmail: vi.fn(async () => { throw new Error('resend unavailable') }),
}))

const prisma = (await import('../../src/services/prisma')).default
const { default: authRoutes } = await import('../../src/routes/auth')

const TAG = 'itest-chaos'
function app() { const a = express(); a.use(express.json()); a.use('/auth', authRoutes); return a }

let schoolId = ''
beforeAll(async () => {
  const s = await prisma.school.create({ data: { name: `${TAG}-s`, shortName: `${TAG}`.slice(0, 10), city: 'Dubai' } })
  schoolId = s.id
  await prisma.user.create({ data: { email: `${TAG}-p@example.com`, name: 'P', role: 'PARENT', schoolId } })
})
afterAll(async () => {
  await prisma.rateLimit.deleteMany({})
  await prisma.loginCode.deleteMany({ where: { email: { startsWith: TAG } } })
  await prisma.authEvent.deleteMany({ where: { schoolId } })
  await prisma.user.deleteMany({ where: { schoolId } })
  await prisma.school.deleteMany({ where: { id: schoolId } })
  await prisma.$disconnect()
})

describe('email provider down — sign-in still degrades gracefully', () => {
  it('code request returns 200 and STILL mints a code (support can copy a login link)', async () => {
    const email = `${TAG}-p@example.com`
    const res = await request(app()).post('/auth/code/request').send({ email })
    // Enumeration-safe + resilient: the response does not fail because email failed.
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    // The code exists in the DB even though delivery failed — support has a path.
    const code = await prisma.loginCode.findFirst({ where: { email, consumedAt: null } })
    expect(code).toBeTruthy()
  })
})

describe('duplicate / superseded codes', () => {
  it('a second request supersedes the first — only one live code remains', async () => {
    const email = `${TAG}-p@example.com`
    await prisma.rateLimit.deleteMany({}) // reset limiter window
    await request(app()).post('/auth/code/request').send({ email })
    await request(app()).post('/auth/code/request').send({ email })
    const live = await prisma.loginCode.count({ where: { email, consumedAt: null, expiresAt: { gt: new Date() } } })
    expect(live).toBe(1)
  })
})

describe('expired code fails closed (not a 500)', () => {
  it('verifying an expired code returns a clean 400', async () => {
    const email = `${TAG}-p@example.com`
    await prisma.loginCode.updateMany({ where: { email }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await request(app()).post('/auth/code/verify').send({ email, code: '123456' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_or_expired_code')
  })
})
