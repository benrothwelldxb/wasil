import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * POST /api/inbox/upload — the ceiling, and saying so.
 *
 * Multer rejects an oversized file by throwing, and nothing handled it: the
 * parent photographing a letter got a bare 500, which reads as "the app is
 * broken" rather than "send a smaller one". The one thing they could act on was
 * the one thing we didn't tell them.
 *
 * The route itself has always accepted any signed-in user. Nothing in any
 * client called it, which is why attachments only ever went staff → parent.
 */
const prismaMock = {
  conversation: { findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))

const storageMock = { uploadFile: vi.fn(), generateKey: vi.fn() }
vi.mock('../src/services/storage', () => storageMock)

const checkUpload = vi.fn()
vi.mock('../src/services/uploadValidation', () => ({
  checkUpload: (...a: unknown[]) => checkUpload(...a),
  ATTACHMENT_MIME_TYPES: ['image/jpeg', 'application/pdf'],
}))

vi.mock('../src/middleware/auth', () => {
  const asParent = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'p-1', schoolId: 'sch-1', role: 'PARENT' }
    next()
  }
  return { isAuthenticated: asParent, isAdmin: asParent, isStaff: asParent, loadUserWithRelations: vi.fn() }
})

const { ATTACHMENT_SIZE_LIMIT } = await import('../src/middleware/attachmentUpload')
const { default: inboxRoutes } = await import('../src/routes/inbox')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inbox', inboxRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  checkUpload.mockReturnValue({ valid: true })
  storageMock.uploadFile.mockResolvedValue('https://cdn.example/inbox-attachments/x.jpg')
})

describe('a parent attaching a file', () => {
  it('accepts one and returns what sendMessage needs', async () => {
    const res = await request(makeApp())
      .post('/api/inbox/upload')
      .attach('file', Buffer.from('a tiny photo'), { filename: 'letter.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      fileName: 'letter.jpg',
      fileUrl: 'https://cdn.example/inbox-attachments/x.jpg',
      fileType: 'image/jpeg',
    })
    expect(res.body.fileSize).toBeGreaterThan(0)
  })

  // Was an unhandled throw, so a bare 500 with nothing to act on.
  it('says the file is too large, and names the limit', async () => {
    const tooBig = Buffer.alloc(ATTACHMENT_SIZE_LIMIT + 1024)
    const res = await request(makeApp())
      .post('/api/inbox/upload')
      .attach('file', tooBig, { filename: 'video.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(413)
    expect(res.body.error).toContain('too large')
    // The number a parent sees on their phone, not bytes.
    expect(res.body.error).toContain('16MB')
    expect(storageMock.uploadFile).not.toHaveBeenCalled()
  })

  it('passes a rejected type back with the reason', async () => {
    checkUpload.mockReturnValue({ valid: false, reason: 'executable content' })
    const res = await request(makeApp())
      .post('/api/inbox/upload')
      .attach('file', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/x-msdownload' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('executable content')
    expect(storageMock.uploadFile).not.toHaveBeenCalled()
  })

  it('400s when no file is sent at all', async () => {
    const res = await request(makeApp()).post('/api/inbox/upload')
    expect(res.status).toBe(400)
  })

  // An iPhone photo. Allowlisted, so it must survive the round trip — whether
  // a browser can DISPLAY heic is a rendering question, not an upload one.
  it('accepts a HEIC photo straight off a phone', async () => {
    const res = await request(makeApp())
      .post('/api/inbox/upload')
      .attach('file', Buffer.from('heic bytes'), { filename: 'IMG_0421.HEIC', contentType: 'image/heic' })

    expect(res.status).toBe(200)
    expect(res.body.fileType).toBe('image/heic')
  })
})
