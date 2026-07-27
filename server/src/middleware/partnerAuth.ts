// Partner API authentication — for external Wasil apps (e.g. Desk) that call
// Connect's narrow `/api/partner/*` surface with a Bearer partner token.
//
// The token is opaque; we store only its SHA-256 hash (see the PartnerToken
// model + scripts/mint-partner-token.ts). This is NOT a Connect user session and
// NOT a Hub JWT — it grants access only to the explicitly partner-scoped routes,
// which must never return parent data.
import { createHash } from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import prisma from '../services/prisma.js'

export interface PartnerIdentity {
  id: string
  name: string
}

export async function requirePartner(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' })
  }
  const token = authHeader.slice(7).trim()
  if (!token) return res.status(401).json({ error: 'missing_token' })

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const partner = await prisma.partnerToken.findUnique({ where: { tokenHash } })
  if (!partner || partner.revokedAt) {
    return res.status(401).json({ error: 'invalid_token' })
  }

  // Best-effort usage stamp — never block the request on it.
  prisma.partnerToken
    .update({ where: { id: partner.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  ;(req as Request & { partner?: PartnerIdentity }).partner = { id: partner.id, name: partner.name }
  next()
}
