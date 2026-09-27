import { describe, it, expect, vi, beforeEach } from 'vitest'
import { describeAttachments } from '../src/services/attachmentSummary'

/**
 * A file on its own is a message.
 *
 * A member of staff photographing a reading record, a signed form or a lost
 * jumper often has nothing to add to it — the file IS the message. The partner
 * reply route refused that, and refused it BEFORE attachments were even looked
 * at, so the send failed no matter what was attached.
 *
 * Desk reported the 400 as "Connect may be busy — try again in a moment", so
 * staff re-sent a file that was never going to go, and nobody connected the
 * failure to the rule. Ben: "I think that has been burning people before but
 * I've not realised that's the error." It had been costing sends for as long as
 * attachments have existed.
 *
 * And it was ASYMMETRIC, which is worse than a consistent limit: the parent
 * side already allowed a bare attachment, so a parent could send a photo to
 * staff that staff could not send back.
 */

describe('what a wordless message says in a list', () => {
  // Three readers would otherwise each invent their own sentence — the thread
  // preview, the push body, and Desk's inbox row — and the one that invents ""
  // produces a blank row, which reads as a bug rather than as a photo.
  it('names a single photo, video and file', () => {
    expect(describeAttachments([{ fileType: 'image/jpeg' }])).toBe('Sent a photo')
    expect(describeAttachments([{ fileType: 'video/mp4' }])).toBe('Sent a video')
    expect(describeAttachments([{ fileType: 'application/pdf' }])).toBe('Sent a file')
  })

  it('counts several of a kind', () => {
    expect(describeAttachments([{ fileType: 'image/png' }, { fileType: 'image/jpeg' }])).toBe('Sent 2 photos')
    expect(describeAttachments([{ fileType: 'video/mp4' }, { fileType: 'video/quicktime' }])).toBe('Sent 2 videos')
  })

  it('falls back to "files" for a mixed set', () => {
    expect(describeAttachments([{ fileType: 'image/png' }, { fileType: 'application/pdf' }])).toBe('Sent 2 files')
  })

  it('says nothing when nothing is attached, so text still wins', () => {
    expect(describeAttachments([])).toBe('')
  })

  it('does not fall over on a missing mime type', () => {
    // Uploads arrive from three clients and one of them will eventually send a
    // file with no type at all.
    expect(describeAttachments([{}])).toBe('Sent a file')
  })
})

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn() },
  conversationMessage: { create: vi.fn() },
  conversationAttachment: { createMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  notification: { create: vi.fn() },
  school: { findFirst: vi.fn() },
  ilsaLink: { findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(async () => ({ successCount: 0, invalidTokens: [] })), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), sendStaffNotification: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))

const { default: partnerRoutes } = await import('../src/routes/partner')
const express = (await import('express')).default
const request = (await import('supertest')).default

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}
const auth = (r: ReturnType<typeof request>['post'] extends never ? never : any) => r.set('Authorization', 'Bearer cpk_secret')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Lester', leftAt: null,
  })
  prismaMock.conversation.findFirst.mockResolvedValue({
    id: 'c-1', parentId: 'parent-1', staffId: 'staff-1', schoolId: 'sch-1',
    parent: { id: 'parent-1', name: 'A Parent' },
    staff: { id: 'staff-1', name: 'Ms Lester' },
    schoolContact: null,
    participants: [],
  })
  prismaMock.conversationMessage.create.mockResolvedValue({ id: 'm-1', createdAt: new Date() })
  prismaMock.conversation.update.mockResolvedValue({})
  prismaMock.conversationAttachment.createMany.mockResolvedValue({ count: 1 })
  prismaMock.deviceToken.findMany.mockResolvedValue([])
  prismaMock.notification.create.mockResolvedValue({})
})

const reply = (body: Record<string, unknown>) =>
  auth(request(makeApp()).post('/api/partner/inbox/threads/c-1/messages')).send({
    hub_user_id: 'hu-staff', ...body,
  })

describe('a staff reply that is only a file', () => {
  it('sends, where it used to 400', async () => {
    const res = await reply({
      attachments: [{ fileName: 'reading-record.jpg', fileUrl: 'https://x/1', fileType: 'image/jpeg', fileSize: 1000 }],
    })

    expect(res.status).toBeLessThan(400)
    expect(prismaMock.conversationMessage.create).toHaveBeenCalled()
  })

  it('gives the thread a preview rather than a blank row', async () => {
    await reply({
      attachments: [{ fileName: 'a.jpg', fileUrl: 'https://x/1', fileType: 'image/jpeg', fileSize: 1000 }],
    })

    const update = prismaMock.conversation.update.mock.calls[0][0]
    expect(update.data.lastMessageText).toBe('Sent a photo')
  })

  it('still refuses a reply with neither words nor files', async () => {
    const res = await reply({ content: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/write a message or attach a file/i)
    expect(prismaMock.conversationMessage.create).not.toHaveBeenCalled()
  })

  it('prefers the words when there are both', async () => {
    await reply({
      content: 'Here is the form back',
      attachments: [{ fileName: 'a.pdf', fileUrl: 'https://x/1', fileType: 'application/pdf', fileSize: 1000 }],
    })

    expect(prismaMock.conversation.update.mock.calls[0][0].data.lastMessageText).toBe('Here is the form back')
  })
})
