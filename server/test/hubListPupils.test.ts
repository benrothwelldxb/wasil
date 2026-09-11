import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Draining the cursor is a PRECONDITION of fetching the roster school-wide,
 * not a tidy-up afterwards.
 *
 * A single page held ~412 pupils at VH against a limit of 500 — it fits by luck
 * of proportion, not design. A larger school truncates, and a truncated roster
 * is indistinguishable from a mass departure to everything downstream. So a
 * roster that cannot be read to the end throws rather than returning what
 * arrived.
 */
vi.mock('../src/services/prisma', () => ({ default: {} }))

const { listPupils, HubRosterIncompleteError } = await import('../src/services/hubMis')

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubEnv('HUB_SERVICE_TOKEN', 'wsk_test')
  vi.stubEnv('HUB_MIS_URL', 'https://hub.example')
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const page = (body: unknown) => ({ ok: true, json: async () => body })
const pupil = (id: string) => ({ id, misId: null, firstName: 'A', lastName: 'B' })

/** Query params of the nth fetch. */
const paramsOf = (n: number) => new URL(fetchMock.mock.calls[n][0] as string).searchParams

describe('listPupils', () => {
  it('asks school-wide by default — the only shape that returns leavers', async () => {
    fetchMock.mockResolvedValue(page({ pupils: [pupil('p1')], hasMore: false }))

    await listPupils('sch-1')

    const q = paramsOf(0)
    expect(q.get('schoolId')).toBe('sch-1')
    // No classId: Hub applies its current-enrolment filter only when one is
    // passed, so adding it here would silently hide every leaver.
    expect(q.get('classId')).toBeNull()
    expect(q.get('limit')).toBe('500')
  })

  it('follows the cursor to the end and returns every page', async () => {
    fetchMock
      .mockResolvedValueOnce(page({ pupils: [pupil('p1'), pupil('p2')], hasMore: true, nextCursor: 'c1' }))
      .mockResolvedValueOnce(page({ pupils: [pupil('p3')], hasMore: false, nextCursor: null }))

    const pupils = await listPupils('sch-1')

    expect(pupils.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(paramsOf(1).get('cursor')).toBe('c1')
  })

  it('stops when Hub says there is no more, even with a cursor still set', async () => {
    fetchMock.mockResolvedValue(page({ pupils: [pupil('p1')], hasMore: false, nextCursor: 'c1' }))

    expect((await listPupils('sch-1')).map(p => p.id)).toEqual(['p1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The failure that matters. Returning the short list would hand the leaver
  // sweep a roster that looks like a mass departure.
  it('THROWS rather than returning a partial roster when the cursor stalls', async () => {
    // Hub claims more but keeps returning the same rows — an ignored cursor.
    fetchMock.mockResolvedValue(page({ pupils: [pupil('p1')], hasMore: true, nextCursor: 'c1' }))

    await expect(listPupils('sch-1')).rejects.toBeInstanceOf(HubRosterIncompleteError)
    // Fails on the second page rather than spinning to the page bound: the
    // error then says what is actually wrong.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('THROWS rather than returning a partial roster when the pages never end', async () => {
    let n = 0
    fetchMock.mockImplementation(async () =>
      page({ pupils: [pupil(`p${n++}`)], hasMore: true, nextCursor: `c${n}` }),
    )

    await expect(listPupils('sch-1')).rejects.toBeInstanceOf(HubRosterIncompleteError)
    expect(fetchMock).toHaveBeenCalledTimes(20)
  })

  // A Hub that pages but omits hasMore/nextCursor reads as "one page, done" —
  // which is exactly the old behaviour, so this can never be worse than before.
  it('treats a response with no paging fields as complete', async () => {
    fetchMock.mockResolvedValue(page({ pupils: [pupil('p1')] }))

    expect((await listPupils('sch-1')).map(p => p.id)).toEqual(['p1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
