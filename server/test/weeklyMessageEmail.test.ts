import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Emailing the principal's weekly update.
 *
 * Push reaches only the families who installed the app and left notifications
 * on. For most things that is the right trade — but the weekly update is often
 * the one piece of writing a school most wants read, and the parents who miss
 * it are disproportionately the ones already hardest to reach.
 *
 * THE PREFERENCE IS HONOURED, and that is a deliberate reading rather than an
 * oversight. The switch a parent turned off is labelled "weekly updates" — it
 * names the CONTENT, not the channel — so treating email as a way around it
 * would be using a technicality against somebody's stated wish. A school that
 * must reach an opted-out family has the office and the telephone.
 */

const prismaMock = {
  school: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const enqueueEmail = vi.fn(async () => undefined)
vi.mock('../src/services/outbox', () => ({ enqueueEmail, enqueuePush: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (h: string) => h }))

const { emailWeeklyMessage } = await import('../src/services/weeklyMessageEmail')

const send = (over: Record<string, unknown> = {}) =>
  emailWeeklyMessage({
    schoolId: 'sch-1',
    messageId: 'wm-1',
    title: 'Week ending 3 October',
    content: 'Sports Day is **Thursday**.',
    ...over,
  })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.school.findUnique.mockResolvedValue({ name: 'VHPS' })
  prismaMock.user.findMany.mockResolvedValue([
    { id: 'p-1', email: 'a@x.com' },
    { id: 'p-2', email: 'b@x.com' },
  ])
  prismaMock.notificationPreference.findMany.mockResolvedValue([])
})

describe('who it reaches', () => {
  it('emails every parent who has not opted out', async () => {
    const r = await send()

    expect(r.sent).toBe(2)
    expect(enqueueEmail).toHaveBeenCalledTimes(2)
  })

  it('SKIPS a parent who turned weekly updates off', async () => {
    prismaMock.notificationPreference.findMany.mockResolvedValue([{ userId: 'p-2' }])

    const r = await send()

    expect(r.sent).toBe(1)
    expect(r.optedOut).toBe(1)
    expect(enqueueEmail.mock.calls.map(c => (c[1] as { to: string }).to)).toEqual(['a@x.com'])
  })

  it('never emails a test account', async () => {
    await send()

    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.isTest).toBe(false)
    expect(where.role).toBe('PARENT')
  })

  it('one bad address does not stop the rest', async () => {
    // Four hundred families should not lose their update because one mailbox
    // is malformed.
    enqueueEmail.mockRejectedValueOnce(new Error('bad address'))

    const r = await send()

    expect(r.sent).toBe(1)
    expect(enqueueEmail).toHaveBeenCalledTimes(2)
  })
})

describe('what the email says', () => {
  it('renders the markdown rather than showing its markers', async () => {
    // "Sports Day is **Thursday**" with the asterisks showing reads as a
    // broken system; with the emphasis stripped it loses the part the writer
    // used to say what mattered.
    await send()

    const payload = enqueueEmail.mock.calls[0][1] as { html: string }
    expect(payload.html).toContain('<strong>Thursday</strong>')
    expect(payload.html).not.toContain('**Thursday**')
  })

  it('keeps the markdown in the plain-text part', async () => {
    // A text-only client sees "**Thursday**" rather than nothing, and we avoid
    // maintaining a second renderer that could disagree with the first.
    await send()

    const payload = enqueueEmail.mock.calls[0][1] as { text: string }
    expect(payload.text).toContain('**Thursday**')
  })

  it('escapes the title rather than trusting it', async () => {
    // "Parents & Carers Evening" is the common case; a stray angle bracket
    // should not be able to reshape the message.
    await send({ title: 'Parents & Carers <Evening>' })

    const payload = enqueueEmail.mock.calls[0][1] as { html: string; subject: string }
    expect(payload.html).toContain('Parents &amp; Carers &lt;Evening&gt;')
    expect(payload.subject).toBe('VHPS: Parents & Carers <Evening>')
  })

  it('tells the reader how to stop them', async () => {
    await send()
    const payload = enqueueEmail.mock.calls[0][1] as { html: string }
    expect(payload.html).toMatch(/turn these off/i)
  })
})

describe('when there is nobody to email', () => {
  it('does nothing and says so', async () => {
    prismaMock.user.findMany.mockResolvedValue([])

    const r = await send()

    expect(r).toEqual({ sent: 0, optedOut: 0 })
    expect(enqueueEmail).not.toHaveBeenCalled()
  })
})
