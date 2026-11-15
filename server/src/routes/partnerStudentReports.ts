import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import prisma from '../services/prisma.js'
import { requirePartner } from '../middleware/partnerAuth.js'
import type { PartnerIdentity } from '../middleware/partnerAuth.js'
import { ownerNameOf } from '../services/groupOwnership.js'
import { uploadFile, generateKey, deleteFile, extractKeyFromUrl } from '../services/storage.js'
import { announceReport, isVisibleToParents } from '../services/studentReportRelease.js'
import logger from '../services/logger.js'

/**
 * Report delivery from other Wasil apps (CP-1): Little Things (EYFS) first,
 * then Class Passport (Years 1-6).
 *
 *   PUT    /api/partner/student-reports/:sourceApp/:sourceReportId   deliver / correct
 *   DELETE /api/partner/student-reports/:sourceApp/:sourceReportId   withdraw
 *
 * The full contract, written for the sending side, is in CP-1 of
 * ~/littlethings/docs/connect-proposals.md ("Connect's final shape"). The
 * rules that matter most:
 *
 * - THE CHILD IS hubPupilId AND NOTHING ELSE. No UPN, no name, no fallback. A
 *   report delivered to the wrong child is the worst thing this endpoint could
 *   do, so an id we cannot resolve writes nothing and says which id (422).
 * - VERSIONED BY THE REPORT'S OWN COUNTER, not a clock. Strictly higher
 *   replaces the file and deletes the old object; the same version is a no-op;
 *   a lower one is ignored. All three are 2xx, because a retry cannot change
 *   any of them.
 * - publishAt holds a report from parents until then, and they are told then.
 *   Withdrawal is DELETE: it removes the file and the row, so a report
 *   scheduled in error never reaches anyone, and the sender can send it again
 *   later as if new. Moving a schedule is withdraw-then-send. There is
 *   deliberately no "move publishAt" on the same version: that would put the
 *   schedule on the content's clock.
 *
 * 404 IS NEVER RETURNED FROM INSIDE THESE HANDLERS, so a sender can read 404
 * as "this endpoint is not deployed here". 503 means retry.
 */
const router = Router()

const SOURCE_APP_RE = /^[a-z0-9][a-z0-9-]{0,49}$/
const SOURCE_REPORT_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/
const REPORT_TYPES = ['REPORT_CARD', 'PROGRESS_REPORT', 'OTHER'] as const
const MAX_BYTES = 20 * 1024 * 1024
// A time with no zone is a guess about which zone was meant. The sender knows
// the school's zone; it converts.
const ISO_WITH_ZONE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } })

/** multer, with its failures as 4xx bodies rather than a 500. */
function singlePdf(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next()
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'file_too_large', maxBytes: MAX_BYTES })
    }
    return res.status(400).json({ error: 'invalid_upload', detail: err instanceof Error ? err.message : String(err) })
  })
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function ownerOf(req: Request): string | null {
  return ownerNameOf((req as Request & { partner?: PartnerIdentity }).partner)
}

async function schoolFor(req: Request) {
  const raw = str(req.query.school_id) || str((req.body ?? {}).school_id)
  if (!raw) return { error: 'school_id required' as const }
  const school = await prisma.school.findFirst({
    where: { OR: [{ hubSchoolId: raw }, { id: raw }] },
    select: { id: true },
  })
  return school ? { school } : { unknown: raw }
}

type Stored = { id: string; version: number | null; publishAt: Date | null; notifiedAt: Date | null }

/** What the sender learns about the report as Connect now holds it. */
function stateOf(r: Stored, now = new Date()) {
  return {
    id: r.id,
    version: r.version,
    visibleToParents: isVisibleToParents(r, now),
    publishAt: r.publishAt ? r.publishAt.toISOString() : null,
    parentsNotifiedAt: r.notifiedAt ? r.notifiedAt.toISOString() : null,
  }
}

async function audit(req: Request, schoolId: string, action: 'CREATE' | 'UPDATE' | 'DELETE', resourceId: string, metadata: Record<string, unknown>) {
  const partner = (req as Request & { partner?: PartnerIdentity }).partner
  await prisma.auditLog.create({
    data: {
      userId: null,
      userName: `partner:${partner?.name ?? 'unknown'}`,
      action,
      resourceType: 'STUDENT',
      resourceId,
      metadata: JSON.parse(JSON.stringify({ kind: 'student_report', ...metadata })),
      schoolId,
    },
  }).catch(err => logger.error({ err }, 'partner report audit failed'))
}

/** Remove an object we just uploaded but will not keep. Best effort: it was
 *  never referenced by any row, so nobody holds its URL. */
async function discardUpload(fileUrl: string) {
  const key = extractKeyFromUrl(fileUrl)
  if (key) await deleteFile(key).catch(err => logger.error({ err, key }, 'unreferenced report upload not removed'))
}

router.put('/:sourceApp/:sourceReportId', requirePartner, singlePdf, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const sourceApp = str(req.params.sourceApp)
    const sourceReportId = str(req.params.sourceReportId)
    if (!SOURCE_APP_RE.test(sourceApp)) return res.status(400).json({ error: 'sourceApp must be lower-case letters, digits and hyphens' })
    if (!SOURCE_REPORT_ID_RE.test(sourceReportId)) return res.status(400).json({ error: 'sourceReportId must be 1-200 of A-Z a-z 0-9 . _ : -' })

    const resolved = await schoolFor(req)
    if ('error' in resolved) return res.status(400).json({ error: resolved.error })
    if ('unknown' in resolved) return res.status(422).json({ error: 'unknown_school', school_id: resolved.unknown })
    const schoolId = resolved.school.id

    const hubPupilId = str(body.hubPupilId)
    if (!hubPupilId) return res.status(400).json({ error: 'hubPupilId required' })

    const versionRaw = str(body.version)
    const version = /^\d{1,10}$/.test(versionRaw) ? Number(versionRaw) : NaN
    if (!Number.isSafeInteger(version) || version < 1 || version > 2_147_483_647) {
      return res.status(400).json({ error: 'version must be a positive integer (the report\'s own version, not a timestamp)' })
    }

    const file = req.file
    if (!file) return res.status(400).json({ error: 'file required (multipart field "file", a PDF)' })
    if (file.mimetype !== 'application/pdf' || file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return res.status(400).json({ error: 'file must be a PDF' })
    }

    const title = str(body.title)
    if (title.length > 200) return res.status(400).json({ error: 'title at most 200 characters' })
    const reportType = str(body.reportType) || 'REPORT_CARD'
    if (!(REPORT_TYPES as readonly string[]).includes(reportType)) {
      return res.status(400).json({ error: `reportType must be one of ${REPORT_TYPES.join(', ')}` })
    }
    const reportPeriod = str(body.reportPeriod) || null
    const academicYear = str(body.academicYear) || null
    if ((reportPeriod?.length ?? 0) > 100 || (academicYear?.length ?? 0) > 20) {
      return res.status(400).json({ error: 'reportPeriod at most 100 characters, academicYear at most 20' })
    }

    const now = new Date()
    const publishAtRaw = str(body.publishAt)
    let publishAt: Date | null = null
    if (publishAtRaw) {
      if (!ISO_WITH_ZONE_RE.test(publishAtRaw)) {
        return res.status(400).json({ error: 'publishAt must be ISO-8601 with a timezone, e.g. 2026-12-14T07:00:00+04:00' })
      }
      const d = new Date(publishAtRaw)
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'publishAt is not a valid time' })
      // A time already passed means "now". Stored as null so the report reads
      // exactly like one sent without a schedule.
      publishAt = d.getTime() > now.getTime() ? d : null
    }

    const student = await prisma.student.findFirst({
      where: { hubPupilId, schoolId },
      select: { id: true },
    })
    if (!student) {
      return res.status(422).json({
        error: 'unknown_pupil',
        hubPupilId,
        hint: 'Connect holds no pupil with this Hub id at this school. Nothing was stored. A Hub roster sync may fix it; send again afterwards.',
      })
    }

    const owner = ownerOf(req)
    const existing = await prisma.studentReport.findUnique({
      where: { schoolId_sourceApp_sourceReportId: { schoolId, sourceApp, sourceReportId } },
    })

    if (existing) {
      if (existing.managedBy !== owner) {
        return res.status(409).json({ error: 'report_managed_elsewhere', managedBy: existing.managedBy })
      }
      // Never move a report between children by replacing it. If the first
      // send went to the wrong child, the sender must withdraw it (DELETE),
      // which is a deliberate act, and send again.
      if (existing.studentId !== student.id) {
        return res.status(409).json({
          error: 'pupil_mismatch',
          hint: 'this sourceReportId is held for a different pupil. Withdraw it (DELETE) and send again.',
        })
      }
      const held = existing.version ?? 0
      if (version === held) return res.json({ status: 'unchanged', ...stateOf(existing, now) })
      if (version < held) return res.json({ status: 'stale', ...stateOf(existing, now) })
    }

    const fileName = `${(title || reportPeriod || 'Report').replace(/[^\w .()-]+/g, '').trim().slice(0, 150) || 'Report'}.pdf`
    const fileUrl = await uploadFile(file.buffer, generateKey('report-cards', fileName), 'application/pdf')

    const content = {
      fileName,
      fileUrl,
      fileSize: file.size,
      title: title || null,
      reportType,
      reportPeriod,
      academicYear,
      version,
    }

    if (!existing) {
      const releaseNow = publishAt === null
      let created
      try {
        created = await prisma.studentReport.create({
          data: {
            ...content,
            studentId: student.id,
            schoolId,
            uploadedById: null,
            sourceApp,
            sourceReportId,
            managedBy: owner,
            publishAt,
            notifiedAt: releaseNow ? now : null,
          },
        })
      } catch (err) {
        await discardUpload(fileUrl)
        // Two sends of the same new report raced; the other one won.
        if ((err as { code?: string })?.code === 'P2002') return res.status(503).json({ error: 'busy', retry: true })
        throw err
      }
      if (releaseNow) await announceReport(created, 'new')
      await audit(req, schoolId, 'CREATE', created.id, { sourceApp, sourceReportId, version, publishAt: publishAt?.toISOString() ?? null })
      return res.status(201).json({ status: 'created', ...stateOf(created, now) })
    }

    // A correction. Once parents can see a report it stays released: the
    // correction is visible at once whatever publishAt says, and announced as
    // an update. Before release, the correction's publishAt stands and nobody
    // is told until then. A report whose time has passed but which the sweep
    // has not reached yet is released here, as new, so it is announced once.
    let kind: 'new' | 'updated' | null
    let data: Record<string, unknown>
    if (existing.notifiedAt) {
      kind = 'updated'
      data = { ...content }
    } else if (isVisibleToParents(existing, now)) {
      kind = 'new'
      data = { ...content, notifiedAt: now }
    } else {
      kind = publishAt === null ? 'new' : null
      data = { ...content, publishAt, notifiedAt: kind ? now : null }
    }

    // Conditional on what we read, so a concurrent correction, or the release
    // sweep claiming it, makes this a no-op rather than a lost write or a
    // second announcement.
    const swap = await prisma.studentReport.updateMany({
      where: { id: existing.id, version: existing.version, notifiedAt: existing.notifiedAt },
      data,
    })
    if (swap.count === 0) {
      await discardUpload(fileUrl)
      return res.status(503).json({ error: 'busy', retry: true })
    }

    // The old file goes after the row points away from it. If this fails the
    // old object is orphaned, but it is an earlier version of the same child's
    // report that the same parents could already open; logged, not fatal.
    const oldKey = extractKeyFromUrl(existing.fileUrl)
    if (oldKey) await deleteFile(oldKey).catch(err => logger.error({ err, key: oldKey }, 'replaced report file not removed'))

    const updated = await prisma.studentReport.findUniqueOrThrow({ where: { id: existing.id } })
    if (kind) await announceReport(updated, kind)
    await audit(req, schoolId, 'UPDATE', existing.id, {
      sourceApp, sourceReportId, fromVersion: existing.version, version, publishAt: updated.publishAt?.toISOString() ?? null,
    })
    return res.json({ status: 'replaced', ...stateOf(updated, now) })
  } catch (error) {
    logger.error({ err: error }, 'partner report delivery failed')
    res.status(500).json({ error: 'internal_error' })
  }
})

router.delete('/:sourceApp/:sourceReportId', requirePartner, async (req: Request, res: Response) => {
  try {
    const sourceApp = str(req.params.sourceApp)
    const sourceReportId = str(req.params.sourceReportId)
    const resolved = await schoolFor(req)
    if ('error' in resolved) return res.status(400).json({ error: resolved.error })
    if ('unknown' in resolved) return res.status(422).json({ error: 'unknown_school', school_id: resolved.unknown })
    const schoolId = resolved.school.id

    const existing = await prisma.studentReport.findUnique({
      where: { schoolId_sourceApp_sourceReportId: { schoolId, sourceApp, sourceReportId } },
    })
    // Already gone (withdrawn before, or deleted by an admin) is a completed
    // withdrawal, so a retry succeeds.
    if (!existing) return res.json({ status: 'absent' })
    if (existing.managedBy !== ownerOf(req)) {
      return res.status(409).json({ error: 'report_managed_elsewhere', managedBy: existing.managedBy })
    }

    const wasVisibleToParents = isVisibleToParents(existing)
    // File first, then row, and not swallowed: see deleteReportsForStudents.
    // A failure here leaves the report in place and the sender retries.
    const key = extractKeyFromUrl(existing.fileUrl)
    if (key) await deleteFile(key)
    await prisma.studentReport.delete({ where: { id: existing.id } })

    await audit(req, schoolId, 'DELETE', existing.id, { sourceApp, sourceReportId, version: existing.version, wasVisibleToParents })
    res.json({ status: 'withdrawn', wasVisibleToParents })
  } catch (error) {
    logger.error({ err: error }, 'partner report withdrawal failed')
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
