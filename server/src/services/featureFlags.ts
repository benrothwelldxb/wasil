import prisma from './prisma.js'

/**
 * Feature flags with three scopes and a strict precedence:
 *
 *     user override  >  school override  >  global default
 *
 * The global default lives on `FeatureFlag`; per-school and per-user pins live
 * on `FeatureFlagOverride`. This is the beta kill-switch — an operator can turn
 * Clubs / Catering / Payments / etc. off instantly (globally, per school, or per
 * user) with no deploy. Reads are cheap and safe: a resolution error fails
 * CLOSED to the flag's catalog default, never throws into the request.
 */

export interface FlagContext {
  userId?: string | null
  schoolId?: string | null
}

// The known catalog. Adding a flag is a one-line change here; `ensureCatalog()`
// seeds any missing rows so they show up in the ops UI. `enabledDefault` is the
// safe out-of-the-box value when no DB row and no override exist.
export const FLAG_CATALOG: Record<string, { description: string; enabledDefault: boolean }> = {
  clubs: { description: 'ECA / clubs booking surface', enabledDefault: true },
  catering: { description: 'Cafeteria / catering surface', enabledDefault: true },
  messaging: { description: 'Parent messaging / inbox', enabledDefault: true },
  notifications: { description: 'Outbound notifications (push/email/SMS)', enabledDefault: true },
  payments: { description: 'In-app payments (link-only in beta)', enabledDefault: false },
  consultations: { description: 'Parent–teacher consultation booking', enabledDefault: true },
  experimental: { description: 'Umbrella flag for experimental features', enabledDefault: false },
}

export type FlagKey = keyof typeof FLAG_CATALOG

function catalogDefault(key: string): boolean {
  return FLAG_CATALOG[key]?.enabledDefault ?? false
}

/** Seed any catalog flags missing from the DB (idempotent). Safe to call at boot. */
export async function ensureCatalog(): Promise<void> {
  for (const [key, meta] of Object.entries(FLAG_CATALOG)) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: {}, // never clobber an operator's chosen default
      create: { key, description: meta.description, enabledDefault: meta.enabledDefault },
    })
  }
}

/** Resolve a single flag for a context. Fails closed to the catalog default. */
export async function isEnabled(key: string, ctx: FlagContext = {}): Promise<boolean> {
  try {
    const flags = await resolveAll(ctx, [key])
    return flags[key] ?? catalogDefault(key)
  } catch {
    return catalogDefault(key)
  }
}

/**
 * Resolve every known flag for a context in two queries — used for the client
 * bootstrap (`GET /api/feature-flags`) so the UI can hide a killed surface.
 */
export async function resolveAll(ctx: FlagContext = {}, onlyKeys?: string[]): Promise<Record<string, boolean>> {
  const [rows, overrides] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.featureFlagOverride.findMany({
      where: {
        OR: [
          ctx.userId ? { userId: ctx.userId } : undefined,
          ctx.schoolId ? { schoolId: ctx.schoolId } : undefined,
        ].filter(Boolean) as object[],
      },
    }),
  ])

  const globalByKey = new Map(rows.map((r) => [r.key, r.enabledDefault]))
  const userByKey = new Map<string, boolean>()
  const schoolByKey = new Map<string, boolean>()
  for (const o of overrides) {
    if (ctx.userId && o.userId === ctx.userId) userByKey.set(o.flagKey, o.enabled)
    else if (ctx.schoolId && o.schoolId === ctx.schoolId) schoolByKey.set(o.flagKey, o.enabled)
  }

  const keys = onlyKeys ?? Array.from(new Set([...Object.keys(FLAG_CATALOG), ...globalByKey.keys()]))
  const out: Record<string, boolean> = {}
  for (const key of keys) {
    // Precedence: user > school > global default > catalog default.
    if (userByKey.has(key)) out[key] = userByKey.get(key)!
    else if (schoolByKey.has(key)) out[key] = schoolByKey.get(key)!
    else if (globalByKey.has(key)) out[key] = globalByKey.get(key)!
    else out[key] = catalogDefault(key)
  }
  return out
}

// ── Admin mutations ──────────────────────────────────────────────────────────

export async function setGlobalDefault(key: string, enabled: boolean, updatedBy?: string) {
  return prisma.featureFlag.upsert({
    where: { key },
    update: { enabledDefault: enabled, updatedBy },
    create: { key, enabledDefault: enabled, description: FLAG_CATALOG[key]?.description, updatedBy },
  })
}

export async function setOverride(
  key: string,
  scope: { schoolId?: string; userId?: string },
  enabled: boolean,
  updatedBy?: string,
) {
  if (!!scope.schoolId === !!scope.userId) {
    throw new Error('Provide exactly one of schoolId or userId')
  }
  // Ensure the parent flag row exists so the FK holds.
  await setGlobalDefault(key, catalogDefault(key), updatedBy).catch(() => {})
  const where = scope.schoolId
    ? { flagKey_schoolId: { flagKey: key, schoolId: scope.schoolId } }
    : { flagKey_userId: { flagKey: key, userId: scope.userId! } }
  return prisma.featureFlagOverride.upsert({
    where: where as never,
    update: { enabled, updatedBy },
    create: { flagKey: key, schoolId: scope.schoolId ?? null, userId: scope.userId ?? null, enabled, updatedBy },
  })
}

export async function clearOverride(key: string, scope: { schoolId?: string; userId?: string }) {
  return prisma.featureFlagOverride.deleteMany({
    where: { flagKey: key, schoolId: scope.schoolId ?? null, userId: scope.userId ?? null },
  })
}

/** Full flag listing with overrides, for the ops UI. */
export async function listFlags() {
  await ensureCatalog()
  return prisma.featureFlag.findMany({
    include: { overrides: true },
    orderBy: { key: 'asc' },
  })
}
