/**
 * Build a tenant-scoped Prisma `where` clause. Use this everywhere a row is
 * fetched or mutated by id so the `schoolId` filter is explicit and greppable —
 * a missing tenant filter is the app's most common class of cross-tenant bug.
 *
 *   const row = await prisma.x.findFirst({ where: tenant(user.schoolId, { id }) })
 *   if (!row) return res.status(404)...
 *
 * For deletes/updates by id, pair it with deleteMany/updateMany + a count check:
 *   const { count } = await prisma.x.deleteMany({ where: tenant(schoolId, { id }) })
 *   if (count === 0) return res.status(404)...
 */
export function tenant<T extends object>(schoolId: string, extra?: T): { schoolId: string } & T {
  return { schoolId, ...((extra ?? {}) as T) }
}
