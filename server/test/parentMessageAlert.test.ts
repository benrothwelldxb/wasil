import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * "Hi" ⏎ … "Could Amina leave at 2 on Friday?"
 *
 * Parents type the way people text. Alerting per message buzzed the teacher
 * with "Hi", then again with the substance — and the new-exchange email, which
 * only goes for the first message, said "Hi" and nothing else. A parent's
 * messages now raise ONE alert once they've stopped, carrying all of them.
 */

const prismaMock = {
  conversationMessage: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  conversation: { findUnique: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  outboxEntry: { create: vi.fn() },
  user: { findUnique: vi.fn() },
}
const sendPush = vi.fn()
const enqueueEmail = vi.fn()
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: sendPush, removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/unreadCount', () => ({ getPushBadgeCount: vi.fn(async () => 2) }))
vi.mock('../src/services/outbox', () => ({ enqueueEmail }))

const { dispatchParentMessageAlert, burstEndingAt, enqueueParentMessageAlert, PARENT_ALERT_DEBOUNCE_MS } =
  await import('../src/services/messageAlert')

const T0 = new Date('2026-11-27T08:00:00.000Z').getTime()
const at = (s: number) => new Date(T0 + s * 1000)
const row = (id: string, senderId: string, s: number, content: string, extra: Record<string, unknown> = {}) => ({
  id, senderId, createdAt: at(s), content, deletedAt: null, attachments: [], ...extra,
})

const conversation = {
  id: 'c-1', schoolId: 'sch-1', parentId: 'p-1', staffId: 'staff-1',
  mutedByParent: false, mutedByStaff: false,
  parent: { id: 'p-1', name: 'Sadia' },
  staff: { id: 'staff-1', name: 'Ms Khan', email: 'khan@school.test' },
  participants: [],
  school: { name: 'VHPS' },
}

/** A thread whose messages are `rows` (oldest first); the alert is for `forId`. */
function thread(rows: ReturnType<typeof row>[], forId: string) {
  const me = rows.find(r => r.id === forId)!
  prismaMock.conversationMessage.findUnique.mockResolvedValue({ ...me, conversationId: 'c-1' })
  prismaMock.conversationMessage.findFirst.mockResolvedValue(
    rows.find(r => r.createdAt > me.createdAt) ?? null,
  )
  prismaMock.conversationMessage.findMany.mockResolvedValue(
    rows.filter(r => r.createdAt <= me.createdAt).reverse(),
  )
}
const fire = (messageId: string) => dispatchParentMessageAlert({ conversationId: 'c-1', messageId })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.conversation.findUnique.mockResolvedValue(conversation)
  prismaMock.deviceToken.findMany.mockResolvedValue([{ token: 'tok-staff' }])
  prismaMock.conversationMessage.count.mockResolvedValue(0)
  sendPush.mockResolvedValue({ successCount: 1, failureCount: 0, failedTokens: [] })
})

describe('"Hi" then the message', () => {
  const rows = [row('m-hi', 'p-1', 0, 'Hi'), row('m-real', 'p-1', 20, 'Could Amina leave at 2 on Friday?')]

  it('the "Hi" alerts nobody, because they carried on', async () => {
    thread(rows, 'm-hi')
    await fire('m-hi')
    expect(sendPush).not.toHaveBeenCalled()
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('the last message sends ONE push with both lines', async () => {
    thread(rows, 'm-real')
    await fire('m-real')
    expect(sendPush).toHaveBeenCalledTimes(1)
    expect(sendPush.mock.calls[0][1]).toMatchObject({
      title: 'Message from Sadia',
      body: 'Hi\nCould Amina leave at 2 on Friday?',
      badge: 2,
    })
  })

  // The bug in its purest form: this email used to say "Hi".
  it('the new-exchange email carries the real message', async () => {
    thread(rows, 'm-real')
    await fire('m-real')
    expect(enqueueEmail).toHaveBeenCalledTimes(1)
    const email = enqueueEmail.mock.calls[0][1]
    expect(email.to).toBe('khan@school.test')
    expect(email.text).toContain('Could Amina leave at 2 on Friday?')
    // "Is this a new exchange?" is asked of the time BEFORE the burst, or the
    // "Hi" would count as the previous message and no email would ever go.
    const where = prismaMock.conversationMessage.count.mock.calls[0][0].where
    expect(where.createdAt.lt).toEqual(at(0))
  })

  it('sends no email when they were already talking today', async () => {
    prismaMock.conversationMessage.count.mockResolvedValue(3)
    thread(rows, 'm-real')
    await fire('m-real')
    expect(sendPush).toHaveBeenCalledTimes(1)
    expect(enqueueEmail).not.toHaveBeenCalled()
  })
})

describe('where a burst ends', () => {
  it('a message after a long pause is its own alert — the earlier one already went', async () => {
    const rows = [row('m-1', 'p-1', 0, 'Hi'), row('m-2', 'p-1', 600, 'Sorry, got distracted')]
    thread(rows, 'm-1')
    await fire('m-1')
    expect(sendPush.mock.calls[0][1].body).toBe('Hi')

    vi.clearAllMocks()
    prismaMock.conversation.findUnique.mockResolvedValue(conversation)
    prismaMock.deviceToken.findMany.mockResolvedValue([{ token: 'tok-staff' }])
    sendPush.mockResolvedValue({ successCount: 1, failureCount: 0, failedTokens: [] })
    thread(rows, 'm-2')
    await fire('m-2')
    expect(sendPush.mock.calls[0][1].body).toBe('Sorry, got distracted')
  })

  it('a teacher replying in between ends the burst', () => {
    const burst = burstEndingAt([
      row('m-3', 'p-1', 30, 'Thanks'),
      row('m-2', 'staff-1', 20, 'Yes of course'),
      row('m-1', 'p-1', 0, 'Can she leave early?'),
    ])
    expect(burst.map(m => m.id)).toEqual(['m-3'])
  })

  it('chains while each message follows the last within the window', () => {
    const w = PARENT_ALERT_DEBOUNCE_MS / 1000
    const burst = burstEndingAt([
      row('m-3', 'p-1', 2 * w - 5, 'c'),
      row('m-2', 'p-1', w - 5, 'b'),
      row('m-1', 'p-1', 0, 'a'),
    ])
    expect(burst.map(m => m.id)).toEqual(['m-1', 'm-2', 'm-3'])
  })

  it('a photo on its own reads as one in the push', async () => {
    const rows = [row('m-1', 'p-1', 0, 'Hi'), row('m-2', 'p-1', 10, '', { attachments: [{ fileType: 'image/heic' }] })]
    thread(rows, 'm-2')
    await fire('m-2')
    expect(sendPush.mock.calls[0][1].body).toBe('Hi\nSent a photo')
  })
})

describe('what it does not do', () => {
  it('tells nobody when everything they wrote was withdrawn first', async () => {
    const gone = new Date(T0 + 30_000)
    const rows = [row('m-1', 'p-1', 0, 'Hi', { deletedAt: gone }), row('m-2', 'p-1', 10, 'oops', { deletedAt: gone })]
    thread(rows, 'm-2')
    await fire('m-2')
    expect(sendPush).not.toHaveBeenCalled()
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('leaves a withdrawn line out but still sends the rest', async () => {
    const rows = [row('m-1', 'p-1', 0, 'Hi'), row('m-2', 'p-1', 10, 'wrong child', { deletedAt: at(40) })]
    thread(rows, 'm-2')
    await fire('m-2')
    expect(sendPush.mock.calls[0][1].body).toBe('Hi')
  })

  it('respects a mute set while they were still typing', async () => {
    prismaMock.conversation.findUnique.mockResolvedValue({ ...conversation, mutedByStaff: true })
    thread([row('m-1', 'p-1', 0, 'Hi there, quick question')], 'm-1')
    await fire('m-1')
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('never pushes the sender themselves', async () => {
    thread([row('m-1', 'p-1', 0, 'Hello')], 'm-1')
    await fire('m-1')
    const pushedTo = prismaMock.deviceToken.findMany.mock.calls.map(c => c[0].where.userId)
    expect(pushedTo).toEqual(['staff-1'])
  })

  // A co-guardian writing reaches the primary parent and the teacher, but the
  // new-exchange email has only ever been for the primary parent.
  it('a co-guardian writing alerts the others but sends no teacher email', async () => {
    prismaMock.conversation.findUnique.mockResolvedValue({
      ...conversation, participants: [{ userId: 'p-2', mutedAt: null, user: { name: 'Omar' } }],
    })
    thread([row('m-1', 'p-2', 0, 'Hello from Omar')], 'm-1')
    await fire('m-1')
    expect(sendPush.mock.calls[0][1].title).toBe('Message from Omar')
    expect(prismaMock.deviceToken.findMany.mock.calls.map(c => c[0].where.userId).sort()).toEqual(['p-1', 'staff-1'])
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('escapes the parent’s words in the email', async () => {
    thread([row('m-1', 'p-1', 0, '<b>urgent</b>')], 'm-1')
    await fire('m-1')
    expect(enqueueEmail.mock.calls[0][1].html).toContain('&lt;b&gt;urgent&lt;/b&gt;')
  })
})

describe('enqueueing', () => {
  it('is due one window after the message was sent', async () => {
    await enqueueParentMessageAlert('sch-1', { conversationId: 'c-1', messageId: 'm-1' }, at(0))
    expect(prismaMock.outboxEntry.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'sch-1',
        kind: 'MESSAGE_ALERT',
        payload: { conversationId: 'c-1', messageId: 'm-1' },
        runAfter: new Date(T0 + PARENT_ALERT_DEBOUNCE_MS),
      },
    })
  })
})
