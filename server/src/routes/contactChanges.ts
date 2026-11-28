import { Router } from 'express'
import type { Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'

/**
 * Parents' contact corrections, for the office (see ContactChangeRequest).
 *
 *   GET  /api/admin/contact-changes?status=open|done   list
 *   GET  /api/admin/contact-changes/export.csv          open ones, for IT
 *   POST /api/admin/contact-changes/resolve { ids }     mark done
 *
 * Connect cannot write to Hub or the MIS behind it, so the CSV is how a
 * correction reaches the school's records: IT loads it into Nexquare, Hub
 * picks it up from there, and the next Hub sync closes the request on its
 * own. "Mark done" is for when the office has made the change by hand.
 */
const router = Router()

const DONE_DAYS = 90

async function load(schoolId: string, status: 'open' | 'done') {
  const rows = await prisma.contactChangeRequest.findMany({
    where: status === 'open'
      ? { schoolId, resolvedAt: null }
      : { schoolId, resolvedAt: { gte: new Date(Date.now() - DONE_DAYS * 24 * 60 * 60 * 1000) } },
    orderBy: status === 'open' ? { createdAt: 'asc' } : { resolvedAt: 'desc' },
    take: 1000,
    include: {
      user: {
        select: {
          name: true,
          email: true,
          hubGuardianId: true,
          studentLinks: {
            select: { student: { select: { firstName: true, lastName: true, leftAt: true, class: { select: { name: true } } } } },
          },
        },
      },
    },
  })
  return rows.map(r => ({
    id: r.id,
    field: r.field as 'PHONE' | 'EMAIL',
    oldValue: r.oldValue,
    newValue: r.newValue,
    requestedAt: r.updatedAt.toISOString(),
    exportedAt: r.exportedAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolvedBy: r.resolvedBy,
    parent: {
      name: r.user.name,
      email: r.user.email,
      hubGuardianId: r.user.hubGuardianId,
      children: r.user.studentLinks
        .filter(l => !l.student.leftAt)
        .map(l => ({ name: `${l.student.firstName} ${l.student.lastName}`.trim(), className: l.student.class?.name ?? null })),
    },
  }))
}

router.get('/contact-changes', isAdmin, async (req: Request, res: Response) => {
  try {
    const status = req.query.status === 'done' ? 'done' : 'open'
    res.json({ requests: await load(req.user!.schoolId, status) })
  } catch (error) {
    console.error('Error listing contact changes:', error)
    res.status(500).json({ error: 'Failed to load contact updates' })
  }
})

/** A CSV cell. A value a spreadsheet would run as a formula is prefixed with '
 *  — except a phone number that is only digits, spaces, brackets, dashes and
 *  a leading +: it cannot be a formula, and must reach the MIS import exactly
 *  as typed. A "phone" from Hub that is anything else is escaped like text. */
export function csvCell(value: string | null | undefined, opts: { phone?: boolean } = {}): string {
  let v = value ?? ''
  const plainNumber = opts.phone && /^\+?[\d ()-]*$/.test(v)
  if (!plainNumber && /^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

router.get('/contact-changes/export.csv', isAdmin, async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId
    const rows = await load(schoolId, 'open')
    const header = [
      'Parent name', 'Hub guardian ID', 'Sign-in email', 'Children', 'Classes',
      'Field', 'Current value (school records)', 'New value', 'Requested at',
    ]
    const lines = [header.map(h => csvCell(h)).join(',')]
    for (const r of rows) {
      const phone = r.field === 'PHONE'
      lines.push([
        csvCell(r.parent.name),
        csvCell(r.parent.hubGuardianId),
        csvCell(r.parent.email),
        csvCell(r.parent.children.map(c => c.name).join('; ')),
        csvCell([...new Set(r.parent.children.map(c => c.className).filter(Boolean))].join('; ')),
        csvCell(phone ? 'Phone' : 'Email'),
        csvCell(r.oldValue, { phone }),
        csvCell(r.newValue, { phone }),
        csvCell(r.requestedAt.slice(0, 16).replace('T', ' ')),
      ].join(','))
    }
    if (rows.length > 0) {
      await prisma.contactChangeRequest.updateMany({
        where: { id: { in: rows.map(r => r.id) }, schoolId },
        data: { exportedAt: new Date() },
      })
    }
    const day = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="contact-updates-${day}.csv"`)
    res.setHeader('Cache-Control', 'no-store')
    // BOM so Excel reads names in Arabic script as UTF-8, not mojibake.
    res.send('﻿' + lines.join('\r\n') + '\r\n')
  } catch (error) {
    console.error('Error exporting contact changes:', error)
    res.status(500).json({ error: 'Failed to export contact updates' })
  }
})

router.post('/contact-changes/resolve', isAdmin, async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown): x is string => typeof x === 'string') : []
    if (ids.length === 0) return res.status(400).json({ error: 'ids required' })
    const result = await prisma.contactChangeRequest.updateMany({
      // Scoped to the admin's school and to open rows: another school's id,
      // or one already closed, is simply not matched.
      where: { id: { in: ids.slice(0, 1000) }, schoolId: req.user!.schoolId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedBy: req.user!.name || 'admin' },
    })
    res.json({ resolved: result.count })
  } catch (error) {
    console.error('Error resolving contact changes:', error)
    res.status(500).json({ error: 'Failed to mark contact updates done' })
  }
})

export default router
