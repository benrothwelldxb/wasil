import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import express from 'express'
import request from 'supertest'

/**
 * THE INCLUSION PAGE, and the four ways it can have nothing to show.
 *
 * Only ONE of them means "no plan is currently shared with this family". The
 * other three are a missing Hub link, a family Inclusion has never mirrored,
 * and a missing credential — and rendering any of those as "no plan" is a
 * confident written statement to a parent about their child's support, made
 * by a configuration error.
 *
 * This is the same failure the "This Week" screen guards against, where an
 * unconfigured integration would have told families their child had no clubs.
 * It matters more here.
 */
const prismaMock = {
  parentStudentLink: { findMany: vi.fn(), findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  school: { findUnique: vi.fn() },
}
const sendMock = {
  fetchChildren: vi.fn(),
  fetchPlan: vi.fn(),
  fetchDocuments: vi.fn(),
  findFile: (docs: any, id: string) =>
    docs.documents.find((d: any) => d.id === id) ??
    docs.sessions.flatMap((x: any) => x.files ?? []).find((f: any) => f.id === id),
  inclusionConfigured: vi.fn(() => true),
  InclusionError: class InclusionError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'InclusionError' }
  },
  InclusionNotConfiguredError: class extends Error {},
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/sendInclusion', () => sendMock)
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'parent-1', schoolId: 'school-1' }
    next()
  },
}))
// The module gate is exercised in its own suite; here it is open so the
// states below are the thing under test.
vi.mock('../src/middleware/moduleFlag', () => ({
  requireModule: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

const { default: inclusionRoutes } = await import('../src/routes/inclusion')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inclusion', inclusionRoutes)
  return app
}

const child = () => request(makeApp()).get('/api/inclusion/child/stu-1')
const children = () => request(makeApp()).get('/api/inclusion/children')
const notFound = () => new sendMock.InclusionError(404, '{"error":"not_found"}')

beforeEach(() => {
  vi.clearAllMocks()
  sendMock.inclusionConfigured.mockReturnValue(true)
  prismaMock.user.findUnique.mockResolvedValue({ hubGuardianId: 'hub-g-1' })
  prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: 'hub-s-1' })
  prismaMock.parentStudentLink.findFirst.mockResolvedValue({
    student: { firstName: 'Maya', hubPupilId: 'hub-p-1' },
  })
  prismaMock.parentStudentLink.findMany.mockResolvedValue([
    { student: { id: 'stu-1', firstName: 'Maya', lastName: 'Khan', hubPupilId: 'hub-p-1' } },
  ])
  sendMock.fetchPlan.mockResolvedValue({ plan: null })
  sendMock.fetchDocuments.mockResolvedValue({ documents: [], sessions: [], links_expire_at: null })
  sendMock.fetchChildren.mockResolvedValue({ children: [] })
})

describe('whose child it is', () => {
  it('refuses a studentId the caller is not linked to, without asking Inclusion', async () => {
    // Inclusion has its own scope check and I am not doubting it. A family's
    // children is the thing where one guard is not enough, and Connect is the
    // app that actually owns the household.
    prismaMock.parentStudentLink.findFirst.mockResolvedValue(null)

    const res = await child()

    expect(res.status).toBe(404)
    expect(sendMock.fetchPlan).not.toHaveBeenCalled()
    expect(sendMock.fetchDocuments).not.toHaveBeenCalled()
  })

  it('asks by Hub pupil id, never Connect’s own', async () => {
    await child()
    expect(sendMock.fetchPlan).toHaveBeenCalledWith(
      expect.objectContaining({ hubPupilId: 'hub-p-1', guardianId: 'hub-g-1', hubSchoolId: 'hub-s-1' }),
    )
  })
})

describe('the four ways there is nothing to show', () => {
  it('a shared plan of null is the ONLY one that means no plan', async () => {
    sendMock.fetchPlan.mockResolvedValue({ plan: null })
    const res = await child()
    expect(res.body.state).toBe('ok')
    expect(res.body.plan).toBeNull()
  })

  it('a parent with no Hub guardian id is not asked about at all', async () => {
    // A self-registered parent. Inclusion has never heard of them, and a call
    // would 404 — which is indistinguishable from "not your child" by design,
    // so the two can only be told apart by not making the call.
    prismaMock.user.findUnique.mockResolvedValue({ hubGuardianId: null })

    const res = await child()

    expect(res.body.state).toBe('no_hub_link')
    expect(sendMock.fetchPlan).not.toHaveBeenCalled()
  })

  it('a pupil with no Hub id is not asked about either', async () => {
    prismaMock.parentStudentLink.findFirst.mockResolvedValue({
      student: { firstName: 'Maya', hubPupilId: null },
    })

    const res = await child()

    expect(res.body.state).toBe('no_hub_link')
    expect(sendMock.fetchPlan).not.toHaveBeenCalled()
  })

  it('a family Inclusion has never mirrored reads as not_known, never as no plan', async () => {
    sendMock.fetchPlan.mockRejectedValue(notFound())
    sendMock.fetchDocuments.mockRejectedValue(notFound())

    const res = await child()

    expect(res.body.state).toBe('not_known')
    expect(res.body.plan).toBeUndefined()
  })

  it('a missing credential is UNAVAILABLE, never a child with no support plan', async () => {
    // The whole reason the states exist. "Your child has no plan" must never
    // be what an unset environment variable looks like.
    sendMock.inclusionConfigured.mockReturnValue(false)

    const res = await child()

    expect(res.status).toBe(503)
    expect(res.body.state).toBe('unavailable')
  })

  it('a school with no Hub link is unavailable too', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: null })
    const res = await child()
    expect(res.status).toBe(503)
    expect(res.body.state).toBe('unavailable')
  })
})

describe('documents', () => {
  const FILE = {
    id: 'f1',
    title: 'Speech report',
    file_name: 'speech.pdf',
    document_type_label: 'Therapy report',
    created_at: '2026-10-01T09:00:00.000Z',
    view_url: 'https://wasilinclusion.com/api/v1/guardian/files/tok-abc',
    download_url: 'https://wasilinclusion.com/api/v1/guardian/files/tok-abc?save=1',
  }

  it('never hands a browser Inclusion’s own link', async () => {
    // Their URL carries a short-lived token shared by every link in the
    // response, and it works for anyone holding it. A page a parent might
    // screenshot, or a browser might sync, is no place for one.
    sendMock.fetchDocuments.mockResolvedValue({ documents: [FILE], sessions: [] })

    const res = await child()

    expect(res.body.documents[0].url).toBe('/api/inclusion/child/stu-1/file/f1')
    expect(res.body.documents[0].downloadUrl).toBe('/api/inclusion/child/stu-1/file/f1?save=1')
    expect(JSON.stringify(res.body)).not.toContain('wasilinclusion.com')
    expect(JSON.stringify(res.body)).not.toContain('tok-abc')
  })

  it('links files inside a therapy session the same way', async () => {
    sendMock.fetchDocuments.mockResolvedValue({
      documents: [],
      sessions: [{ id: 's1', provider_name: 'Speech & Language', provider_note: 'Good session', files: [FILE] }],
    })

    const res = await child()

    expect(res.body.therapySessions[0].provider_name).toBe('Speech & Language')
    expect(res.body.therapySessions[0].files[0].url).toBe('/api/inclusion/child/stu-1/file/f1')
  })

  it('marks a file past retention as unavailable rather than linking it', async () => {
    // The record survives and the file does not. The session and the note
    // still matter, so it is listed and plainly marked — never given a link
    // that fails when tapped.
    sendMock.fetchDocuments.mockResolvedValue({
      documents: [{ ...FILE, file_deleted: true, view_url: null, download_url: null }],
      sessions: [],
    })

    const res = await child()

    expect(res.body.documents[0].unavailable).toBe(true)
    expect(res.body.documents[0].url).toBeNull()
    expect(res.body.documents[0].downloadUrl).toBeNull()
  })

  it('treats a file with no link at all as unavailable too', async () => {
    sendMock.fetchDocuments.mockResolvedValue({
      documents: [{ ...FILE, view_url: null, download_url: null }],
      sessions: [],
    })

    const res = await child()

    expect(res.body.documents[0].unavailable).toBe(true)
  })
})

describe('the children list', () => {
  it('is CONNECT’s children, annotated — never Inclusion’s', async () => {
    // A child Inclusion mentions who is not on this parent's links would be
    // someone else's child, however Inclusion came to mention them.
    sendMock.fetchChildren.mockResolvedValue({
      children: [
        { pupil_id: 'hub-p-1', has_active_iep: true },
        { pupil_id: 'hub-p-999', has_active_iep: true },
      ],
    })

    const res = await children()

    expect(res.body.children).toHaveLength(1)
    expect(res.body.children[0]).toMatchObject({ id: 'stu-1', firstName: 'Maya', hasPlan: true })
  })

  it('distinguishes "Inclusion says no plan" from "Inclusion has not heard of them"', async () => {
    // false and null are different sentences to a parent, and collapsing them
    // would state an absence of provision that nobody confirmed.
    sendMock.fetchChildren.mockResolvedValue({ children: [] })

    const res = await children()

    expect(res.body.children[0].hasPlan).toBeNull()
  })

  it('treats an unmirrored guardian as nothing to show, not an error', async () => {
    sendMock.fetchChildren.mockRejectedValue(notFound())

    const res = await children()

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('not_known')
  })
})


/**
 * THE NOTICE beside a withdrawn plan.
 *
 * A parent who read their child's plan last week and finds the card gone does
 * not conclude "it was withdrawn" — they conclude the app lost it, and ring
 * the office. So Inclusion may send a sentence.
 *
 * INCLUSION COMPOSES IT, NOT CONNECT, and that is the whole design. Connect
 * cannot know whether a plan vanished because of a year rollover, a redraft,
 * or because it went to the WRONG FAMILY and is being undone — and in the last
 * case any mark at all would tell a family something true about another child,
 * at the exact moment somebody is undoing that. Inclusion knows which case it
 * is and sends a sentence only for the first two.
 */
describe('the withdrawn-plan notice', () => {
  it('passes Inclusion’s sentence through exactly as written', async () => {
    sendMock.fetchPlan.mockResolvedValue({
      plan: null,
      notice: 'Your child\u2019s plan is being updated.',
    })

    const res = await child()

    // Byte for byte, curly apostrophe included. Connect does not re-typeset a
    // sentence another app is accountable for.
    expect(res.body.notice).toBe('Your child\u2019s plan is being updated.')
    expect(res.body.plan).toBeNull()
  })

  it('says nothing at all when Inclusion says nothing', async () => {
    // Absent, not null, not an empty string — the three render differently in
    // a template and only absence is silent.
    sendMock.fetchPlan.mockResolvedValue({ plan: null })

    const res = await child()

    expect(res.body.notice).toBeUndefined()
    expect('notice' in res.body).toBe(false)
  })

  it('never invents one when a plan is simply not known', async () => {
    // not_known is Connect failing to reach an answer. Attaching a reassuring
    // sentence to it would be Connect speaking for Inclusion about a child it
    // has no information on.
    sendMock.fetchPlan.mockRejectedValue(notFound())
    sendMock.fetchDocuments.mockRejectedValue(notFound())

    const res = await child()

    expect(res.body.state).toBe('not_known')
    expect(res.body.notice).toBeUndefined()
  })
})


/**
 * THE FILE PROXY.
 *
 * TWO THINGS IT MUST NOT DO, and I got both wrong first time.
 *
 * NO AUTHORIZATION HEADER. It looks like a fetch that needs a credential and
 * it is the opposite: the file URL IS the credential, and Inclusion answers a
 * file on R2 with a 302 to a PRESIGNED R2 URL. A header would ride that
 * redirect — at best S3 rejects two auth mechanisms, at worst Connect's
 * service token is presented to Cloudflare. `fetch` is specified to strip it
 * cross-origin; this does not rely on that.
 *
 * NO STORED LINK. Every URL in a /documents response shares one short expiry,
 * so a link captured when the page was drawn is dead by the time a parent who
 * was interrupted comes back to it. The route is keyed by DOCUMENT ID and
 * mints a fresh one on each open — which also means a file withdrawn since
 * page load is simply no longer found.
 */
describe('fetching a document', () => {
  const realFetch = globalThis.fetch
  const FILE = {
    id: 'f1',
    title: 'Speech report',
    view_url: 'https://wasilinclusion.com/api/v1/guardian/files/tok-fresh',
    download_url: 'https://wasilinclusion.com/api/v1/guardian/files/tok-fresh?save=1',
  }

  afterEach(() => { globalThis.fetch = realFetch })

  function captureFetch(status = 200) {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      calls.push({ url: String(url), init })
      return {
        ok: status < 400,
        status,
        headers: new Map([['content-type', 'application/pdf']]) as any,
        body: status < 400 ? Readable.toWeb(Readable.from([Buffer.from('%PDF-1.4')])) : null,
      } as any
    }) as any
    return calls
  }

  const open = (q = '') => request(makeApp()).get(`/api/inclusion/child/stu-1/file/f1${q}`)

  beforeEach(() => {
    sendMock.fetchDocuments.mockResolvedValue({ documents: [FILE], sessions: [] })
  })

  it('sends NO Authorization header', async () => {
    process.env.SEND_SERVICE_TOKEN = 'wsk_secret'
    const calls = captureFetch()

    await open()

    expect(calls).toHaveLength(1)
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    expect(Object.keys(headers).map(k => k.toLowerCase())).not.toContain('authorization')
    expect(JSON.stringify(calls[0].init ?? {})).not.toContain('wsk_secret')
  })

  it('mints the link at the moment of opening, never reusing a stored one', async () => {
    const calls = captureFetch()
    await open()
    // The URL fetched is the one just returned by /documents, not anything
    // captured when the page was drawn.
    expect(sendMock.fetchDocuments).toHaveBeenCalled()
    expect(calls[0].url).toBe(FILE.view_url)
  })

  it('uses the download link when asked to save', async () => {
    const calls = captureFetch()
    await open('?save=1')
    expect(calls[0].url).toBe(FILE.download_url)
  })

  it('refuses a file belonging to another family, without fetching it', async () => {
    // The old token-keyed route could not do this: any signed-in parent
    // holding a link could follow it. This resolves the pupil from the
    // caller's own links first.
    prismaMock.parentStudentLink.findFirst.mockResolvedValue(null)
    const calls = captureFetch()

    const res = await open()

    expect(res.status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('404s a file id that is not among this child’s shared files', async () => {
    // Which also covers a file that WAS shared when the page was drawn and
    // has been withdrawn since.
    sendMock.fetchDocuments.mockResolvedValue({ documents: [], sessions: [] })
    const calls = captureFetch()

    const res = await open()

    expect(res.status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('reports a file past retention as gone, not as an error', async () => {
    sendMock.fetchDocuments.mockResolvedValue({
      documents: [{ ...FILE, file_deleted: true, view_url: null, download_url: null }],
      sessions: [],
    })

    const res = await open()

    expect(res.status).toBe(410)
  })

  it('finds a file that lives inside a therapy session', async () => {
    sendMock.fetchDocuments.mockResolvedValue({
      documents: [],
      sessions: [{ id: 's1', files: [FILE] }],
    })
    const calls = captureFetch()

    const res = await open()

    expect(res.status).toBe(200)
    expect(calls[0].url).toBe(FILE.view_url)
  })

  it('passes the content type through so a PDF opens as a PDF', async () => {
    captureFetch()
    const res = await open()
    expect(res.headers['content-type']).toContain('application/pdf')
  })

  it('never lets a document be cached', async () => {
    captureFetch()
    const res = await open()
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it('fetches nothing until a parent actually opens a file', async () => {
    // Inclusion writes an audit row on EVERY fetch and a SENCO reads it, so a
    // prefetch would put views in a child's access record that nobody made.
    const calls = captureFetch()

    await child()

    expect(calls).toHaveLength(0)
  })
})
