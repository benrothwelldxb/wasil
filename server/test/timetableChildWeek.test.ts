import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Exercise GET /api/timetable/child/:studentId/week — the parent-app weekly
// child timetable. Prisma, the auth middleware, and the per-class-per-day cache
// (getClassDayCached) are module-mocked; no DB or live Hub. We assert: the
// Mon–Fri days are assembled for the parent's own child with blocks mapped to
// the parent-facing shape; a studentId that isn't the requester's child is 404;
// and a Hub-unavailable week degrades to hubAvailable:false + empty days (200).

process.env.HUB_SERVICE_TOKEN ||= 'wsk_test'

// A full effective-day block, carrying every field the endpoint reads (id,
// teacher, teachers, room, week) plus a non-lesson block (subject === null).
function sampleDay(date: string) {
  return {
    version_id: 'v1',
    state_hash: 'hash',
    date,
    day: 1,
    week_label: 'A',
    blocks: [
      {
        id: 'blk-reg',
        start: '08:30',
        end: '08:40',
        label: 'Registration',
        subject: null,
        teacher: null,
        teachers: [],
        room: null,
        week: 'ALL',
        specialist: false,
        block_type: 'REGISTRATION',
      },
      {
        id: 'blk-arabic',
        start: '08:40',
        end: '09:20',
        label: 'Arabic A&B',
        subject: { id: 's-ar', name: 'Arabic A&B', color: null, isStatutory: false },
        teacher: { firstName: 'Rahaf', lastName: 'Ktaish' },
        teachers: [{ firstName: 'Rahaf', lastName: 'Ktaish' }],
        room: 'Room 3',
        week: 'ALL',
        specialist: true,
        block_type: 'SPECIALIST',
      },
    ],
  }
}

const prismaMock = {
  school: { findUnique: vi.fn() },
  class: { findUnique: vi.fn() },
  subjectReminder: { findMany: vi.fn() },
  timetableOverride: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

// Mock the shared per-class-per-day cache directly (the task's approach).
const getClassDayCached = vi.fn()
vi.mock('../src/services/timetableCache', () => ({
  getClassDayCached: (...args: unknown[]) => getClassDayCached(...args),
  invalidateAll: () => {},
  invalidateSchool: () => {},
}))

const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user: unknown }).user = { id: 'parent-1', schoolId: 'connect-school-1' }
    next()
  }
  return {
    isAuthenticated: setUser,
    isAdmin: setUser,
    loadUserWithRelations: (...args: unknown[]) => loadUserWithRelations(...args),
  }
})

async function makeApp() {
  const { default: router } = await import('../src/routes/timetable')
  const app = express()
  app.use(express.json())
  app.use('/api/timetable', router)
  return app
}

describe('GET /api/timetable/child/:studentId/week', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HUB_SERVICE_TOKEN = 'wsk_test'
    prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: 'hub-school-1', timezone: 'Asia/Dubai' })
    prismaMock.class.findUnique.mockResolvedValue({ hubClassId: 'hc-1' })
    // The requester owns st-1 (in class cc-1).
    loadUserWithRelations.mockResolvedValue({
      studentLinks: [
        { student: { id: 'st-1', firstName: 'Amina', lastName: 'Khan', classId: 'cc-1', class: { name: '1A' } } },
      ],
      children: [],
    })
  })

  it('assembles Mon–Fri days for the parent’s own child, mapping blocks', async () => {
    getClassDayCached.mockImplementation(async (_school: string, _class: string, date: string) => sampleDay(date))

    const res = await request(await makeApp()).get('/api/timetable/child/st-1/week?weekOf=2026-09-02')
    expect(res.status).toBe(200)
    expect(res.body.studentId).toBe('st-1')
    expect(res.body.studentName).toBe('Amina Khan')
    expect(res.body.className).toBe('1A')
    expect(res.body.hubAvailable).toBe(true)
    expect(res.body.weekOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Five weekdays, Mon(1)…Fri(5), in order.
    expect(res.body.days.map((d: { weekday: number }) => d.weekday)).toEqual([1, 2, 3, 4, 5])
    // One Hub fetch per weekday.
    expect(getClassDayCached).toHaveBeenCalledTimes(5)

    // Blocks mapped to the parent-facing shape (lesson + non-lesson).
    const day0 = res.body.days[0]
    expect(day0.date).toBe(res.body.weekOf) // first day is the Monday
    expect(day0.blocks).toEqual([
      {
        id: 'blk-reg',
        start: '08:30',
        end: '08:40',
        label: 'Registration',
        subject: null,
        teacher: null,
        room: null,
        specialist: false,
        blockType: 'REGISTRATION',
      },
      {
        id: 'blk-arabic',
        start: '08:40',
        end: '09:20',
        label: 'Arabic A&B',
        subject: { name: 'Arabic A&B', color: null },
        teacher: { firstName: 'Rahaf', lastName: 'Ktaish' },
        room: 'Room 3',
        specialist: true,
        blockType: 'SPECIALIST',
      },
    ])
  })

  it('rejects a studentId that is not one of the requester’s children (404)', async () => {
    getClassDayCached.mockResolvedValue(sampleDay('2026-09-02'))

    const res = await request(await makeApp()).get('/api/timetable/child/st-999/week')
    expect(res.status).toBe(404)
    expect(getClassDayCached).not.toHaveBeenCalled()
  })

  it('degrades to hubAvailable:false with empty days when Hub answers no day (200, not 500)', async () => {
    // No published timetable for any weekday → the cache resolves null.
    getClassDayCached.mockResolvedValue(null)

    const res = await request(await makeApp()).get('/api/timetable/child/st-1/week?weekOf=2026-09-02')
    expect(res.status).toBe(200)
    expect(res.body.hubAvailable).toBe(false)
    expect(res.body.days).toEqual([])
  })
})
