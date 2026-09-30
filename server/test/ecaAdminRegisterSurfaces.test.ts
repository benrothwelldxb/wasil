import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * THE ADMIN SCREENS, WHEN THE REGISTER COMES FROM SOMEWHERE ELSE.
 *
 * Every one of these was written around Connect's own allocation run: a school
 * opened registration, parents chose, an allocation produced confirmed places,
 * and the screens counted those. At a school whose programme is published from
 * Active that run never happens — so all 27 club cards read "0/20" and every
 * "Students" list was empty, while 352 club places sat in the database.
 *
 * The number did not look like a question asked of the wrong table. It looked
 * like a broken integration, which is the expensive misreading: the school's
 * next move is to doubt the data rather than the screen.
 */
const prismaMock = {
  ecaTerm: { findFirst: vi.fn() },
  ecaActivity: { findFirst: vi.fn() },
  ecaAllocation: { findMany: vi.fn() },
  ecaActivityMember: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  ecaSettings: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'parent-1', schoolId: 'school-1' }
    next()
  },
  isAdmin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'admin-1', schoolId: 'school-1' }
    next()
  },
  loadUserWithRelations: vi.fn(async () => ({ id: 'parent-1', schoolId: 'school-1', studentLinks: [] })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({
  sendEcaRegistrationOpenNotification: vi.fn(),
  sendEcaAllocationResultsNotification: vi.fn(),
  sendEcaInvitationNotification: vi.fn(),
}))
vi.mock('../src/services/ecaAllocation', () => ({ runAllocation: vi.fn(), previewAllocation: vi.fn() }))
vi.mock('../src/services/ecaPdf', () => ({ generateAttendanceRegisterHtml: vi.fn(), generateBlankRegisterHtml: vi.fn() }))

const { default: ecaRoutes } = await import('../src/routes/eca')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/eca', ecaRoutes)
  return app
}

const student = (id: string, first: string, last: string) => ({
  id, firstName: first, lastName: last, class: { name: '4G' },
})

const students = () => request(makeApp()).get('/api/eca/activities/act-1/students')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.ecaActivity.findFirst.mockResolvedValue({ id: 'act-1', schoolId: 'school-1', groupId: null })
  prismaMock.ecaAllocation.findMany.mockResolvedValue([])
  prismaMock.ecaActivityMember.findMany.mockResolvedValue([])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([])
})

describe('the Students list for a club', () => {
  it('shows children from the register published with the club', async () => {
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      { id: 'm1', createdAt: new Date('2026-09-30'), student: student('stu-1', 'Idris', 'Khan') },
    ])

    const res = await students()

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ studentId: 'stu-1', studentName: 'Idris Khan', source: 'register' })
  })

  it('shows children whose roster arrived as a group', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({ id: 'act-1', schoolId: 'school-1', groupId: 'grp-1' })
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { id: 'g1', student: student('stu-2', 'Leyla', 'Ahmed') },
    ])

    const res = await students()

    expect(res.body[0]).toMatchObject({ studentName: 'Leyla Ahmed', source: 'group' })
  })

  it('still shows allocations, for a school that uses Connect’s own flow', async () => {
    prismaMock.ecaAllocation.findMany.mockResolvedValue([
      {
        id: 'a1', allocationType: 'AUTO', status: 'CONFIRMED',
        createdAt: new Date('2026-09-01'), student: student('stu-3', 'Sara', 'Noor'),
      },
    ])

    const res = await students()

    expect(res.body[0]).toMatchObject({ studentName: 'Sara Noor', source: 'allocation' })
  })

  it('names a child ONCE when they are in two sources', async () => {
    // A club can have a published register and an allocation history. A child
    // listed twice is worse than useless to whoever is taking the register.
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      { id: 'm1', createdAt: new Date('2026-09-30'), student: student('stu-1', 'Idris', 'Khan') },
    ])
    prismaMock.ecaAllocation.findMany.mockResolvedValue([
      {
        id: 'a1', allocationType: 'AUTO', status: 'CONFIRMED',
        createdAt: new Date('2026-09-01'), student: student('stu-1', 'Idris', 'Khan'),
      },
    ])

    const res = await students()

    expect(res.body).toHaveLength(1)
    // The published register is the more authoritative of the two.
    expect(res.body[0].source).toBe('register')
  })

  it('sorts by name, so a register can be read down the page', async () => {
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      { id: 'm1', createdAt: new Date(), student: student('stu-1', 'Zara', 'Yusuf') },
      { id: 'm2', createdAt: new Date(), student: student('stu-2', 'Amara', 'Bello') },
    ])

    const res = await students()

    expect(res.body.map((r: { studentName: string }) => r.studentName))
      .toEqual(['Amara Bello', 'Zara Yusuf'])
  })

  it('does not fall over when a child has no class', async () => {
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      { id: 'm1', createdAt: new Date(), student: { id: 'stu-1', firstName: 'Idris', lastName: 'Khan', class: null } },
    ])

    const res = await students()

    expect(res.status).toBe(200)
    expect(res.body[0].className).toBe('')
  })
})
