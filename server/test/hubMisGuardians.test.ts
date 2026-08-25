import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Exercise the Hub MIS client's `listGuardians` at the fetch boundary: it must
// hit GET /api/v1/guardians?schoolId=… with the Bearer service token and unwrap
// the `{ guardians: [...] }` envelope into HubGuardian[] (including the nested
// pupil links). No live Hub — global fetch is stubbed.
const { listGuardians } = await import('../src/services/hubMis')

const OK = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

beforeEach(() => {
  process.env.HUB_SERVICE_TOKEN = 'wsk_test'
  process.env.HUB_MIS_URL = 'https://hub.test'
})
afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.HUB_SERVICE_TOKEN
  delete process.env.HUB_MIS_URL
})

describe('hubMis.listGuardians', () => {
  it('parses the guardian DTO (nested pupil links) and returns HubGuardian[]', async () => {
    const dto = {
      guardians: [
        {
          id: 'hg1',
          firstName: 'Layla',
          lastName: 'Khan',
          email: 'layla.khan@example.com',
          phone: '+971500000000',
          pupils: [
            { pupilId: 'hp1', relationship: 'mother', isPrimary: true },
            { pupilId: 'hp2', relationship: 'mother', isPrimary: false },
          ],
        },
        // A guardian Hub holds no email/phone for — nulls preserved.
        { id: 'hg2', firstName: 'Sam', lastName: 'Ali', email: null, phone: null, pupils: [] },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(OK(dto))
    vi.stubGlobal('fetch', fetchMock)

    const guardians = await listGuardians('hub-school-1')

    // Correct URL, method (GET default) and Bearer auth.
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hub.test/api/v1/guardians?schoolId=hub-school-1')
    expect((init as any).headers.authorization).toBe('Bearer wsk_test')

    // Envelope unwrapped; nested links intact; nulls preserved.
    expect(guardians).toEqual(dto.guardians)
    expect(guardians[0].pupils[0]).toEqual({ pupilId: 'hp1', relationship: 'mother', isPrimary: true })
    expect(guardians[1].email).toBeNull()
  })

  it('returns [] when Hub has no guardians', async () => {
    const fetchMock = vi.fn().mockResolvedValue(OK({ guardians: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listGuardians('hub-school-1')).resolves.toEqual([])
    // Nothing on page 1 → nothing to page through.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// Hub answers this feed one page at a time — a school with more guardians than
// the page size was silently truncated (observed: a flat 200). The client walks
// the pages, and every stopping condition below must hold, because Hub's paging
// contract isn't pinned on our side.
describe('hubMis.listGuardians — paging', () => {
  const PAGE = 200
  /** `count` guardians whose ids start at `start` — a realistic full page. */
  const page = (start: number, count: number = PAGE) => ({
    guardians: Array.from({ length: count }, (_, i) => ({
      id: `g${start + i}`,
      firstName: 'G',
      lastName: String(start + i),
      email: `g${start + i}@x.com`,
      phone: null,
      pupils: [],
    })),
  })
  const ids = (rows: Array<{ id: string }>) => rows.map(r => r.id)

  it('walks every page until a short one, and returns them all', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(0)))
      .mockResolvedValueOnce(OK(page(PAGE)))
      .mockResolvedValueOnce(OK(page(PAGE * 2, 5)))
    vi.stubGlobal('fetch', fetchMock)

    const guardians = await listGuardians('hub-school-1')

    expect(guardians).toHaveLength(PAGE * 2 + 5)
    expect(ids(guardians)[0]).toBe('g0')
    expect(ids(guardians).at(-1)).toBe(`g${PAGE * 2 + 4}`)
    // Page 1 is the untouched original request; the rest carry paging params.
    expect(fetchMock.mock.calls[0][0]).toBe('https://hub.test/api/v1/guardians?schoolId=hub-school-1')
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://hub.test/api/v1/guardians?schoolId=hub-school-1&limit=200&offset=200',
    )
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://hub.test/api/v1/guardians?schoolId=hub-school-1&limit=200&offset=400',
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not probe at all when the first page is not a round number', async () => {
    // 137 is nobody's page size — that's simply every guardian the school has.
    const fetchMock = vi.fn().mockResolvedValue(OK(page(0, 137)))
    vi.stubGlobal('fetch', fetchMock)

    expect(await listGuardians('hub-school-1')).toHaveLength(137)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops (does not loop) when Hub ignores the paging params and re-serves page 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue(OK(page(0)))
    vi.stubGlobal('fetch', fetchMock)

    const guardians = await listGuardians('hub-school-1')

    expect(guardians).toHaveLength(PAGE)
    // Page 1 + one probe per known style, then it gives up. No loop.
    expect(fetchMock).toHaveBeenCalledTimes(1 + 5)
  })

  it('falls back to a later style when the first yields nothing new', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(0)))        // page 1
      .mockResolvedValueOnce(OK(page(0)))        // limit/offset ignored
      .mockResolvedValueOnce(OK(page(PAGE)))     // page/pageSize works
      .mockResolvedValueOnce(OK(page(PAGE * 2, 3)))
    vi.stubGlobal('fetch', fetchMock)

    expect(await listGuardians('hub-school-1')).toHaveLength(PAGE * 2 + 3)
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://hub.test/api/v1/guardians?schoolId=hub-school-1&page=2&pageSize=200',
    )
    expect(fetchMock.mock.calls[3][0]).toBe(
      'https://hub.test/api/v1/guardians?schoolId=hub-school-1&page=3&pageSize=200',
    )
  })

  it('tries the next style when Hub rejects one outright', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(0)))
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'unknown parameter: offset', statusText: 'Bad Request' })
      .mockResolvedValueOnce(OK(page(PAGE, 7)))
    vi.stubGlobal('fetch', fetchMock)

    expect(await listGuardians('hub-school-1')).toHaveLength(PAGE + 7)
  })

  it('keeps what it has when a later page errors, instead of failing the sync', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(0)))     // page 1
      .mockResolvedValueOnce(OK(page(PAGE)))  // probe succeeds, paging adopted
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'boom', statusText: 'Bad Gateway' })
    vi.stubGlobal('fetch', fetchMock)

    expect(await listGuardians('hub-school-1')).toHaveLength(PAGE * 2)
  })

  it('drops duplicates across overlapping pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(0)))            // g0…g199
      .mockResolvedValueOnce(OK(page(PAGE - 50)))    // g150…g349 — 50 overlap
      .mockResolvedValueOnce(OK(page(PAGE * 2, 1)))
    vi.stubGlobal('fetch', fetchMock)

    const guardians = await listGuardians('hub-school-1')
    expect(new Set(ids(guardians)).size).toBe(guardians.length) // no dupes
    expect(guardians).toHaveLength(351)
  })

  it('a first page that errors still throws (a broken feed is not an empty one)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom', statusText: 'err' }))
    await expect(listGuardians('hub-school-1')).rejects.toThrow(/500/)
  })

  it('logs whatever Hub sends alongside the rows — the paging contract we are missing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OK({ ...page(0, 137), total: 512, hasMore: true })))

    await listGuardians('hub-school-1')

    expect(log.mock.calls.flat().join(' ')).toContain('total=512')
    expect(log.mock.calls.flat().join(' ')).toContain('hasMore=true')
  })

  it('says so explicitly when Hub sends no pagination metadata at all', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OK(page(0))))

    await listGuardians('hub-school-1')

    expect(log.mock.calls.flat().join(' ')).toContain('no pagination metadata')
  })
})
