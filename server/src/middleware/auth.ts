import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../services/jwt.js'
import prisma from '../services/prisma.js'

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string
      email: string
      name: string
      role: 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN'
      schoolId: string
      preferredLanguage: string
      children?: Array<{
        id: string
        name: string
        classId: string
        class: {
          id: string
          name: string
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
  }
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
      include: {
        children: { include: { class: true } },
        assignedClasses: { include: { class: true } },
      },
    })

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    req.user = user as Express.User
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

// Check if user can send to a specific class or whole school
export function canSendToTarget(req: Request, res: Response, next: NextFunction) {
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

    const assignedClassIds = user.assignedClasses?.map(ac => ac.classId) || []
    if (classId && !assignedClassIds.includes(classId)) {
      return res.status(403).json({ error: 'You can only send messages to your assigned classes' })
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
