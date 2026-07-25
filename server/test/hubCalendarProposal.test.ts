import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Exercise the Hub calendar propose-client (submitProposal) with `fetch` stubbed
// — no live Hub. Asserts it POSTs to the proposals endpoint with the Bearer
// service token and the exact body, returns the proposal_id/status, and throws
// (so the caller won't persist) on a non-2xx or an unset token.
const { submitProposal } = await import('../src/services/hubCalendar')

const OK_BODY = { proposal_id: 'prop-42', status: 'PENDING' as const }

beforeEach(() => {
  process.env.HUB_SERVICE_TOKEN = 'wsk_test'
  process.env.HUB_MIS_URL = 'https://hub.example.test'
})
afterEach(() => {
  delete process.env.HUB_SERVICE_TOKEN
  delete process.env.HUB_MIS_URL
  vi.restoreAllMocks()
})

describe('submitProposal', () => {
  it('POSTs the proposal to the Hub endpoint with Bearer token + JSON body and returns the result', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(OK_BODY), { status: 202, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const input = {
      school_id: 'hub-sch-1',
      title: 'Class Bake Sale',
      starts_at: '2026-09-10T05:00:00.000Z',
      ends_at: '2026-09-10T07:00:00.000Z',
      all_day: false,
      class_ids: ['hub-cls-A'],
      submitter_name: 'Ms Teacher',
      submitter_email: 'teacher@vhps.ae',
    }
    const result = await submitProposal(input)

    expect(result).toEqual(OK_BODY)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as [string, any]
    expect(url).toBe('https://hub.example.test/api/v1/calendar/events/proposals')
    expect(opts.method).toBe('POST')
    expect(opts.headers.authorization).toBe('Bearer wsk_test')
    expect(opts.headers['content-type']).toBe('application/json')
    expect(JSON.parse(opts.body)).toEqual(input)
  })

  it('throws on a non-2xx response so the caller never persists a local row', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))
    await expect(submitProposal({ school_id: 's', title: 't', starts_at: 'a', ends_at: 'b' })).rejects.toThrow()
  })

  it('throws when the service token is unset', async () => {
    delete process.env.HUB_SERVICE_TOKEN
    vi.stubGlobal('fetch', vi.fn())
    await expect(submitProposal({ school_id: 's', title: 't', starts_at: 'a', ends_at: 'b' })).rejects.toThrow()
  })
})
