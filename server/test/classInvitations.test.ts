import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Minting a class's worth of join codes for a sign-up event. Each code is a key
// to one family's children until it's used or expires, so the rules that matter
// are: who gets grouped together, that re-running doesn't invalidate printed
// slips, and that codes can't outlive the event by much.

const prismaMock = {
  class: { findFirst: vi.fn() },
  student: { findMany: vi.fn() },
  parentInvitation: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('./auth.js', () => ({ createLoginCode: vi.fn() }), { virtual: true } as never)

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

const parent = (id: string, name: string, registered = false) => ({
  userId: id,
  user: { id, name, email: `${id}@x.com`, passwordHash: registered ? 'hash' : null, lastLoginAt: null },
})
const pupil = (id: string, first: string, last: string, links: ReturnType<typeof parent>[] = []) => ({
  id, firstName: first, lastName: last, parentLinks: links,
})

const mint = (body: Record<string, unknown> = { classId: 'cls-1', expiresInHours: 24 }) =>
  request(makeApp()).post('/api/parent-invitations/by-class').send(body)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PARENT_APP_URL = 'https://app.example'
  prismaMock.class.findFirst.mockResolvedValue({ id: 'cls-1', name: '1A' })
  prismaMock.parentInvitation.findMany.mockResolvedValue([])
  prismaMock.parentInvitation.findUnique.mockResolvedValue(null)
  let n = 0
  prismaMock.parentInvitation.create.mockImplementation(async ({ data }: never) => ({
    id: `inv-${++n}`,
    accessCode: (data as { accessCode: string }).accessCode,
    expiresAt: (data as { expiresAt: Date }).expiresAt,
  }))
})

describe('POST /by-class — grouping', () => {
  it('gives siblings ONE code, not one each', async () => {
    const mum = parent('u-mum', 'Mrs Koy')
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [mum]),
      pupil('s2', 'Ben', 'Koy', [mum]),
    ])

    const res = await mint()

    expect(res.status).toBe(200)
    expect(res.body.families).toHaveLength(1)
    expect(res.body.families[0].studentNames).toEqual(['Ada Koy', 'Ben Koy'])
    // Both children linked to the single invitation.
    const created = prismaMock.parentInvitation.create.mock.calls[0][0].data
    expect(created.studentLinks.create).toEqual([{ studentId: 's1' }, { studentId: 's2' }])
  })

  it('keeps unrelated families apart', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [parent('u-mum', 'Mrs Koy')]),
      pupil('s2', 'Sara', 'Khan', [parent('u-dad', 'Mr Khan')]),
    ])
    const res = await mint()
    expect(res.body.families).toHaveLength(2)
  })

  it('gives a pupil with no linked guardian a code of their own', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy'),
      pupil('s2', 'Ben', 'Koy'),
    ])
    // Nothing to group them by — two codes, not a guessed family.
    expect((await mint()).body.families).toHaveLength(2)
  })

  it('flags families already on the app so nobody queues for a code they do not need', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      pupil('s1', 'Ada', 'Koy', [parent('u-mum', 'Mrs Koy', true)]),
      pupil('s2', 'Sara', 'Khan', [parent('u-dad', 'Mr Khan', false)]),
    ])
    const res = await mint()
    const byName = Object.fromEntries(res.body.families.map((f: { studentNames: string[]; alreadyRegistered: boolean }) => [f.studentNames[0], f.alreadyRegistered]))
    expect(byName['Ada Koy']).toBe(true)
    expect(byName['Sara Khan']).toBe(false)
  })
})

describe('POST /by-class — reuse and expiry', () => {
  it('reuses a live code for the same family, so printed slips stay valid', async () => {
    const mum = parent('u-mum', 'Mrs Koy')
    prismaMock.student.findMany.mockResolvedValue([pupil('s1', 'Ada', 'Koy', [mum]), pupil('s2', 'Ben', 'Koy', [mum])])
    prismaMock.parentInvitation.findMany.mockResolvedValue([
      { id: 'inv-old', accessCode: 'AAA-111-BBB', expiresAt: new Date('2030-01-01'), studentLinks: [{ studentId: 's2' }, { studentId: 's1' }] },
    ])

    const res = await mint()

    expect(res.body.families[0]).toMatchObject({ accessCode: 'AAA-111-BBB', reused: true })
    expect(prismaMock.parentInvitation.create).not.toHaveBeenCalled()
  })

  it('does not reuse a code covering a different set of children', async () => {
    prismaMock.student.findMany.mockResolvedValue([pupil('s1', 'Ada', 'Koy', [parent('u-mum', 'Mrs Koy')])])
    prismaMock.parentInvitation.findMany.mockResolvedValue([
      { id: 'inv-old', accessCode: 'AAA-111-BBB', expiresAt: new Date('2030-01-01'), studentLinks: [{ studentId: 's1' }, { studentId: 's9' }] },
    ])
    const res = await mint()
    expect(res.body.families[0].reused).toBe(false)
    expect(prismaMock.parentInvitation.create).toHaveBeenCalledTimes(1)
  })

  it('only considers PENDING, unexpired codes for reuse', async () => {
    prismaMock.student.findMany.mockResolvedValue([pupil('s1', 'Ada', 'Koy')])
    await mint()
    const where = prismaMock.parentInvitation.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ schoolId: 'sch-1', status: 'PENDING' })
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }])
  })

  it('sets the expiry from the hours asked for', async () => {
    prismaMock.student.findMany.mockResolvedValue([pupil('s1', 'Ada', 'Koy')])
    const before = Date.now()
    await mint({ classId: 'cls-1', expiresInHours: 6 })
    const expiresAt = prismaMock.parentInvitation.create.mock.calls[0][0].data.expiresAt as Date
    const hours = (expiresAt.getTime() - before) / 3_600_000
    expect(hours).toBeGreaterThan(5.9)
    expect(hours).toBeLessThan(6.1)
  })

  it('refuses an expiry that would leave codes lying around', async () => {
    for (const expiresInHours of [0, -1, 169, 'forever', undefined]) {
      const res = await mint({ classId: 'cls-1', expiresInHours })
      expect(res.status).toBe(400)
    }
    expect(prismaMock.parentInvitation.create).not.toHaveBeenCalled()
  })

  it('carries a registration link for the slip QR', async () => {
    prismaMock.student.findMany.mockResolvedValue([pupil('s1', 'Ada', 'Koy')])
    const res = await mint()
    expect(res.body.families[0].registrationUrl).toBe(
      `https://app.example/register?code=${res.body.families[0].accessCode}`,
    )
  })
})

describe('POST /by-class — scoping', () => {
  it("404s a class that isn't this admin's school", async () => {
    prismaMock.class.findFirst.mockResolvedValue(null)
    expect((await mint()).status).toBe(404)
    expect(prismaMock.class.findFirst.mock.calls[0][0].where).toEqual({ id: 'cls-1', schoolId: 'sch-1' })
  })

  it('leaves Test Students off the sheet', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    await mint()
    expect(prismaMock.student.findMany.mock.calls[0][0].where).toMatchObject({
      classId: 'cls-1', schoolId: 'sch-1', isTest: false,
    })
  })
})

describe('POST /revoke-batch', () => {
  it('kills only this school’s still-unused codes', async () => {
    prismaMock.parentInvitation.updateMany.mockResolvedValue({ count: 2 })
    const res = await request(makeApp())
      .post('/api/parent-invitations/revoke-batch')
      .send({ invitationIds: ['inv-1', 'inv-2', 'inv-3'] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ revoked: 2 })
    expect(prismaMock.parentInvitation.updateMany.mock.calls[0][0]).toEqual({
      // A redeemed code is left alone — revoking it would say the family never joined.
      where: { id: { in: ['inv-1', 'inv-2', 'inv-3'] }, schoolId: 'sch-1', status: 'PENDING' },
      data: { status: 'REVOKED' },
    })
  })

  it('400s on an empty request rather than revoking everything', async () => {
    const res = await request(makeApp()).post('/api/parent-invitations/revoke-batch').send({})
    expect(res.status).toBe(400)
    expect(prismaMock.parentInvitation.updateMany).not.toHaveBeenCalled()
  })
})
