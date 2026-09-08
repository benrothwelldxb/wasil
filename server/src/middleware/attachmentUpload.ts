import multer, { MulterError } from 'multer'
import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * One attachment, held in memory on its way to storage.
 *
 * 16MB, which is roughly four photographs from a phone or a scanned letter.
 * Defined once because it was defined three times — inbox, posts and the
 * partner API — and a ceiling that differs by route is a ceiling nobody can
 * state to a parent.
 */
export const ATTACHMENT_SIZE_LIMIT = 16 * 1024 * 1024

export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_SIZE_LIMIT },
})

/**
 * Say why the upload failed.
 *
 * Multer rejects an oversized file by throwing, and with no handler that became
 * a bare 500 — which a parent photographing a letter reads as "the app is
 * broken", and which tells them nothing about the one thing they could act on:
 * send a smaller file. The ceiling is stated in megabytes because that is the
 * number on their screen, not bytes.
 */
export function singleAttachment(field = 'file'): RequestHandler {
  const mw = attachmentUpload.single(field)
  return (req: Request, res: Response, next: NextFunction) => {
    mw(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: `That file is too large. The limit is ${Math.round(ATTACHMENT_SIZE_LIMIT / (1024 * 1024))}MB.`,
          })
        }
        return res.status(400).json({ error: `Upload rejected: ${err.message}` })
      }
      if (err) return next(err)
      next()
    })
  }
}
