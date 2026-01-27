import { Request, Response, NextFunction } from 'express'

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string
      email: string
      name: string
      role: 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN'
      schoolId: string
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

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user) {
    return next()
  }
  res.status(401).json({ error: 'Unauthorized' })
}

// Staff or higher (STAFF, ADMIN, SUPER_ADMIN)
export function isStaff(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return next()
  }
  res.status(403).json({ error: 'Forbidden - Staff access required' })
}

// Admin or higher (ADMIN, SUPER_ADMIN)
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN')) {
    return next()
  }
  res.status(403).json({ error: 'Forbidden - Admin access required' })
}

export function isSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.role === 'SUPER_ADMIN') {
    return next()
  }
  res.status(403).json({ error: 'Forbidden - Super Admin access required' })
}

// Check if user can send to a specific class or whole school
export function canSendToTarget(req: Request, res: Response, next: NextFunction) {
  const user = req.user
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { targetClass, classId } = req.body

  // Admins can send to anyone
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return next()
  }

  // Staff can only send to Whole School if they have no class restrictions (unlikely)
  // or to their assigned classes
  if (user.role === 'STAFF') {
    if (targetClass === 'Whole School') {
      return res.status(403).json({ error: 'Only admins can send whole-school messages' })
    }

    // Check if staff is assigned to this class
    const assignedClassIds = user.assignedClasses?.map(ac => ac.classId) || []
    if (classId && !assignedClassIds.includes(classId)) {
      return res.status(403).json({ error: 'You can only send messages to your assigned classes' })
    }

    return next()
  }

  // Parents cannot send messages
  return res.status(403).json({ error: 'Forbidden - Staff access required' })
}

// Check if user can mark as urgent (Admin only)
export function canMarkUrgent(req: Request, res: Response, next: NextFunction) {
  const user = req.user
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { isUrgent } = req.body

  // If not marking as urgent, allow through
  if (!isUrgent) {
    return next()
  }

  // Only admins can mark as urgent
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return next()
  }

  return res.status(403).json({ error: 'Only admins can mark messages as urgent' })
}
