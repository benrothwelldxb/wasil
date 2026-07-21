import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Exercise the Hub-sourced "today your child has …" helper end to end without a
// DB or a live Hub. The Hub HTTP call is mocked at `global.fetch`; Prisma and
// the auth middleware are module-mocked. We assert: getClassDay parses blocks
// and maps 404 → null; the reminder table (Swimming/Library in, ordinary lesson
// out); and the route deduping sibling classes, resolving per-child items, and
// degrading to items:[] when there's no timetable / no token — using the
// school's timezone for "today".

process.env.HUB_SERVICE_TOKEN ||= 'wsk_test'
process.env.HUB_MIS_URL ||= 'https://hub.test'

function fetchResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

// A class-day with one specialist block (Swimming), one ordinary lesson
// (Maths), and one normal-subject reminder (Library).
function sampleDay(date: string) {
  return {
    version_id: 'v1',
    state_hash: 'hash',
    date,
    day: 1,
    week_label: 'A',
    blocks: [
      {
        start: '09:00',
        end: '10:00',
        label: 'Maths',
        subject: { id: 's-maths', name: 'Maths', color: null, isStatutory: true },
        specialist: false,
        block_type: 'LESSON',
      },
      {
        start: '10:00',
        end: '11:00',
        label: 'Swimming',
        subject: { id: 's-swim', name: 'Swimming', color: '#09c', isStatutory: false },
        specialist: true,
        block_type: 'SPECIALIST',
      },
      {
        start: '11:00',
        end: '12:00',
        label: 'Library',
        subject: { id: 's-lib', name: 'Library', color: null, isStatutory: false },
        specialist: false,
        block_type: 'LESSON',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// getClassDay — parse + 404 handling (real client, fetch mocked)
// ---------------------------------------------------------------------------
describe('hubMis.getClassDay', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.HUB_SERVICE_TOKEN = 'wsk_test'
  })

  it('parses the effective-day blocks on 200', async () => {
    const { getClassDay } = await import('../src/services/hubMis')
    const fetchMock = vi.fn().mockResolvedValue(fetchResponse(200, sampleDay('2026-07-13')))
    vi.stubGlobal('fetch', fetchMock)

    const day = await getClassDay('hub-school-1', 'hc-1', '2026-07-13')

    expect(day).not.toBeNull()
    expect(day!.blocks).toHaveLength(3)
    expect(day!.blocks[1]).toMatchObject({ specialist: true, subject: { name: 'Swimming' } })
    // Hit the class-based endpoint with the right query params.
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v1/timetable/effective/day')
    expect(url).toContain('class_id=hc-1')
    expect(url).toContain('schoolId=hub-school-1')
    expect(url).toContain('date=2026-07-13')
  })

  it('returns null on 404 no published timetable', async () => {
    const { getClassDay } = await import('../src/services/hubMis')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(404, { error: 'no published timetable' })))

    const day = await getClassDay('hub-school-1', 'hc-1', '2026-07-13')
    expect(day).toBeNull()
  })

  it('still throws on a real (non-404) error', async () => {
    const { getClassDay, HubMisError } = await import('../src/services/hubMis')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(500, 'boom')))
    await expect(getClassDay('hub-school-1', 'hc-1', '2026-07-13')).rejects.toBeInstanceOf(HubMisError)
  })
})

// ---------------------------------------------------------------------------
// Reminder map
// ---------------------------------------------------------------------------
describe('timetableReminders', () => {
  it('maps Swimming → kit 🩱 (specialist)', async () => {
    const { reminderForBlock } = await import('../src/services/timetableReminders')
    const item = reminderForBlock({
      subject: { id: 's', name: 'Swimming', color: null, isStatutory: false },
      specialist: true,
    })
    expect(item).toEqual({ subject: 'Swimming', specialist: true, emoji: '🩱', reminder: 'Bring swimming kit' })
  })

  it('maps Library → books 📚 (non-specialist, case-insensitive)', async () => {
    const { reminderForBlock } = await import('../src/services/timetableReminders')
    const item = reminderForBlock({
      subject: { id: 's', name: 'library', color: null, isStatutory: false },
      specialist: false,
    })
    expect(item).toMatchObject({ specialist: false, emoji: '📚', reminder: 'Bring library books' })
  })

  it('maps PE → kit 👟 including aliases', async () => {
    const { reminderForBlock } = await import('../src/services/timetableReminders')
    for (const name of ['PE', 'P.E.', 'Physical Education']) {
      const item = reminderForBlock({
        subject: { id: 's', name, color: null, isStatutory: false },
        specialist: true,
      })
      expect(item).toMatchObject({ emoji: '👟', reminder: 'Bring PE kit' })
    }
  })

  it('excludes ordinary lessons and subjectless blocks', async () => {
    const { reminderForBlock } = await import('../src/services/timetableReminders')
    expect(
      reminderForBlock({ subject: { id: 's', name: 'Maths', color: null, isStatutory: true }, specialist: false }),
    ).toBeNull()
    expect(reminderForBlock({ subject: null, specialist: false })).toBeNull()
  })

  it('remindersForBlocks keeps only reminder-worthy blocks, in order', async () => {
    const { remindersForBlocks } = await import('../src/services/timetableReminders')
    const items = remindersForBlocks(sampleDay('2026-07-13').blocks as never)
    expect(items.map((i) => i.subject)).toEqual(['Swimming', 'Library'])
  })
})

// ---------------------------------------------------------------------------
// Route — GET /api/timetable/today
// ---------------------------------------------------------------------------
const prismaMock = {
  school: { findUnique: vi.fn() },
  class: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user: unknown }).user = { id: 'parent-1', schoolId: 'connect-school-1' }
    next()
  },
  loadUserWithRelations: (...args: unknown[]) => loadUserWithRelations(...args),
}))

async function makeApp() {
  const { default: router } = await import('../src/routes/timetable')
  const { invalidateAll } = await import('../src/services/timetableCache')
  invalidateAll()
  const app = express()
  app.use(express.json())
  app.use('/api/timetable', router)
  return app
}

describe('GET /api/timetable/today', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HUB_SERVICE_TOKEN = 'wsk_test'
    prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: 'hub-school-1', timezone: 'Asia/Dubai' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('dedups a class shared by siblings and resolves per-child reminder items', async () => {
    // Two children in the same class (1A) + a third in a class with no timetable.
    loadUserWithRelations.mockResolvedValue({
      studentLinks: [
        { student: { id: 'st-1', firstName: 'Amina', lastName: 'Khan', classId: 'cc-1', class: { name: '1A' } } },
        { student: { id: 'st-2', firstName: 'Bilal', lastName: 'Khan', classId: 'cc-1', class: { name: '1A' } } },
        { student: { id: 'st-3', firstName: 'Sara', lastName: 'Ali', classId: 'cc-2', class: { name: '2B' } } },
      ],
      children: [],
    })
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'cc-1', hubClassId: 'hc-1' },
      { id: 'cc-2', hubClassId: 'hc-2' },
    ])

    const fetchMock = vi.fn(async (url: string) =>
      url.includes('class_id=hc-1')
        ? fetchResponse(200, sampleDay('2026-07-13'))
        : fetchResponse(404, { error: 'no published timetable' }),
    )
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const res = await request(await makeApp()).get('/api/timetable/today')
    expect(res.status).toBe(200)

    // hc-1 fetched once despite two siblings; hc-2 fetched once (→ 404 → []).
    const hc1Calls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes('class_id=hc-1'))
    expect(hc1Calls).toHaveLength(1)

    const byId = Object.fromEntries((res.body as { studentId: string }[]).map((c) => [c.studentId, c]))
    expect(byId['st-1'].items.map((i: { subject: string }) => i.subject)).toEqual(['Swimming', 'Library'])
    expect(byId['st-2'].items).toEqual(byId['st-1'].items)
    expect(byId['st-1'].name).toBe('Amina Khan')
    expect(byId['st-1'].className).toBe('1A')
    expect(byId['st-3'].items).toEqual([]) // no published timetable → graceful []
  })

  it('returns items:[] for a child whose class has no Hub link', async () => {
    loadUserWithRelations.mockResolvedValue({
      studentLinks: [
        { student: { id: 'st-9', firstName: 'No', lastName: 'Link', classId: 'cc-9', class: { name: '9Z' } } },
      ],
      children: [],
    })
    prismaMock.class.findMany.mockResolvedValue([{ id: 'cc-9', hubClassId: null }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const res = await request(await makeApp()).get('/api/timetable/today')
    expect(res.status).toBe(200)
    expect(res.body[0].items).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled() // no Hub id, nothing to fetch
  })

  it('returns items:[] for everyone when the service token is unset (no 500)', async () => {
    delete process.env.HUB_SERVICE_TOKEN
    loadUserWithRelations.mockResolvedValue({
      studentLinks: [
        { student: { id: 'st-1', firstName: 'Amina', lastName: 'Khan', classId: 'cc-1', class: { name: '1A' } } },
      ],
      children: [],
    })
    prismaMock.class.findMany.mockResolvedValue([{ id: 'cc-1', hubClassId: 'hc-1' }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const res = await request(await makeApp()).get('/api/timetable/today')
    expect(res.status).toBe(200)
    expect(res.body[0].items).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the school timezone for "today" at a UTC day boundary', async () => {
    // 22:30 UTC on Jul 13 is 02:30 on Jul 14 in Dubai (UTC+4). "Today" must be
    // the 14th (Dubai), not the 13th (UTC).
    // Only fake Date — supertest's loopback request relies on real setTimeout.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-13T22:30:00.000Z'))
    try {
      loadUserWithRelations.mockResolvedValue({
        studentLinks: [
          { student: { id: 'st-1', firstName: 'Amina', lastName: 'Khan', classId: 'cc-1', class: { name: '1A' } } },
        ],
        children: [],
      })
      prismaMock.class.findMany.mockResolvedValue([{ id: 'cc-1', hubClassId: 'hc-1' }])
      const fetchMock = vi.fn(async () => fetchResponse(200, sampleDay('2026-07-14')))
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

      const res = await request(await makeApp()).get('/api/timetable/today')
      expect(res.status).toBe(200)
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('date=2026-07-14')
    } finally {
      vi.useRealTimers()
    }
  })
})
