import { Router } from 'express'
import type { Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'
import { currentTermStart, isUaePhone, promptDue } from '../services/contactDetails.js'
import { parentsBySignInStatus } from '../services/parentActivation.js'

/**
 * Parents' contact corrections, for the office (see ContactChangeRequest).
 *
 *   GET  /api/admin/contact-changes?status=open|done   list
 *   GET  /api/admin/contact-changes/export.csv          open ones, for IT
 *   POST /api/admin/contact-changes/resolve { ids }     mark done
 *   GET  /api/admin/contact-changes/summary             who has confirmed
 *   GET  /api/admin/contact-changes/outstanding.csv     who hasn't, for chasing
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

/**
 * Who has answered "are your details up to date?" this round.
 *
 * "Confirmed" means exactly what the prompt means by not being due: a parent
 * who would not be asked if they opened the app now. So the two can never
 * disagree — a parent counted confirmed here is never shown the prompt.
 *
 * HEADLINE IN CHILDREN, because that is the number the school can check
 * against its roll (VHPS has ~1.5 linked adults per child, so a parent count
 * reads as inflated). A child is covered when at least ONE of their parents
 * has confirmed; adult figures go alongside. Only children on roll, only
 * real (non-test) parent accounts with a current child.
 */
export async function contactSummary(schoolId: string, now = new Date()) {
  const [school, termStart, signIn, parents] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { contactConfirmDays: true } }),
    currentTermStart(schoolId, now),
    parentsBySignInStatus(schoolId),
    prisma.user.findMany({
      where: { schoolId, role: 'PARENT', isTest: false },
      select: {
        id: true, name: true, email: true, phone: true, phoneConfirmedAt: true,
        studentLinks: {
          where: { student: { leftAt: null, isTest: false } },
          select: { student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } } },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ])
  const intervalDays = school?.contactConfirmDays ?? 0
  const enabled = intervalDays > 0

  type Child = { id: string; name: string; className: string | null; parents: string[]; confirmed: boolean; reachable: boolean }
  const children = new Map<string, Child>()
  const outstanding: Array<{
    id: string; name: string; email: string; phone: string | null; phoneReachable: boolean
    lastConfirmedAt: string | null; signedIn: boolean; children: Array<{ name: string; className: string | null }>
  }> = []
  let parentsTotal = 0
  let parentsConfirmed = 0

  for (const p of parents) {
    if (p.studentLinks.length === 0) continue // a family who has left
    parentsTotal++
    const reachable = isUaePhone(p.phone)
    const confirmed = enabled && !!p.phoneConfirmedAt && promptDue({
      now, intervalDays, lastConfirmedAt: p.phoneConfirmedAt, phone: p.phone, currentTermStart: termStart,
    }) === null
    if (confirmed) parentsConfirmed++
    const kids = p.studentLinks.map(l => ({
      id: l.student.id,
      name: `${l.student.firstName} ${l.student.lastName}`.trim(),
      className: l.student.class?.name ?? null,
    }))
    for (const k of kids) {
      const c = children.get(k.id) ?? { ...k, parents: [], confirmed: false, reachable: false }
      c.parents.push(p.name)
      c.confirmed ||= confirmed
      c.reachable ||= reachable
      children.set(k.id, c)
    }
    if (!confirmed) {
      outstanding.push({
        id: p.id, name: p.name, email: p.email, phone: p.phone, phoneReachable: reachable,
        lastConfirmedAt: p.phoneConfirmedAt?.toISOString() ?? null,
        signedIn: signIn.signedIn.has(p.id),
        children: kids.map(({ name, className }) => ({ name, className })),
      })
    }
  }

  const all = [...children.values()]
  return {
    enabled,
    /** The round being counted: since this term began, or (no term dates) the
     *  school's day count. Null start = no term dates. */
    termStart: termStart?.toISOString() ?? null,
    children: {
      total: all.length,
      confirmed: all.filter(c => c.confirmed).length,
      /** No linked parent has a number the school can ring. */
      noUaeNumber: all.filter(c => !c.reachable).length,
    },
    parents: {
      total: parentsTotal,
      confirmed: parentsConfirmed,
      outstanding: outstanding.length,
      /** Can't answer at all until they sign in to Connect. */
      outstandingNeverSignedIn: outstanding.filter(o => !o.signedIn).length,
    },
    outstanding,
    noUaeChildren: all
      .filter(c => !c.reachable)
      .map(c => ({ name: c.name, className: c.className, parents: c.parents }))
      .sort((a, b) => (a.className ?? '').localeCompare(b.className ?? '') || a.name.localeCompare(b.name)),
  }
}

router.get('/contact-changes/summary', isAdmin, async (req: Request, res: Response) => {
  try {
    res.json(await contactSummary(req.user!.schoolId))
  } catch (error) {
    console.error('Error summarising contact confirmations:', error)
    res.status(500).json({ error: 'Failed to load contact confirmations' })
  }
})

router.get('/contact-changes/outstanding.csv', isAdmin, async (req: Request, res: Response) => {
  try {
    const { outstanding } = await contactSummary(req.user!.schoolId)
    const header = ['Parent name', 'Sign-in email', 'Phone', 'UAE number', 'Children', 'Classes', 'Last confirmed', 'Signed in to Connect']
    const lines = [header.map(h => csvCell(h)).join(',')]
    for (const o of outstanding) {
      lines.push([
        csvCell(o.name),
        csvCell(o.email),
        csvCell(o.phone, { phone: true }),
        csvCell(o.phone ? (o.phoneReachable ? 'Yes' : 'No') : 'No number'),
        csvCell(o.children.map(c => c.name).join('; ')),
        csvCell([...new Set(o.children.map(c => c.className).filter(Boolean))].join('; ')),
        csvCell(o.lastConfirmedAt ? o.lastConfirmedAt.slice(0, 10) : 'Never'),
        csvCell(o.signedIn ? 'Yes' : 'No'),
      ].join(','))
    }
    const day = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="contact-not-confirmed-${day}.csv"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send('\uFEFF' + lines.join('\r\n') + '\r\n')
  } catch (error) {
    console.error('Error exporting outstanding contact confirmations:', error)
    res.status(500).json({ error: 'Failed to export' })
  }
})

export default router
