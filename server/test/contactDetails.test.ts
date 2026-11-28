import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * "Are your contact details up to date?"
 *
 * Asked once a term; every two weeks when the school has no UAE number to
 * ring. A correction becomes a request the office exports for IT to load into
 * the MIS — Connect cannot write to Hub — and the Hub sync no longer puts a
 * parent's old number back over the one they just gave.
 */

const prismaMock = {
  user: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  termDate: { findFirst: vi.fn() },
  contactChangeRequest: {
    findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(),
  },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
const signInMock = vi.fn(async () => ({ signedIn: new Set<string>(), neverSignedIn: new Set<string>() }))
vi.mock('../src/services/parentActivation', () => ({ parentsBySignInStatus: signInMock }))
let currentUser: Record<string, unknown> = { id: 'par-1', schoolId: 'sch-1', role: 'PARENT', name: 'Sadia' }
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = currentUser
    next()
  }
  return { isAuthenticated: attach, isStaff: attach, isAdmin: attach, isSuperAdmin: attach, loadUserWithRelations: vi.fn() }
})

const cd = await import('../src/services/contactDetails')
const { default: userRoutes } = await import('../src/routes/users')
const { default: contactRoutes, csvCell, contactSummary } = await import('../src/routes/contactChanges')

const app = () => {
  const a = express()
  a.use(express.json())
  a.use('/api/users', userRoutes)
  a.use('/api/admin', contactRoutes)
  return a
}
const NOW = new Date('2026-11-28T09:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

beforeEach(() => {
  vi.clearAllMocks()
  currentUser = { id: 'par-1', schoolId: 'sch-1', role: 'PARENT', name: 'Sadia' }
  prismaMock.contactChangeRequest.findFirst.mockResolvedValue(null)
  prismaMock.contactChangeRequest.findMany.mockResolvedValue([])
  prismaMock.contactChangeRequest.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.user.update.mockResolvedValue({})
})

describe('which numbers the school can ring', () => {
  it.each([
    ['+971 50 123 4567', true],
    ['00971501234567', true],
    ['0501234567', true],
    ['971501234567', true],
    ['04 123 4567', true],
    ['+44 7700 900123', false],
    ['+91 98765 43210', false],
    [null, false],
    ['', false],
  ])('%s → %s', (raw, uae) => {
    expect(cd.isUaePhone(raw as string | null)).toBe(uae)
  })

  it('treats the local and international spellings of one number as the same', () => {
    expect(cd.samePhone('050 123 4567', '+971501234567')).toBe(true)
    expect(cd.samePhone('+971501234567', '+971501234568')).toBe(false)
  })
})

describe('when to ask', () => {
  const base = { now: NOW, intervalDays: 180, phone: '+971501234567', currentTermStart: daysAgo(30) }

  it('never, when the school has turned it off — even for a foreign number', () => {
    expect(cd.promptDue({ ...base, intervalDays: 0, phone: '+447700900123', lastConfirmedAt: null })).toBeNull()
  })
  it('straight away for a parent who has never answered', () => {
    expect(cd.promptDue({ ...base, lastConfirmedAt: null })).toBe('never')
  })
  it('once a term for a UAE number: not again this term, again next term', () => {
    expect(cd.promptDue({ ...base, lastConfirmedAt: daysAgo(10) })).toBeNull()
    expect(cd.promptDue({ ...base, lastConfirmedAt: daysAgo(40) })).toBe('new_term')
  })
  it('every 14 days without a UAE number, whatever the term', () => {
    expect(cd.promptDue({ ...base, phone: '+447700900123', lastConfirmedAt: daysAgo(10) })).toBeNull()
    expect(cd.promptDue({ ...base, phone: '+447700900123', lastConfirmedAt: daysAgo(15) })).toBe('no_uae_number')
    expect(cd.promptDue({ ...base, phone: null, lastConfirmedAt: daysAgo(15) })).toBe('no_uae_number')
  })
  it('falls back to the school’s day count when it has no term dates', () => {
    const noTerms = { ...base, currentTermStart: null }
    expect(cd.promptDue({ ...noTerms, lastConfirmedAt: daysAgo(100) })).toBeNull()
    expect(cd.promptDue({ ...noTerms, lastConfirmedAt: daysAgo(200) })).toBe('interval')
  })
})

describe('recording a change', () => {
  const ask = (over: Partial<Parameters<typeof cd.requestContactChange>[0]> = {}) => cd.requestContactChange({
    schoolId: 'sch-1', userId: 'par-1', field: 'PHONE', schoolValue: '+971501111111', newValue: '+971502222222', ...over,
  })

  it('opens a request holding what the school has and what the parent gave', async () => {
    await ask()
    expect(prismaMock.contactChangeRequest.create).toHaveBeenCalledWith({
      data: { schoolId: 'sch-1', userId: 'par-1', field: 'PHONE', oldValue: '+971501111111', newValue: '+971502222222' },
    })
  })

  it('a second correction updates the open one, and it goes out in the next CSV again', async () => {
    prismaMock.contactChangeRequest.findFirst.mockResolvedValue({ id: 'ccr-1', oldValue: '+971501111111' })
    await ask({ schoolValue: '+971502222222', newValue: '+971503333333' })
    expect(prismaMock.contactChangeRequest.create).not.toHaveBeenCalled()
    expect(prismaMock.contactChangeRequest.update).toHaveBeenCalledWith({
      where: { id: 'ccr-1' }, data: { newValue: '+971503333333', exportedAt: null },
    })
  })

  it('changing it back to what the school already holds withdraws the request', async () => {
    prismaMock.contactChangeRequest.findFirst.mockResolvedValue({ id: 'ccr-1', oldValue: '+971501111111' })
    await ask({ schoolValue: '+971502222222', newValue: '050 111 1111' })
    expect(prismaMock.contactChangeRequest.delete).toHaveBeenCalledWith({ where: { id: 'ccr-1' } })
  })

  it('asks for nothing when nothing changed', async () => {
    await ask({ field: 'EMAIL', schoolValue: 'Sadia@Example.com', newValue: 'sadia@example.com' })
    expect(prismaMock.contactChangeRequest.create).not.toHaveBeenCalled()
  })
})

describe('the Hub sync meeting an open request', () => {
  it('keeps the parent’s new number while Hub still has the old one', async () => {
    const r = await cd.reconcileWithHub(
      [{ id: 'ccr-1', field: 'PHONE', newValue: '+971502222222' }],
      { phone: '+971501111111', email: 'a@b.com' },
    )
    expect(r.phone).toBeUndefined()
    expect(prismaMock.contactChangeRequest.update).not.toHaveBeenCalled()
  })

  it('closes the request once Hub holds the new number, in Hub’s spelling', async () => {
    const r = await cd.reconcileWithHub(
      [{ id: 'ccr-1', field: 'PHONE', newValue: '+971502222222' }],
      { phone: '050 222 2222', email: 'a@b.com' },
    )
    expect(r.phone).toBe('050 222 2222')
    expect(prismaMock.contactChangeRequest.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'ccr-1' }, data: { resolvedBy: 'hub' },
    })
  })

  it('closes an email request when Hub has the new address, without touching the phone', async () => {
    const r = await cd.reconcileWithHub(
      [{ id: 'ccr-2', field: 'EMAIL', newValue: 'new@example.com' }],
      { phone: '+971501111111', email: 'NEW@example.com' },
    )
    expect(r.phone).toBe('+971501111111')
    expect(prismaMock.contactChangeRequest.update).toHaveBeenCalledTimes(1)
  })

  it('with nothing open, writes Hub’s phone as before', async () => {
    expect((await cd.reconcileWithHub(undefined, { phone: '+971501111111', email: null })).phone).toBe('+971501111111')
  })
})

describe('the parent endpoints', () => {
  beforeEach(() => {
    prismaMock.school.findUnique.mockResolvedValue({ contactConfirmDays: 180 })
    prismaMock.termDate.findFirst.mockResolvedValue({ date: daysAgo(30) })
  })

  it('tells the app the number cannot be rung, and shows an email change still waiting', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ phone: '+447700900123', email: 'sadia@example.com', phoneConfirmedAt: null })
    prismaMock.contactChangeRequest.findFirst.mockResolvedValue({ newValue: 'sadia.k@example.com' })
    const res = await request(app()).get('/api/users/me/contact-prompt')
    expect(res.body).toMatchObject({
      needsConfirmation: true, reason: 'never', phoneReachable: false,
      email: 'sadia@example.com', pendingEmail: 'sadia.k@example.com',
    })
  })

  it('a new number is used at once AND handed to the office', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ phone: '+971501111111', email: 'sadia@example.com' })
    const res = await request(app()).post('/api/users/me/contact-confirm').send({ phone: '+971 50 222 2222', email: 'sadia@example.com' })
    expect(res.status).toBe(200)
    expect(prismaMock.user.update.mock.calls[0][0].data.phone).toBe('+971502222222')
    expect(prismaMock.contactChangeRequest.create.mock.calls[0][0].data).toMatchObject({ field: 'PHONE', newValue: '+971502222222' })
  })

  // The email is their sign-in. A typo must not lock them out.
  it('a new email is only requested — the sign-in address is not changed', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ phone: '+971501111111', email: 'sadia@example.com' })
    await request(app()).post('/api/users/me/contact-confirm').send({ phone: '+971501111111', email: 'Sadia.K@example.com' })
    expect(prismaMock.user.update.mock.calls[0][0].data).not.toHaveProperty('email')
    expect(prismaMock.contactChangeRequest.create.mock.calls[0][0].data).toMatchObject({
      field: 'EMAIL', oldValue: 'sadia@example.com', newValue: 'sadia.k@example.com',
    })
  })

  it('an older app sending only the phone still works', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ phone: '+971501111111', email: 'sadia@example.com' })
    const res = await request(app()).post('/api/users/me/contact-confirm').send({ phone: '+971501111111' })
    expect(res.status).toBe(200)
    expect(prismaMock.contactChangeRequest.create).not.toHaveBeenCalled()
    expect(prismaMock.user.update.mock.calls[0][0].data.phoneConfirmedAt).toBeInstanceOf(Date)
  })

  it('refuses an email that is not one', async () => {
    const res = await request(app()).post('/api/users/me/contact-confirm').send({ phone: '+971501111111', email: 'sadia@' })
    expect(res.status).toBe(400)
  })
})

describe('the office export', () => {
  const row = {
    id: 'ccr-1', field: 'PHONE', oldValue: '+971501111111', newValue: '+971502222222',
    updatedAt: new Date('2026-11-27T08:30:00Z'), exportedAt: null, resolvedAt: null, resolvedBy: null,
    user: {
      name: 'Sadia Khan', email: 'sadia@example.com', hubGuardianId: 'hg-1',
      studentLinks: [
        { student: { firstName: 'Amina', lastName: 'Khan', leftAt: null, class: { name: '3A' } } },
        { student: { firstName: 'Omar', lastName: 'Khan', leftAt: new Date(), class: { name: '6B' } } },
      ],
    },
  }

  it('is a CSV IT can load: one row per change, current pupils only, numbers as typed', async () => {
    currentUser = { id: 'adm-1', schoolId: 'sch-1', role: 'ADMIN', name: 'Office' }
    prismaMock.contactChangeRequest.findMany.mockResolvedValue([row])
    const res = await request(app()).get('/api/admin/contact-changes/export.csv')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    const lines = res.text.replace(/^﻿/, '').trim().split('\r\n')
    expect(lines[0]).toBe('Parent name,Hub guardian ID,Sign-in email,Children,Classes,Field,Current value (school records),New value,Requested at')
    expect(lines[1]).toBe('Sadia Khan,hg-1,sadia@example.com,Amina Khan,3A,Phone,+971501111111,+971502222222,2026-11-27 08:30')
    expect(prismaMock.contactChangeRequest.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ['ccr-1'] }, schoolId: 'sch-1' },
    })
  })

  it('only exports this school’s open requests', async () => {
    currentUser = { id: 'adm-1', schoolId: 'sch-1', role: 'ADMIN', name: 'Office' }
    await request(app()).get('/api/admin/contact-changes/export.csv')
    expect(prismaMock.contactChangeRequest.findMany.mock.calls[0][0].where).toEqual({ schoolId: 'sch-1', resolvedAt: null })
  })

  it('marks done only this school’s open rows, and says who', async () => {
    currentUser = { id: 'adm-1', schoolId: 'sch-1', role: 'ADMIN', name: 'Office' }
    prismaMock.contactChangeRequest.updateMany.mockResolvedValue({ count: 1 })
    const res = await request(app()).post('/api/admin/contact-changes/resolve').send({ ids: ['ccr-1'] })
    expect(res.body).toEqual({ resolved: 1 })
    expect(prismaMock.contactChangeRequest.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ['ccr-1'] }, schoolId: 'sch-1', resolvedAt: null },
      data: { resolvedBy: 'Office' },
    })
  })

  it('escapes text a spreadsheet would run, but never a plain phone number', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+971501234567', { phone: true })).toBe('+971501234567')
    expect(csvCell('=1+1', { phone: true })).toBe("'=1+1")
    expect(csvCell('Khan, Sadia')).toBe('"Khan, Sadia"')
  })
})

describe('who has confirmed', () => {
  const kid = (id: string, first: string, cls: string) => ({ student: { id, firstName: first, lastName: 'K', class: { name: cls } } })
  const parent = (id: string, phone: string | null, confirmedAt: Date | null, kids: ReturnType<typeof kid>[]) => ({
    id, name: id, email: `${id}@x.com`, phone, phoneConfirmedAt: confirmedAt, studentLinks: kids,
  })

  beforeEach(() => {
    prismaMock.school.findUnique.mockResolvedValue({ contactConfirmDays: 180 })
    prismaMock.termDate.findFirst.mockResolvedValue({ date: daysAgo(30) })
    signInMock.mockResolvedValue({ signedIn: new Set(['mum', 'dad']), neverSignedIn: new Set(['gran']) })
  })

  // VHPS has ~1.5 adults per child: a parent count reads as inflated against
  // the roll. The headline is children, covered once ANY parent answered.
  it('counts children covered by at least one parent, with adults alongside', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      parent('mum', '+971501111111', daysAgo(5), [kid('s1', 'Amina', '3A')]),
      parent('dad', '+971502222222', daysAgo(60), [kid('s1', 'Amina', '3A')]),     // before this term: due
      parent('gran', '+447700900123', null, [kid('s2', 'Omar', '1B')]),           // never, foreign number
      parent('left', '+971503333333', daysAgo(5), []),                           // family who has left
    ])
    const r = await contactSummary('sch-1', NOW)

    expect(r.children).toEqual({ total: 2, confirmed: 1, noUaeNumber: 1 })
    expect(r.parents).toEqual({ total: 3, confirmed: 1, outstanding: 2, outstandingNeverSignedIn: 1 })
    expect(r.outstanding.map(o => o.id)).toEqual(['dad', 'gran'])
    expect(r.noUaeChildren).toEqual([{ name: 'Omar K', className: '1B', parents: ['gran'] }])
  })

  // Same rule as the prompt, so the panel never calls someone confirmed whom
  // the app is still asking.
  it('a non-UAE parent who answered last week is confirmed; three weeks ago is not', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      parent('a', '+447700900123', daysAgo(7), [kid('s1', 'A', '1A')]),
      parent('b', '+447700900124', daysAgo(21), [kid('s2', 'B', '1A')]),
    ])
    const r = await contactSummary('sch-1', NOW)
    expect(r.outstanding.map(o => o.id)).toEqual(['b'])
  })

  it('reports nobody confirmed while the prompt is turned off', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ contactConfirmDays: 0 })
    prismaMock.user.findMany.mockResolvedValue([parent('a', '+971501111111', daysAgo(1), [kid('s1', 'A', '1A')])])
    const r = await contactSummary('sch-1', NOW)
    expect(r.enabled).toBe(false)
    expect(r.children.confirmed).toBe(0)
  })

  it('only counts real parents and children on roll', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    await contactSummary('sch-1', NOW)
    const q = prismaMock.user.findMany.mock.calls[0][0]
    expect(q.where).toEqual({ schoolId: 'sch-1', role: 'PARENT', isTest: false })
    expect(q.select.studentLinks.where).toEqual({ student: { leftAt: null, isTest: false } })
  })

  it('exports the parents still to answer as a CSV for chasing', async () => {
    currentUser = { id: 'adm-1', schoolId: 'sch-1', role: 'ADMIN', name: 'Office' }
    prismaMock.user.findMany.mockResolvedValue([
      parent('gran', '+447700900123', null, [kid('s2', 'Omar', '1B')]),
    ])
    const res = await request(app()).get('/api/admin/contact-changes/outstanding.csv')
    const lines = res.text.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('Parent name,Sign-in email,Phone,UAE number,Children,Classes,Last confirmed,Signed in to Connect')
    expect(lines[1]).toBe('gran,gran@x.com,+447700900123,No,Omar K,1B,Never,No')
  })
})
