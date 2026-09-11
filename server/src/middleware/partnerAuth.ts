// Partner API authentication — for external Wasil apps (Desk, Active) that call
// Connect's `/api/partner/*` surface with a Bearer partner token.
//
// The token is opaque; we store only its SHA-256 hash (see the PartnerToken
// model + scripts/mint-partner-token.ts). This is NOT a Connect user session and
// NOT a Hub JWT.
//
// It used to say this surface "must never return parent data". That stopped
// being true some time ago: it now carries staff↔parent correspondence, every
// pupil with their guardians, a family's whole correspondence for an inspection
// pack, and the ILSA safeguarding threads. Since every valid token reached every
// route — `req.partner` was resolved here and then read by none of the 34
// handlers — a token minted for an app that only needed to create contact groups
// would have opened all of it.
//
// So a token now carries what it may call. Both lists are allowlists and EMPTY
// MEANS UNRESTRICTED, which keeps tokens minted before this working unchanged;
// a new token should always be minted with both set.
import { createHash } from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import prisma from '../services/prisma.js'

export interface PartnerIdentity {
  id: string
  name: string
}

/** Does `path` sit under `prefix`, on whole segments? "/api/partner/groups"
 *  covers "/api/partner/groups" and "/api/partner/groups/g-1", and NOT
 *  "/api/partner/groupsomething". */
function underPrefix(path: string, prefix: string): boolean {
  const p = prefix.replace(/\/+$/, '')
  return path === p || path.startsWith(p + '/')
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

  // The path as the CALLER wrote it. `req.path` alone is relative to whichever
  // router this runs inside, so a prefix expressed the way the partner's own
  // docs express it would never match.
  const fullPath = (req.baseUrl + req.path).replace(/\/+$/, '') || '/'

  const prefixes = partner.allowedPrefixes ?? []
  const methods = partner.allowedMethods ?? []
  const prefixOk = prefixes.length === 0 || prefixes.some((p) => underPrefix(fullPath, p))
  const methodOk = methods.length === 0 || methods.includes(req.method.toUpperCase())

  if (!prefixOk || !methodOk) {
    // 403, not 404. The partner surface is documented to the apps that call it,
    // so hiding a route's existence from a holder of a valid token buys nothing
    // — and a clear refusal is what stops someone debugging the wrong layer for
    // an afternoon. The token is still valid; it just isn't for this.
    return res.status(403).json({ error: 'token_not_permitted' })
  }

  ;(req as Request & { partner?: PartnerIdentity }).partner = { id: partner.id, name: partner.name }
  next()
}
