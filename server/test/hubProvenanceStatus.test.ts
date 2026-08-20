import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Feature B (provenance `fromHub` on admin list endpoints) + Feature C (the
// hub-sync endpoint's `lastSyncedAt` + the /hub-sync/status route). Prisma, the
// sync service and the auth middleware are mocked — the established route-test
// pattern (see inboxStaffCc.test.ts).
const prismaMock = {
  student: { findMany: vi.fn(), count: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

// students.ts pulls these in at module load — stub them so importing the router
// has no side effects.
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/seed', () => ({
  seedTestData: vi.fn(),
  clearTestData: vi.fn(),
  getTestDataStats: vi.fn(),
}))

// The hub-sync route imports the sync service + typed errors; mock the service
// (we don't want a real sync) but keep the error classes it references.
const mSync = vi.fn()
vi.mock('../src/services/hubSync', () => ({
  syncSchoolFromHub: mSync,
  SchoolNotLinkedError: class SchoolNotLinkedError extends Error {},
}))
vi.mock('../src/services/hubMis', () => ({
  HubServiceTokenMissingError: class HubServiceTokenMissingError extends Error {},
  HubMisError: class HubMisError extends Error {},
}))

const ADMIN = { id: 'admin-1', role: 'ADMIN', schoolId: 'school-1', name: 'Admin' }
vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = ADMIN
    next()
  }
  return { isAuthenticated: setUser, isStaff: setUser, isAdmin: setUser }
})

const { default: studentRoutes } = await import('../src/routes/students')
const { default: hubSyncRoutes } = await import('../src/routes/hubSync')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/students', studentRoutes)
  app.use('/api/admin', hubSyncRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('provenance — students list exposes fromHub', () => {
  it('returns fromHub=true for a Hub-sourced student and false for a local one', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: 's-hub',
        firstName: 'Amina',
        lastName: 'Khan',
        externalId: null,
        allergies: null,
        medicalNotes: null,
        classId: 'c1',
        hubPupilId: 'hp1',
        class: { id: 'c1', name: '1A' },
        _count: { parentLinks: 1 },
      },
      {
        id: 's-local',
        firstName: 'Local',
        lastName: 'Pupil',
        externalId: null,
        allergies: null,
        medicalNotes: null,
        classId: 'c1',
        hubPupilId: null,
        class: { id: 'c1', name: '1A' },
        _count: { parentLinks: 0 },
      },
    ])
    prismaMock.student.count.mockResolvedValue(2)

    const res = await request(makeApp()).get('/api/students')

    expect(res.status).toBe(200)
    const byId = Object.fromEntries(res.body.students.map((s: any) => [s.id, s.fromHub]))
    expect(byId['s-hub']).toBe(true)
    expect(byId['s-local']).toBe(false)
  })
})

describe('hub-sync endpoint + status — lastSyncedAt', () => {
  const SYNCED_AT = new Date('2026-08-20T06:00:00.000Z')

  it('POST /hub-sync returns the summary and the lastSyncedAt timestamp', async () => {
    mSync.mockResolvedValue({
      yearGroups: 1,
      classes: 1,
      pupils: 1,
      staff: { created: 0, updated: 0 },
      guardians: { created: 0, linked: 0, skippedNoEmail: 0 },
      parentLinks: { created: 0, skippedNoPupil: 0 },
      teacherAssignments: { created: 0, removed: 0, unresolved: 0 },
    })
    prismaMock.school.findUnique.mockResolvedValue({ lastHubSyncAt: SYNCED_AT })

    const res = await request(makeApp()).post('/api/admin/hub-sync')

    expect(res.status).toBe(200)
    expect(res.body.summary.teacherAssignments).toEqual({ created: 0, removed: 0, unresolved: 0 })
    expect(res.body.lastSyncedAt).toBe(SYNCED_AT.toISOString())
  })

  it('GET /hub-sync/status returns the persisted lastSyncedAt', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ lastHubSyncAt: SYNCED_AT })

    const res = await request(makeApp()).get('/api/admin/hub-sync/status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ lastSyncedAt: SYNCED_AT.toISOString() })
  })

  it('GET /hub-sync/status returns null when the school has never synced', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ lastHubSyncAt: null })

    const res = await request(makeApp()).get('/api/admin/hub-sync/status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ lastSyncedAt: null })
  })
})
