import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'

export function validate(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const details = result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
      // Use the first meaningful message as the top-level error
      const firstMessage = details[0]?.message || 'Validation error'
      return res.status(400).json({
        error: firstMessage,
        details,
      })
    }
    req.body = result.data
    next()
  }
}
