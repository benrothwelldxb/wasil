import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Verifies Test Parents/Students are excluded from launch analytics (parent +
// student counts, by-class) and from a representative staff-facing list (the
// printed daily attendance register). Prisma is fully mocked.
const prismaMock: any = {
  user: { findMany: vi.fn(), count: vi.fn() },
  student: { count: vi.fn() },
  refreshToken: { findMany: vi.fn() },
  loginCode: { findMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  message: { count: vi.fn(), findMany: vi.fn() },
  conversation: { count: vi.fn() },
  conversationMessage: { count: vi.fn() },
  messageAcknowledgment: { count: vi.fn(), findMany: vi.fn() },
  event: { count: vi.fn(), findMany: vi.fn() },
  eventRsvp: { count: vi.fn() },
  form: { count: vi.fn(), findMany: vi.fn() },
  formResponse: { count: vi.fn(), findMany: vi.fn() },
  ecaAllocation: { findMany: vi.fn() },
  attendanceRequest: { count: vi.fn() },
  pulseSurvey: { count: vi.fn(), findFirst: vi.fn() },
  pulseResponse: { count: vi.fn(), findMany: vi.fn() },
  parentStudentLink: { findMany: vi.fn() },
  // For the register service:
  school: { findUnique: vi.fn() },
  class: { findMany: vi.fn() },
  attendanceRecord: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => {
  const setAdmin = (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', schoolId: 'school-1' }
    next()
  }
  return { isAdmin: setAdmin, isAuthenticated: setAdmin, isStaff: setAdmin }
})

const { default: analyticsRoutes } = await import('../src/routes/analytics')
const { generateDailyRegistersHtml } = await import('../src/services/attendanceRegisterPdf')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/analytics', analyticsRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.user.count.mockResolvedValue(0)
  prismaMock.student.count.mockResolvedValue(0)
  prismaMock.refreshToken.findMany.mockResolvedValue([])
  prismaMock.loginCode.findMany.mockResolvedValue([])
  prismaMock.deviceToken.findMany.mockResolvedValue([])
  prismaMock.message.count.mockResolvedValue(0)
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.conversation.count.mockResolvedValue(0)
  prismaMock.conversationMessage.count.mockResolvedValue(0)
  prismaMock.messageAcknowledgment.count.mockResolvedValue(0)
  prismaMock.messageAcknowledgment.findMany.mockResolvedValue([])
  prismaMock.event.count.mockResolvedValue(0)
  prismaMock.event.findMany.mockResolvedValue([])
  prismaMock.eventRsvp.count.mockResolvedValue(0)
  prismaMock.form.count.mockResolvedValue(0)
  prismaMock.form.findMany.mockResolvedValue([])
  prismaMock.formResponse.count.mockResolvedValue(0)
  prismaMock.formResponse.findMany.mockResolvedValue([])
  prismaMock.ecaAllocation.findMany.mockResolvedValue([])
  prismaMock.attendanceRequest.count.mockResolvedValue(0)
  prismaMock.pulseSurvey.count.mockResolvedValue(0)
  prismaMock.pulseSurvey.findFirst.mockResolvedValue(null)
  prismaMock.pulseResponse.count.mockResolvedValue(0)
  prismaMock.pulseResponse.findMany.mockResolvedValue([])
  prismaMock.parentStudentLink.findMany.mockResolvedValue([])
})

describe('analytics exclude isTest', () => {
  it('/launch: a seeded isTest parent + student never reach the parent/activation counts', async () => {
    // The mock returns only real parents regardless — the point is the WHERE
    // filter the route sends, which the DB would use to drop test rows.
    const res = await request(makeApp()).get('/api/analytics/launch?_=1')
    expect(res.status).toBe(200)
    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ schoolId: 'school-1', role: 'PARENT', isTest: false })
  })

  it('/overview: totalParents and totalStudents both filter isTest:false', async () => {
    const res = await request(makeApp()).get('/api/analytics/overview?_=2')
    expect(res.status).toBe(200)
    // First user.count is totalParents.
    const parentWhere = prismaMock.user.count.mock.calls[0][0].where
    expect(parentWhere).toMatchObject({ role: 'PARENT', isTest: false })
    // Some student.count call must carry isTest:false.
    const studentWheres = prismaMock.student.count.mock.calls.map((c: any) => c[0].where)
    expect(studentWheres.some((w: any) => w.isTest === false)).toBe(true)
  })

  it('/by-class: link lookup excludes both test parents and test students', async () => {
    const res = await request(makeApp()).get('/api/analytics/by-class?_=3')
    expect(res.status).toBe(200)
    const where = prismaMock.parentStudentLink.findMany.mock.calls[0][0].where
    expect(where.user).toMatchObject({ role: 'PARENT', isTest: false })
    expect(where.student).toMatchObject({ isTest: false })
  })

  it('/feature-usage: totalParents count filters isTest:false', async () => {
    const res = await request(makeApp()).get('/api/analytics/feature-usage?_=4')
    expect(res.status).toBe(200)
    const where = prismaMock.user.count.mock.calls[0][0].where
    expect(where).toMatchObject({ role: 'PARENT', isTest: false })
  })
})

describe('staff attendance register excludes isTest students', () => {
  it('the printed daily register only fetches non-test students per class', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ name: 'VHPS' })
    prismaMock.class.findMany.mockResolvedValue([
      { name: 'FS1 Blue', yearGroup: { name: 'FS1' }, students: [{ id: 's1', firstName: 'Real', lastName: 'Pupil' }] },
    ])
    prismaMock.attendanceRecord.findMany.mockResolvedValue([])

    await generateDailyRegistersHtml('school-1', '2026-08-20')

    const include = prismaMock.class.findMany.mock.calls[0][0].include
    expect(include.students.where).toMatchObject({ isTest: false })
  })
})
