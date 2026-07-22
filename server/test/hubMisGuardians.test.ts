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

  it('returns [] when Hub has no guardians (the current live state)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(OK({ guardians: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listGuardians('hub-school-1')).resolves.toEqual([])
  })
})
