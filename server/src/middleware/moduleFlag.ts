// Gate a route on a school's module flag — server-side, not just in the menu.
//
// Connect's module flags have until now been a NAVIGATION concern: the parent
// app hides a menu item, and the route behind it keeps answering. For a
// Connect-owned feature that is a reasonable trade, since the data is the
// school's own either way and the flag is a tidiness preference.
//
// It is not a reasonable trade for an integration that reads another app's
// data. "Off" there has to mean the data does not reach this app at all — a
// hidden link is not an off switch, it is a hidden link, and anyone with a
// session and the URL still gets the data.
import type { Request, Response, NextFunction } from 'express'
import prisma from '../services/prisma.js'

/** School flags that gate a cross-app integration. */
export type ExternalModuleFlag = 'activeScheduleEnabled' | 'sendInclusionEnabled'

/**
 * 404 when the module is off for this school.
 *
 * 404 rather than 403: a module a school does not have is not a permission
 * they lack, it is a feature that is not there — and a stale bookmark should
 * read the same as a wrong URL. Must run AFTER `isAuthenticated`, which is what
 * puts the school on the request.
 */
export function requireModule(flag: ExternalModuleFlag) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const schoolId = req.user?.schoolId
    if (!schoolId) return res.status(404).json({ error: 'not_found' })

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { [flag]: true } as Record<string, true>,
    })
    // A school row that has vanished, or a flag that is off, read the same way
    // on purpose: neither is a thing this school has.
    if (!school || (school as Record<string, unknown>)[flag] !== true) {
      return res.status(404).json({ error: 'not_found' })
    }
    next()
  }
}
