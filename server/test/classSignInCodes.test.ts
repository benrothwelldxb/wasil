import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Printing a class's sign-in codes for a mass sign-up event. These are the app's
// OWN 6-digit codes, minted early and printed rather than emailed — so the rules
// that matter are who gets a slip, that a printed code can't outlive the event
// by much, and that revoking only ever touches this school.

const prismaMock = {
  class: { findFirst: vi.fn() },
  student: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  loginCode: { deleteMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const authMock = { createLoginCode: vi.fn() }
vi.mock('../src/routes/auth', () => authMock)

const ADMIN = { id: 'admin-1', role: 'ADMIN', schoolId: 'sch-1', name: 'Head' }
vi.mock('../src/middleware/auth', () => {
  const pass = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = ADMIN
    next()
  }
  return { isAuthenticated: pass, isAdmin: pass, isStaff: pass, loadUserWithRelations: vi.fn(async () => ADMIN) }
})

const { default: routes } = await import('../src/routes/parentInvitations')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/parent-invitations', routes)
  return app
}

const guardian = (id: string, name: string, email: string, extra: Record<string, unknown> = {}) => ({
  user: { id, name, email, isTest: false, lastLoginAt: null, ...extra },
})
const pupil = (id: string, first: string, last: string, guardians: ReturnType<typeof guardian>[] = [], className = '1A') => ({
  id, firstName: first, lastName: last, class: { name: className }, parentLinks: guardians,
})

const mint = (body: Record<string, unknown> = { classId: 'cls-1', expiresInHours: 120 }) =>
  request(makeApp()).post('/api/parent-invitations/sign-in-codes/by-class').send(body)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.class.findFirst.mockResolvedValue({ id: 'cls-1', name: '1A' })
  let n = 0
  authMock.createLoginCode.mockImplementation(async () => ({
    code: String(100000 + ++n),
    expiresAt: new Date('2026-09-01T10:00:00.000Z'),
  }))
})

describe('POST /sign-in-codes/by-class', () => {
  it('mints the app’s own 6-digit code per guardian, listing their children', async () => {
    const mum = guardian('u-mum', 'Mrs Koy', 'mum@example.com')
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [mum]),
      pupil('s2', 'Ben', 'Koy', [mum]),
    ])

    const res = await mint()

    expect(res.status).toBe(200)
    // One slip, both children on it — not one code per child.
    expect(res.body.codes).toHaveLength(1)
    expect(res.body.codes[0]).toMatchObject({
      parentName: 'Mrs Koy',
      email: 'mum@example.com',
      children: [
        { name: 'Ada Koy', className: '1A' },
        { name: 'Ben Koy', className: '1A' },
      ],
    })
    expect(res.body.codes[0].code).toMatch(/^\d{6}$/)
  })

  it('gives each guardian of a child their own slip — a code is keyed to an email', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [
        guardian('u-mum', 'Mrs Koy', 'mum@example.com'),
        guardian('u-dad', 'Mr Koy', 'dad@example.com'),
      ]),
    ])
    const res = await mint()
    expect(res.body.codes.map((c: { email: string }) => c.email)).toEqual(['mum@example.com', 'dad@example.com'])
  })

  it('passes the expiry through as minutes', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [guardian('u-mum', 'Mrs Koy', 'mum@example.com')]),
    ])
    await mint({ classId: 'cls-1', expiresInHours: 120 })
    expect(authMock.createLoginCode).toHaveBeenCalledWith('mum@example.com', 120 * 60)
  })

  it('refuses an expiry that would leave a printed code lying around', async () => {
    for (const expiresInHours of [0, -1, 169, 'forever', undefined]) {
      expect((await mint({ classId: 'cls-1', expiresInHours })).status).toBe(400)
    }
    expect(authMock.createLoginCode).not.toHaveBeenCalled()
  })

  it('reports pupils whose guardian has no account — nothing to sign in to', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy'),
      pupil('s2', 'Sara', 'Khan', [guardian('u-dad', 'Mr Khan', 'dad@example.com')]),
    ])
    const res = await mint()
    expect(res.body.pupilsWithoutAccount).toEqual([{ name: 'Ada Koy', className: '1A' }])
    expect(res.body.codes).toHaveLength(1)
  })

  it('never prints a slip for a Test Parent', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [guardian('u-test', 'Test Parent', 'test.1a@x.com', { isTest: true })]),
    ])
    const res = await mint()
    expect(res.body.codes).toEqual([])
    // No account we'd print for, so the pupil is flagged instead.
    expect(res.body.pupilsWithoutAccount).toEqual([{ name: 'Ada Koy', className: '1A' }])
  })

  it('flags a parent who has signed in before', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [guardian('u-mum', 'Mrs Koy', 'mum@example.com', { lastLoginAt: new Date() })]),
    ])
    expect((await mint()).body.codes[0].hasLoggedIn).toBe(true)
  })

  it('leaves Test Students off the sheet, and 404s another school’s class', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    await mint()
    expect(prismaMock.student.findMany.mock.calls[0][0].where).toMatchObject({
      classId: 'cls-1', schoolId: 'sch-1', isTest: false,
    })

    prismaMock.class.findFirst.mockResolvedValue(null)
    expect((await mint()).status).toBe(404)
  })
})

describe('POST /sign-in-codes/revoke', () => {
  const revoke = (body: Record<string, unknown>) =>
    request(makeApp()).post('/api/parent-invitations/sign-in-codes/revoke').send(body)

  it('clears codes only for this school’s parents', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ email: 'mum@example.com' }])
    prismaMock.loginCode.deleteMany.mockResolvedValue({ count: 1 })

    const res = await revoke({ emails: ['MUM@example.com', 'stranger@elsewhere.com'] })

    expect(res.body).toEqual({ revoked: 1 })
    // Ownership is checked before anything is deleted.
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toMatchObject({
      schoolId: 'sch-1', role: 'PARENT',
    })
    expect(prismaMock.loginCode.deleteMany.mock.calls[0][0]).toEqual({
      where: { email: { in: ['mum@example.com'] } },
    })
  })

  it('deletes nothing when no address belongs to this school', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    const res = await revoke({ emails: ['stranger@elsewhere.com'] })
    expect(res.body).toEqual({ revoked: 0 })
    expect(prismaMock.loginCode.deleteMany).not.toHaveBeenCalled()
  })

  it('400s on an empty request rather than clearing everything', async () => {
    expect((await revoke({})).status).toBe(400)
    expect(prismaMock.loginCode.deleteMany).not.toHaveBeenCalled()
  })
})

// A school-wide sign-up event shouldn't mean running this sixteen times and
// collating the stacks by hand.
describe('POST /sign-in-codes/by-class — whole school', () => {
  it('covers every class when no classId is given, and never looks one up', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [guardian('u-mum', 'Mrs Koy', 'mum@example.com')], '1A'),
      pupil('s2', 'Sara', 'Khan', [guardian('u-dad', 'Mr Khan', 'dad@example.com')], '3C'),
    ])

    const res = await mint({ expiresInHours: 120 })

    expect(res.status).toBe(200)
    expect(res.body.wholeSchool).toBe(true)
    expect(res.body.className).toBeNull()
    expect(res.body.codes).toHaveLength(2)
    expect(prismaMock.class.findFirst).not.toHaveBeenCalled()
    // Whole school, still school-scoped and still no Test Students.
    expect(prismaMock.student.findMany.mock.calls[0][0].where).toEqual({
      schoolId: 'sch-1', isTest: false,
    })
  })

  it("treats classId 'all' the same way", async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    const res = await mint({ classId: 'all', expiresInHours: 24 })
    expect(res.body.wholeSchool).toBe(true)
    expect(prismaMock.class.findFirst).not.toHaveBeenCalled()
  })

  it('gives a parent with children in two classes ONE slip naming both', async () => {
    const mum = guardian('u-mum', 'Mrs Koy', 'mum@example.com')
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [mum], '1A'),
      pupil('s2', 'Ben', 'Koy', [mum], '4B'),
    ])

    const res = await mint({ expiresInHours: 120 })

    expect(res.body.codes).toHaveLength(1)
    expect(res.body.codes[0].children).toEqual([
      { name: 'Ada Koy', className: '1A' },
      { name: 'Ben Koy', className: '4B' },
    ])
  })

  it('orders by class so the printed stack can be split up', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    await mint({ expiresInHours: 24 })
    expect(prismaMock.student.findMany.mock.calls[0][0].orderBy).toEqual([
      { class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' },
    ])
  })
})

// The after-the-event tidy-up. Blunt by design, but it must never reach beyond
// this school.
describe('POST /sign-in-codes/revoke-all', () => {
  const revokeAll = () => request(makeApp()).post('/api/parent-invitations/sign-in-codes/revoke-all').send({})

  it("clears every outstanding code for this school's parents", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ email: 'Mum@example.com' }, { email: 'dad@example.com' }])
    prismaMock.loginCode.deleteMany.mockResolvedValue({ count: 2 })

    const res = await revokeAll()

    expect(res.body).toEqual({ revoked: 2 })
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({ schoolId: 'sch-1', role: 'PARENT' })
    // Addresses are normalised, and it's an explicit list — never a blanket delete.
    expect(prismaMock.loginCode.deleteMany.mock.calls[0][0]).toEqual({
      where: { email: { in: ['mum@example.com', 'dad@example.com'] } },
    })
  })

  it('deletes nothing when the school has no parents', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    expect((await revokeAll()).body).toEqual({ revoked: 0 })
    expect(prismaMock.loginCode.deleteMany).not.toHaveBeenCalled()
  })
})
