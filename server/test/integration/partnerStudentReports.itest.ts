import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import prisma from '../../src/services/prisma'

// CP-1 against a real Postgres: the compound unique key, the conditional
// claims (which match on notifiedAt = NULL), and a report's whole life from
// scheduled delivery through release, correction and withdrawal.

const storage = vi.hoisted(() => {
  let n = 0
  return {
    uploadFile: vi.fn(async (_b: Buffer, key: string) => `https://acct.r2.cloudflarestorage.com/${key}`),
    generateKey: vi.fn((prefix: string) => `${prefix}/itest-${++n}.pdf`),
    deleteFile: vi.fn(async () => {}),
    extractKeyFromUrl: (url: string) => { try { return new URL(url).pathname.replace(/^\//, '') } catch { return null } },
  }
})
const notify = vi.hoisted(() => ({ sendNotification: vi.fn(async () => {}) }))
vi.mock('../../src/services/storage', () => storage)
vi.mock('../../src/services/notify', () => notify)
vi.mock('../../src/middleware/partnerAuth', () => ({
  requirePartner: (req: any, _res: any, next: any) => { req.partner = { id: 't', name: 'Little Things' }; next() },
}))

const { default: routes } = await import('../../src/routes/partnerStudentReports')
const { releaseDueReports, parentVisibleReportWhere } = await import('../../src/services/studentReportRelease')

const TAG = 'itest-cp1'
let schoolId = ''
let studentId = ''
const app = express().use('/r', routes)
const PDF = Buffer.from('%PDF-1.7 itest')

const put = (fields: Record<string, string>) => {
  let r = request(app).put('/r/little-things/rep-1')
  for (const [k, v] of Object.entries({ school_id: schoolId, hubPupilId: `${TAG}-pupil`, title: 'Summer', ...fields })) r = r.field(k, v)
  return r.attach('file', PDF, { filename: 'r.pdf', contentType: 'application/pdf' })
}
const visibleToParent = () => prisma.studentReport.count({ where: { studentId, ...parentVisibleReportWhere() } })

beforeAll(async () => {
  const school = await prisma.school.create({ data: { name: `${TAG}-school`, shortName: TAG, city: 'Dubai' } })
  schoolId = school.id
  const cls = await prisma.class.create({ data: { name: `${TAG}-FS1`, schoolId } })
  studentId = (await prisma.student.create({ data: { firstName: 'Maya', lastName: 'T', schoolId, classId: cls.id, hubPupilId: `${TAG}-pupil` } })).id
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { schoolId } })
  await prisma.studentReport.deleteMany({ where: { schoolId } })
  await prisma.student.deleteMany({ where: { schoolId } })
  await prisma.class.deleteMany({ where: { schoolId } })
  await prisma.school.deleteMany({ where: { id: schoolId } })
})

describe('a delivered report, start to finish', () => {
  it('scheduled, corrected, released once, corrected again, withdrawn', async () => {
    const created = await put({ version: '1', publishAt: '2099-01-01T07:00:00+04:00' })
    expect(created.status).toBe(201)
    expect(await visibleToParent()).toBe(0)

    const corrected = await put({ version: '2', publishAt: '2099-01-01T07:00:00+04:00' })
    expect(corrected.body).toMatchObject({ status: 'replaced', version: 2, visibleToParents: false })
    expect(await prisma.studentReport.count({ where: { schoolId } })).toBe(1)
    expect(notify.sendNotification).not.toHaveBeenCalled()

    // Its time comes.
    await prisma.studentReport.updateMany({ where: { schoolId }, data: { publishAt: new Date(Date.now() - 1000) } })
    expect(await visibleToParent()).toBe(1)
    await releaseDueReports()
    await releaseDueReports()
    expect(notify.sendNotification).toHaveBeenCalledTimes(1)

    expect((await put({ version: '2' })).body.status).toBe('unchanged')
    const updated = await put({ version: '3' })
    expect(updated.body).toMatchObject({ status: 'replaced', version: 3, visibleToParents: true })
    expect(notify.sendNotification).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'An updated report for Maya is ready' }))

    const gone = await request(app).delete(`/r/little-things/rep-1?school_id=${schoolId}`)
    expect(gone.body).toEqual({ status: 'withdrawn', wasVisibleToParents: true })
    expect(await prisma.studentReport.count({ where: { schoolId } })).toBe(0)
    expect((await request(app).delete(`/r/little-things/rep-1?school_id=${schoolId}`)).body).toEqual({ status: 'absent' })

    // Withdrawn, it can be sent again later as new (a held-back report, paid).
    expect((await put({ version: '3' })).status).toBe(201)
  })
})
