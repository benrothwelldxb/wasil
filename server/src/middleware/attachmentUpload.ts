import multer, { MulterError } from 'multer'
import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * One attachment, held in memory on its way to storage.
 *
 * Defined once because it was defined three times — inbox, posts and the
 * partner API — and a ceiling that differs by route is a ceiling nobody can
 * state to a parent.
 *
 * 100MB, raised from 16MB when video became attachable: 16MB is a few seconds
 * of phone video, so allowing video without raising this would have been
 * allowing it in name only.
 *
 * TWO THINGS THIS NUMBER DEPENDS ON, both outside this file:
 *
 * 1. Cloudflare sits in front of the API and caps request bodies at 100MB on
 *    Free/Pro plans. A 100MB file plus multipart overhead exceeds that, so the
 *    real ceiling is a little under — Cloudflare rejects it before Express
 *    sees it, and its 413 will not carry the friendly message below. Anything
 *    at the very top of this range wants testing against production rather
 *    than against localhost.
 *
 * 2. multer.memoryStorage holds the whole file in RAM. One 100MB upload is
 *    fine; several at once is a container's memory budget. If parents start
 *    sending video in volume, this wants streaming to storage rather than a
 *    bigger number.
 */
export const ATTACHMENT_SIZE_LIMIT = 100 * 1024 * 1024

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
