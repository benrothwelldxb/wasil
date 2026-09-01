import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, verifyProviderAccessToken } from '../services/jwt.js'
import prisma from '../services/prisma.js'

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string
      email: string
      name: string
      role: 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN' | 'ILSA'
      schoolId: string
      preferredLanguage: string
    }
    interface Request {
      // Set by requireProvider for external provider-portal requests. Distinct
      // from `user` (staff/parent) so the two principal types never mix.
      providerUser?: {
        id: string
        providerId: string
      }
      /** True when a school ADMIN is acting on a provider through the portal
       * routes (see requireProviderOrSchoolAdmin). `providerUser.id` is then the
       * ADMIN's user id, not a ProviderUser — so any handler touching the
       * signed-in provider person must branch on this. */
      providerActingAdmin?: boolean
    }
  }
}

// Full user type with relations – used by routes that call loadUserWithRelations()
export interface UserWithRelations extends Express.User {
  children?: Array<{
    id: string
    name: string
    classId: string
    class: {
      id: string
      name: string
    }
  }>
  studentLinks?: Array<{
    studentId: string
    student: {
      id: string
      firstName: string
      lastName: string
      classId: string
      /** Hub pupil id — present on Hub-synced pupils, null on Connect-only ones.
       * The whole Student row is selected, so this is always populated. */
      hubPupilId?: string | null
      class: {
        id: string
        name: string
        /** The whole Class row is selected, so this is populated; it is null
         * only for a class that sits in no year group. */
        yearGroupId?: string | null
      }
    }
  }>
  assignedClasses?: Array<{
    classId: string
    class: {
      id: string
      name: string
    }
  }>
}

/**
 * Load full user with children, studentLinks, and assignedClasses.
 * Call this in route handlers that need the related data instead of
 * relying on the auth middleware to eager-load everything.
 */
export async function loadUserWithRelations(userId: string): Promise<UserWithRelations | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      children: { include: { class: true } },
      studentLinks: { include: { student: { include: { class: true } } } },
      assignedClasses: { include: { class: true } },
    },
  }) as Promise<UserWithRelations | null>
}

export async function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const token = authHeader.slice(7)
    const payload = verifyAccessToken(token)

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        schoolId: true,
        preferredLanguage: true,
        lastSeenAt: true,
      },
    })

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    req.user = user as Express.User

    // Throttled, fire-and-forget last-seen stamp for launch analytics. Only
    // write when we have no timestamp or it is older than ~10 minutes, so an
    // active session doesn't trigger a DB write per request. Never awaited and
    // errors are swallowed so tracking can never delay or fail a response.
    const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1000
    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      prisma.user
        .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {})
    }
    // Enrich the per-request logger so every subsequent log line carries
    // schoolId/userId/role — invaluable when debugging a specific parent's
    // complaint from prod logs.
    const reqAny = req as Request & { log?: { child: (bindings: Record<string, unknown>) => unknown } }
    if (reqAny.log?.child) {
      reqAny.log = reqAny.log.child({
        userId: user.id,
        schoolId: user.schoolId,
        role: user.role,
      }) as typeof reqAny.log
    }
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

// Helper: ensure JWT is parsed before role checks
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.user) return next()
  isAuthenticated(req, res, next)
}

// Staff or higher (STAFF, ADMIN, SUPER_ADMIN)
export function isStaff(req: Request, res: Response, next: NextFunction) {
  ensureAuthenticated(req, res, () => {
    if (req.user && ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      return next()
    }
    res.status(403).json({ error: 'Forbidden - Staff access required' })
  })
}

// Admin or higher (ADMIN, SUPER_ADMIN)
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  ensureAuthenticated(req, res, () => {
    if (req.user && (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN')) {
      return next()
    }
    res.status(403).json({ error: 'Forbidden - Admin access required' })
  })
}

export function isSuperAdmin(req: Request, res: Response, next: NextFunction) {
  ensureAuthenticated(req, res, () => {
    if (req.user && req.user.role === 'SUPER_ADMIN') {
      return next()
    }
    res.status(403).json({ error: 'Forbidden - Super Admin access required' })
  })
}

/**
 * Authenticate an external provider-portal request. Verifies a provider-kind
 * JWT (verifyProviderAccessToken rejects staff/parent tokens), confirms the
 * ProviderUser and its Provider are still active, and attaches req.providerUser.
 * Every provider route MUST scope its queries by req.providerUser.providerId.
 */
/**
 * The provider portal, reachable by the PROVIDER or by the school's own ADMIN.
 *
 * A school needs to set a provider up — profile, clubs, menus — before handing
 * them the keys, and to fix things afterwards without waiting on them. Rather
 * than duplicate fifteen handlers behind an admin guard (two code paths that
 * would drift), an admin acts on ONE named provider through the same routes:
 *
 *   ?provider_id=<id>   (or provider_id in the body)
 *
 * The provider must belong to the admin's OWN school — that check is the whole
 * security boundary here, so it is not optional and not caller-supplied.
 * `req.providerActingAdmin` marks the request so the few handlers that touch the
 * signed-in PROVIDER USER (their personal name, the bookings audit trail) don't
 * mistake an admin for one.
 */
export async function requireProviderOrSchoolAdmin(req: Request, res: Response, next: NextFunction) {
  const providerIdParam =
    (typeof req.query.provider_id === 'string' && req.query.provider_id.trim()) ||
    (typeof (req.body as Record<string, unknown> | undefined)?.provider_id === 'string' &&
      ((req.body as Record<string, string>).provider_id || '').trim()) ||
    ''

  // No provider_id → this is an ordinary provider session; unchanged behaviour.
  if (!providerIdParam) return requireProvider(req, res, next)

  // With one, authenticate as a Connect admin instead.
  return isAdmin(req, res, async () => {
    const admin = req.user!
    // A provider serves many schools (ProviderSchoolLink), so "mine" means a
    // link to THIS admin's school — never the provider row alone.
    const link = await prisma.providerSchoolLink.findFirst({
      where: { providerId: providerIdParam, schoolId: admin.schoolId },
      select: { providerId: true },
    })
    // Unknown, or another school's — same answer either way, so admins can't
    // probe for provider ids outside their school.
    if (!link) return res.status(404).json({ error: 'Provider not found' })

    req.providerUser = { id: admin.id, providerId: link.providerId }
    req.providerActingAdmin = true
    next()
  })
}

export async function requireProvider(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const payload = verifyProviderAccessToken(authHeader.slice(7))

    const providerUser = await prisma.providerUser.findUnique({
      where: { id: payload.providerUserId },
      select: { id: true, providerId: true, provider: { select: { status: true } } },
    })

    if (!providerUser || providerUser.providerId !== payload.providerId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (providerUser.provider.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Provider account is suspended' })
    }

    req.providerUser = { id: providerUser.id, providerId: providerUser.providerId }

    const reqAny = req as Request & { log?: { child: (bindings: Record<string, unknown>) => unknown } }
    if (reqAny.log?.child) {
      reqAny.log = reqAny.log.child({
        providerUserId: providerUser.id,
        providerId: providerUser.providerId,
      }) as typeof reqAny.log
    }
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

// Check if user can send to a specific class or whole school
export async function canSendToTarget(req: Request, res: Response, next: NextFunction) {
  const user = req.user
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { targetClass, classId } = req.body

  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return next()
  }

  if (user.role === 'STAFF') {
    if (targetClass === 'Whole School') {
      return res.status(403).json({ error: 'Only admins can send whole-school messages' })
    }

    if (classId) {
      const assignedClasses = await prisma.staffClassAssignment.findMany({
        where: { userId: user.id },
        select: { classId: true },
      })
      const assignedClassIds = assignedClasses.map(ac => ac.classId)
      if (!assignedClassIds.includes(classId)) {
        return res.status(403).json({ error: 'You can only send messages to your assigned classes' })
      }
    }

    return next()
  }

  return res.status(403).json({ error: 'Forbidden - Staff access required' })
}

// Check if user can mark as urgent (Admin only)
export function canMarkUrgent(req: Request, res: Response, next: NextFunction) {
  const user = req.user
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { isUrgent } = req.body

  if (!isUrgent) {
    return next()
  }

  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return next()
  }

  return res.status(403).json({ error: 'Only admins can mark messages as urgent' })
}
