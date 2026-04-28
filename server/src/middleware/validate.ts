import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'

export function validate(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
      })
    }
    req.body = result.data
    next()
  }
}
