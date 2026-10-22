// A per-school switch for a partner app that reaches parents.
//
// "Connect shouldn't show anything to parents without it explicitly been turned
// on there." A partner token is minted once for every school, so the token
// alone cannot be the decision: each school turns the app on in its own
// settings, and until it does the app is refused at the door AND anything it
// already wrote stays out of the parent app.
//
// Two halves, both keyed on the token name:
//
//   1. Writes. A gated token's write routes call `refuseIfPartnerOff` once the
//      school is known, and answer 403 partner_not_enabled while it is off.
//      Reads of its own data stay open, so Beyond can still collect answers
//      and history after a school pauses it.
//
//   2. Parent reads. The `parentVisible*Where` clauses are added to every
//      parent read of posts, groups and forms. They are written against the
//      school relation rather than a flag read up front, so a sweep that spans
//      schools (scheduled posts) can use them too, and no read pays an extra
//      round trip. Turning the switch back on shows everything again: nothing
//      is deleted or rewritten.
//
// A partner that is not listed here (Desk, Active) is not gated by this file.
// Active's cross-app integrations have their own module flags.
import type { Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import prisma from './prisma.js'
import { managedByLabel, ownerNameOf } from './groupOwnership.js'

/** Token name → the School column that switches it on. */
export const PARTNER_SCHOOL_SWITCHES = {
  beyond: 'beyondEnabled',
} as const

export type GatedPartner = keyof typeof PARTNER_SCHOOL_SWITCHES
export type PartnerSwitchFlag = (typeof PARTNER_SCHOOL_SWITCHES)[GatedPartner]

const GATED = Object.entries(PARTNER_SCHOOL_SWITCHES) as [GatedPartner, PartnerSwitchFlag][]

/** The School flag that gates this partner, or null for an ungated one. */
export function switchFlagFor(owner: string | null | undefined): PartnerSwitchFlag | null {
  if (!owner) return null
  return (PARTNER_SCHOOL_SWITCHES as Record<string, PartnerSwitchFlag>)[owner] ?? null
}

/** Is this partner turned on for this school? An ungated partner always is.
 *  A school that cannot be found is not. */
export async function partnerEnabledForSchool(owner: string | null, schoolId: string): Promise<boolean> {
  const flag = switchFlagFor(owner)
  if (!flag) return true
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { [flag]: true } as Record<string, true>,
  })
  return (school as Record<string, unknown> | null)?.[flag] === true
}

export function partnerNotEnabledBody(owner: string) {
  return {
    error: 'partner_not_enabled',
    message: `${managedByLabel(owner)} is not turned on for this school in Connect.`,
  }
}

/** For a gated partner's write routes, once the school is known. Sends the
 *  403 and returns true when the partner is off for that school. */
export async function refuseIfPartnerOff(req: Request, res: Response, schoolId: string): Promise<boolean> {
  const owner = ownerNameOf((req as Request & { partner?: { name: string } }).partner)
  if (!switchFlagFor(owner)) return false
  if (await partnerEnabledForSchool(owner, schoolId)) return false
  res.status(403).json(partnerNotEnabledBody(owner!))
  return true
}

// ── Parent visibility ───────────────────────────────────────────────────────
//
// Written without NOT over a relation on purpose. `NOT { group: {...} }` on a
// post with no group compares against NULL in SQL and can drop the very posts
// it should keep, so each clause says positively what may be shown.

const notOwnedBy = (name: string) => ({ OR: [{ managedBy: null }, { managedBy: { not: name } }] })

/** AND these into a parent read of posts. A post is hidden while its school
 *  has the partner off if the partner sent it, it went to a group the partner
 *  manages, or it carries the partner's form. */
export function parentVisibleMessageWhere(): Prisma.MessageWhereInput[] {
  return GATED.map(([name, flag]) => ({
    OR: [
      { school: { [flag]: true } },
      {
        AND: [
          { OR: [{ partnerSource: null }, { partnerSource: { not: name } }] },
          { OR: [{ groupId: null }, { group: notOwnedBy(name) }] },
          { OR: [{ formId: null }, { form: notOwnedBy(name) }] },
        ],
      },
    ],
  }))
}

/** The posts a parent may NOT see right now, across gated partners. Used where
 *  a list refers to posts by id (notifications) rather than holding them. */
export function parentHiddenMessageWhere(): Prisma.MessageWhereInput {
  return {
    OR: GATED.map(([name, flag]) => ({
      AND: [
        { school: { [flag]: false } },
        { OR: [{ partnerSource: name }, { group: { managedBy: name } }, { form: { managedBy: name } }] },
      ],
    })),
  }
}

/** AND these into a parent read of groups. */
export function parentVisibleGroupWhere(): Prisma.GroupWhereInput[] {
  return GATED.map(([name, flag]) => ({
    OR: [{ school: { [flag]: true } }, notOwnedBy(name)],
  }))
}

/** AND these into a parent read of forms (answering one included). */
export function parentVisibleFormWhere(): Prisma.FormWhereInput[] {
  return GATED.map(([name, flag]) => ({
    OR: [{ school: { [flag]: true } }, notOwnedBy(name)],
  }))
}
