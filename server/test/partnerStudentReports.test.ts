import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * CP-1: report delivery from Little Things / Class Passport.
 *
 *   PUT    /api/partner/student-reports/:sourceApp/:sourceReportId
 *   DELETE /api/partner/student-reports/:sourceApp/:sourceReportId
 *
 * The child is hubPupilId only; versions are the report's own counter; a
 * publishAt hides it from parents and defers the announcement; DELETE is the
 * withdrawal.
 */
const prismaMock = {
  school: { findFirst: vi.fn() },
  student: { findFirst: vi.fn(), findUnique: vi.fn() },
  studentReport: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  auditLog: { create: vi.fn(async () => ({})) },
  parentStudentLink: { findMany: vi.fn(async () => [{ userId: 'par-1' }, { userId: 'par-2' }]) },
}
const storageMock = {
  uploadFile: vi.fn(async (_b: Buffer, key: string) => `https://acct.r2.cloudflarestorage.com/${key}`),
  generateKey: vi.fn((prefix: string) => `${prefix}/new-uuid.pdf`),
  deleteFile: vi.fn(async () => {}),
  extractKeyFromUrl: (url: string) => {
    try { return new URL(url).pathname.replace(/^\//, '') } catch { return null }
  },
}
const notifyMock = { sendNotification: vi.fn(async () => {}) }

vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/storage', () => storageMock)
vi.mock('../src/services/notify', () => notifyMock)
vi.mock('../src/services/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('../src/middleware/partnerAuth', () => ({
  requirePartner: (req: any, _res: any, next: any) => {
    req.partner = { id: 'tok-1', name: req.header('x-test-partner') ?? 'Little Things' }
    next()
  },
}))

const { default: routes } = await import('../src/routes/partnerStudentReports')
const { releaseDueReports } = await import('../src/services/studentReportRelease')

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/partner/student-reports', routes)
  return a
}

const PDF = Buffer.from('%PDF-1.7\n...report...')
const URL_PATH = '/api/partner/student-reports/little-things/rep-abc'
const FUTURE = '2099-12-14T07:00:00+04:00'

function put(fields: Record<string, string> = {}, file: Buffer | null = PDF, mime = 'application/pdf') {
  let r = request(app()).put(URL_PATH)
  const all = { school_id: 'hub-school-1', hubPupilId: 'hp-maya', version: '1', title: 'EYFS Summer Report', ...fields }
  for (const [k, v] of Object.entries(all)) r = r.field(k, v)
  if (file) r = r.attach('file', file, { filename: 'r.pdf', contentType: mime })
  return r
}

const OLD_URL = 'https://acct.r2.cloudflarestorage.com/report-cards/old-uuid.pdf'
function held(over: Record<string, unknown> = {}) {
  return {
    id: 'sr-1', studentId: 'stu-maya', schoolId: 'school-1', fileUrl: OLD_URL,
    title: 'EYFS Summer Report', reportPeriod: null, version: 1,
    managedBy: 'little things', sourceApp: 'little-things',
    publishAt: null, notifiedAt: new Date('2026-11-01T08:00:00Z'), ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
  prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-maya' })
  prismaMock.student.findUnique.mockResolvedValue({ firstName: 'Maya' })
  prismaMock.studentReport.findUnique.mockResolvedValue(null)
  prismaMock.studentReport.create.mockImplementation(async ({ data }: any) => ({ id: 'sr-new', ...data }))
  prismaMock.studentReport.updateMany.mockResolvedValue({ count: 1 })
})

describe('delivering a new report', () => {
  it('refuses an unknown pupil by name, storing nothing', async () => {
    prismaMock.student.findFirst.mockResolvedValue(null)
    const res = await put()
    expect(res.status).toBe(422)
    expect(res.body).toMatchObject({ error: 'unknown_pupil', hubPupilId: 'hp-maya' })
    expect(storageMock.uploadFile).not.toHaveBeenCalled()
    expect(prismaMock.studentReport.create).not.toHaveBeenCalled()
  })

  it('matches the child on hubPupilId within the school, nothing else', async () => {
    await put()
    expect(prismaMock.student.findFirst).toHaveBeenCalledWith({
      where: { hubPupilId: 'hp-maya', schoolId: 'school-1' }, select: { id: true },
    })
  })

  it('sent now: visible at once, and the parents are told', async () => {
    const res = await put()
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'created', version: 1, visibleToParents: true, publishAt: null })
    const data = prismaMock.studentReport.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      studentId: 'stu-maya', sourceApp: 'little-things', sourceReportId: 'rep-abc',
      version: 1, managedBy: 'little things', uploadedById: null, publishAt: null,
    })
    expect(data.notifiedAt).toBeInstanceOf(Date)
    expect(notifyMock.sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'STUDENT_REPORT',
      title: 'A new report for Maya is ready',
      data: { route: '/report-cards' },
      target: { targetClass: 'Reports', parentUserIds: ['par-1', 'par-2'], schoolId: 'school-1' },
    }))
  })

  it('scheduled: hidden, and NOBODY is told on arrival', async () => {
    const res = await put({ publishAt: FUTURE })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ visibleToParents: false, publishAt: '2099-12-14T03:00:00.000Z', parentsNotifiedAt: null })
    expect(prismaMock.studentReport.create.mock.calls[0][0].data.notifiedAt).toBeNull()
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
  })

  it('a publishAt already passed means now', async () => {
    const res = await put({ publishAt: '2020-01-01T07:00:00Z' })
    expect(res.body).toMatchObject({ visibleToParents: true, publishAt: null })
    expect(notifyMock.sendNotification).toHaveBeenCalled()
  })

  it.each([
    ['a time with no zone', { publishAt: '2099-12-14T07:00:00' }],
    ['a timestamp as version', { version: '2026-11-15T08:00:00Z' }],
    ['version 0', { version: '0' }],
    ['an unknown reportType', { reportType: 'SECRET' }],
  ])('rejects %s', async (_label, fields) => {
    const res = await put(fields)
    expect(res.status).toBe(400)
    expect(storageMock.uploadFile).not.toHaveBeenCalled()
  })

  it('rejects a file that is not a PDF, whatever it claims', async () => {
    const res = await put({}, Buffer.from('<html>not a pdf</html>'))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('file must be a PDF')
  })

  it('names an unknown school without a 404', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)
    const res = await put()
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('unknown_school')
  })

  it('a race on the same new report answers retry and discards its upload', async () => {
    prismaMock.studentReport.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))
    const res = await put()
    expect(res.status).toBe(503)
    expect(storageMock.deleteFile).toHaveBeenCalledWith('report-cards/new-uuid.pdf')
  })
})

describe('sending a report Connect already holds', () => {
  it('the same version again does nothing at all', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held())
    const res = await put({ version: '1' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'unchanged', id: 'sr-1', version: 1 })
    expect(storageMock.uploadFile).not.toHaveBeenCalled()
    expect(prismaMock.studentReport.updateMany).not.toHaveBeenCalled()
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
  })

  it('an older version is ignored, never rolled back to', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held({ version: 3 }))
    const res = await put({ version: '2' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'stale', version: 3 })
    expect(storageMock.uploadFile).not.toHaveBeenCalled()
  })

  it('a higher version replaces the file, deletes the old object, and says "updated"', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held())
    prismaMock.studentReport.findUniqueOrThrow.mockResolvedValue(held({ version: 2, fileUrl: 'x' }))
    const res = await put({ version: '2' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('replaced')
    const call = prismaMock.studentReport.updateMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ id: 'sr-1', version: 1 })
    expect(call.data).toMatchObject({ version: 2, fileUrl: expect.stringContaining('new-uuid') })
    expect(call.data).not.toHaveProperty('publishAt') // released stays released
    expect(storageMock.deleteFile).toHaveBeenCalledWith('report-cards/old-uuid.pdf')
    expect(notifyMock.sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'An updated report for Maya is ready',
    }))
  })

  it('a correction to a still-scheduled report stays scheduled and silent', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held({ publishAt: new Date(FUTURE), notifiedAt: null }))
    prismaMock.studentReport.findUniqueOrThrow.mockResolvedValue(held({ version: 2, publishAt: new Date(FUTURE), notifiedAt: null }))
    const res = await put({ version: '2', publishAt: FUTURE })
    expect(res.body).toMatchObject({ status: 'replaced', visibleToParents: false })
    expect(prismaMock.studentReport.updateMany.mock.calls[0][0].data).toMatchObject({ publishAt: new Date(FUTURE), notifiedAt: null })
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
  })

  it('a correction sent now to a scheduled report releases it, as new', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held({ publishAt: new Date(FUTURE), notifiedAt: null }))
    prismaMock.studentReport.findUniqueOrThrow.mockResolvedValue(held({ version: 2 }))
    await put({ version: '2' })
    expect(prismaMock.studentReport.updateMany.mock.calls[0][0].data).toMatchObject({ publishAt: null, notifiedAt: expect.any(Date) })
    expect(notifyMock.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'A new report for Maya is ready' }))
  })

  it('a lost race answers retry and discards the new upload, keeping the old file', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held())
    prismaMock.studentReport.updateMany.mockResolvedValue({ count: 0 })
    const res = await put({ version: '2' })
    expect(res.status).toBe(503)
    expect(storageMock.deleteFile).toHaveBeenCalledWith('report-cards/new-uuid.pdf')
    expect(storageMock.deleteFile).not.toHaveBeenCalledWith('report-cards/old-uuid.pdf')
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
  })

  it('NEVER moves a report to a different child', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held({ studentId: 'stu-someone-else' }))
    const res = await put({ version: '2' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('pupil_mismatch')
    expect(storageMock.uploadFile).not.toHaveBeenCalled()
  })

  it("refuses another app's report", async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held())
    const res = await put({ version: '2' }).set('x-test-partner', 'Class Passport')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('report_managed_elsewhere')
  })
})

describe('withdrawing a report', () => {
  const del = () => request(app()).delete(`${URL_PATH}?school_id=hub-school-1`)

  it('removes the file, then the row', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held({ publishAt: new Date(FUTURE), notifiedAt: null }))
    const res = await del()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'withdrawn', wasVisibleToParents: false })
    expect(storageMock.deleteFile).toHaveBeenCalledWith('report-cards/old-uuid.pdf')
    expect(prismaMock.studentReport.delete).toHaveBeenCalledWith({ where: { id: 'sr-1' } })
  })

  it('KEEPS THE ROW if the file cannot be removed, so a retry can finish it', async () => {
    prismaMock.studentReport.findUnique.mockResolvedValue(held())
    storageMock.deleteFile.mockRejectedValueOnce(new Error('r2 down'))
    const res = await del()
    expect(res.status).toBe(500)
    expect(prismaMock.studentReport.delete).not.toHaveBeenCalled()
  })

  it('a report already gone is a completed withdrawal, not a 404', async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'absent' })
  })
})

describe('the release sweep', () => {
  it('claims each due report once and tells its parents', async () => {
    prismaMock.studentReport.findMany.mockResolvedValue([
      { id: 'sr-1', studentId: 'stu-maya', schoolId: 'school-1', title: 'EYFS Summer Report', reportPeriod: null },
    ])
    await releaseDueReports()
    const where = prismaMock.studentReport.findMany.mock.calls[0][0].where
    // Only partner reports: an admin upload is never announced retroactively.
    expect(where).toMatchObject({ sourceApp: { not: null }, notifiedAt: null })
    expect(prismaMock.studentReport.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'sr-1', notifiedAt: null })
    expect(notifyMock.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('announces nothing when another replica (or a withdrawal) got there first', async () => {
    prismaMock.studentReport.findMany.mockResolvedValue([
      { id: 'sr-1', studentId: 'stu-maya', schoolId: 'school-1', title: null, reportPeriod: null },
    ])
    prismaMock.studentReport.updateMany.mockResolvedValue({ count: 0 })
    await releaseDueReports()
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
  })
})
