import { Request, Response, NextFunction } from 'express'

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string
      email: string
      name: string
      role: 'PARENT' | 'ADMIN' | 'SUPER_ADMIN'
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
    }
  }
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user) {
    return next()
  }
  res.status(401).json({ error: 'Unauthorized' })
}

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
