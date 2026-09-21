import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Sending a message that is only an attachment.
 *
 * Reported as "the file just doesn't send", which is exactly what it looked
 * like. The upload succeeded, the attachment sat in the composer, the parent
 * pressed send, and nothing happened — because this route required text, the
 * composer had always allowed an attachment without any, and the client's
 * catch block only reached the console.
 *
 * So a 400 with a perfectly clear message arrived somewhere no human would
 * ever read it. A photographed letter usually has nothing to add to it, which
 * is the single most common thing a parent attaches.
 */

const prismaMock = {
  conversation: { findFirst: vi.fn(), update: vi.fn() },
  conversationMessage: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  conversationAttachment: { createMany: vi.fn(), findMany: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/email', () => ({ sendEmail: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', async () => {
  const actual = await vi.importActual<typeof import('../src/services/uploadValidation')>('../src/services/uploadValidation')
  return actual
})
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'p-1', schoolId: 'sch-1', role: 'PARENT', name: 'Sadia' }
    next()
  }
  return { isAuthenticated: attach, isStaff: attach, isAdmin: attach, loadUserWithRelations: vi.fn() }
})

const { default: inboxRoutes } = await import('../src/routes/inbox')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inbox', inboxRoutes)
  return app
}

const send = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/inbox/conversations/c-1/messages').send(body)

const PHOTO = { fileName: 'IMG_4021.HEIC', fileUrl: 'https://r2/x', fileType: 'image/heic', fileSize: 2_400_000 }

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.conversation.findFirst.mockResolvedValue({
    id: 'c-1', schoolId: 'sch-1', parentId: 'p-1', staffId: 'staff-1',
    mutedByParent: false, mutedByStaff: false,
    parent: { id: 'p-1', name: 'Sadia' },
    staff: { id: 'staff-1', name: 'Ms Khan' },
    schoolContact: null,
    participants: [],
  })
  prismaMock.conversationMessage.create.mockResolvedValue({ id: 'm-1', createdAt: new Date('2026-09-20T09:00:00Z') })
  prismaMock.conversationMessage.count.mockResolvedValue(5)
  prismaMock.conversation.update.mockResolvedValue({})
  prismaMock.notification.create.mockResolvedValue({})
  prismaMock.deviceToken.findMany.mockResolvedValue([])
  prismaMock.conversationAttachment.findMany.mockResolvedValue([])
})

describe('POST /api/inbox/conversations/:id/messages', () => {
  it('sends a photo with no words at all', async () => {
    const res = await send({ content: '', attachments: [PHOTO] })

    expect(res.status).toBe(201)
    expect(prismaMock.conversationMessage.create).toHaveBeenCalled()
    expect(prismaMock.conversationAttachment.createMany).toHaveBeenCalled()
  })

  it('sends a photo when content is absent entirely', async () => {
    const res = await send({ attachments: [PHOTO] })

    expect(res.status).toBe(201)
  })

  // The thread list and the push both read the message text. Blank there reads
  // as nothing having arrived, which is the opposite of what happened.
  it('describes the attachment where the words would be', async () => {
    await send({ content: '', attachments: [PHOTO] })

    expect(prismaMock.conversation.update.mock.calls[0][0].data.lastMessageText).toBe('Sent a photo')
    expect(prismaMock.notification.create.mock.calls[0][0].data.body).toBe('Sent a photo')
  })

  it('counts them when there are several, and says what they are', async () => {
    await send({ content: '', attachments: [PHOTO, { ...PHOTO, fileName: 'IMG_4022.HEIC' }] })

    expect(prismaMock.conversation.update.mock.calls[0][0].data.lastMessageText).toBe('Sent 2 photos')
  })

  it('says "video" for a video, because a parent scanning a list wants to know which', async () => {
    await send({ content: '', attachments: [{ ...PHOTO, fileType: 'video/quicktime' }] })

    expect(prismaMock.conversation.update.mock.calls[0][0].data.lastMessageText).toBe('Sent a video')
  })

  // The file name is deliberately not used: IMG_4021 says less than "a photo",
  // and a scan named after a child would reach a lock screen.
  it('never puts the file name in the preview or the notification', async () => {
    await send({ content: '', attachments: [{ ...PHOTO, fileName: 'Amina-medical-letter.pdf', fileType: 'application/pdf' }] })

    expect(prismaMock.conversation.update.mock.calls[0][0].data.lastMessageText).not.toContain('Amina')
    expect(prismaMock.notification.create.mock.calls[0][0].data.body).not.toContain('Amina')
  })

  it('still prefers the parent\'s own words when there are some', async () => {
    await send({ content: 'Here is the letter', attachments: [PHOTO] })

    expect(prismaMock.conversation.update.mock.calls[0][0].data.lastMessageText).toBe('Here is the letter')
  })

  // Empty in both directions is still nothing to send, and now says so in
  // words a parent can act on rather than "Message content is required".
  it('refuses a message with neither words nor a file', async () => {
    const res = await send({ content: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Write a message or attach a file')
    expect(prismaMock.conversationMessage.create).not.toHaveBeenCalled()
  })
})
