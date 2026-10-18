import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  inclusionConfigured: vi.fn(() => true),
  fileUrl: (t: string) => `https://inclusion.example/api/v1/guardian/files/${t}`,
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
  sendMock.fetchDocuments.mockResolvedValue({ documents: [], therapy_sessions: [] })
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
  it('never hands a browser the service token — links go through Connect', async () => {
    sendMock.fetchDocuments.mockResolvedValue({
      documents: [{ id: 'd1', title: 'Speech report', file_token: 'tok-abc' }],
      therapy_sessions: [],
    })

    const res = await child()

    expect(res.body.documents[0].url).toBe('/api/inclusion/file/tok-abc')
    // The upstream token must not travel to the client under its own name.
    expect(res.body.documents[0].file_token).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain('inclusion.example')
  })

  it('rewrites links inside therapy sessions too', async () => {
    sendMock.fetchDocuments.mockResolvedValue({
      documents: [],
      therapy_sessions: [{ id: 's1', documents: [{ id: 'd2', title: 'OT notes', file_token: 'tok-xyz' }] }],
    })

    const res = await child()

    expect(res.body.therapySessions[0].documents[0].url).toBe('/api/inclusion/file/tok-xyz')
  })

  it('leaves a document with no file as having no link, rather than a broken one', async () => {
    sendMock.fetchDocuments.mockResolvedValue({
      documents: [{ id: 'd3', title: 'Pending upload', file_token: null }],
      therapy_sessions: [],
    })

    const res = await child()

    expect(res.body.documents[0].url).toBeNull()
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
