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
  const page = (ids: string[]) => ({
    guardians: ids.map(id => ({ id, firstName: 'G', lastName: id, email: `${id}@x.com`, phone: null, pupils: [] })),
  })

  it('walks every page until a short one, and returns them all', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(['a', 'b'])))
      .mockResolvedValueOnce(OK(page(['c', 'd'])))
      .mockResolvedValueOnce(OK(page(['e'])))
    vi.stubGlobal('fetch', fetchMock)

    const guardians = await listGuardians('hub-school-1')

    expect(guardians.map(g => g.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    // Page 1 is the untouched original request; the rest carry limit/offset.
    expect(fetchMock.mock.calls[0][0]).toBe('https://hub.test/api/v1/guardians?schoolId=hub-school-1')
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://hub.test/api/v1/guardians?schoolId=hub-school-1&limit=2&offset=2',
    )
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://hub.test/api/v1/guardians?schoolId=hub-school-1&limit=2&offset=4',
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops (does not loop) when Hub ignores the paging params and re-serves page 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue(OK(page(['a', 'b'])))
    vi.stubGlobal('fetch', fetchMock)

    const guardians = await listGuardians('hub-school-1')

    expect(guardians.map(g => g.id)).toEqual(['a', 'b'])
    // Page 1 + one probe per known style, then it gives up. No loop.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('falls back to the page/pageSize style when limit/offset yields nothing new', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(['a', 'b'])))       // page 1
      .mockResolvedValueOnce(OK(page(['a', 'b'])))       // limit/offset ignored
      .mockResolvedValueOnce(OK(page(['c', 'd'])))       // page/pageSize works
      .mockResolvedValueOnce(OK(page(['e'])))            // …and pages on
    vi.stubGlobal('fetch', fetchMock)

    expect((await listGuardians('hub-school-1')).map(g => g.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://hub.test/api/v1/guardians?schoolId=hub-school-1&page=2&pageSize=2',
    )
    expect(fetchMock.mock.calls[3][0]).toBe(
      'https://hub.test/api/v1/guardians?schoolId=hub-school-1&page=3&pageSize=2',
    )
  })

  it('tries the next style when Hub rejects the first outright', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(['a', 'b'])))
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'unknown parameter: offset', statusText: 'Bad Request' })
      .mockResolvedValueOnce(OK(page(['c'])))
    vi.stubGlobal('fetch', fetchMock)

    expect((await listGuardians('hub-school-1')).map(g => g.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps what it has when a later page errors, instead of failing the sync', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(['a', 'b'])))   // page 1
      .mockResolvedValueOnce(OK(page(['c', 'd'])))   // probe succeeds, paging adopted
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'boom', statusText: 'Bad Gateway' })
    vi.stubGlobal('fetch', fetchMock)

    expect((await listGuardians('hub-school-1')).map(g => g.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops duplicates across overlapping pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OK(page(['a', 'b'])))
      .mockResolvedValueOnce(OK(page(['b', 'c'])))
      .mockResolvedValueOnce(OK(page(['c'])))
    vi.stubGlobal('fetch', fetchMock)

    expect((await listGuardians('hub-school-1')).map(g => g.id)).toEqual(['a', 'b', 'c'])
  })

  it('a first page that errors still throws (a broken feed is not an empty one)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom', statusText: 'err' }))
    await expect(listGuardians('hub-school-1')).rejects.toThrow(/500/)
  })
})
