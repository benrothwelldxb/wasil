import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { requireProviderOrSchoolAdmin } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { parseYearGroupIds, effectiveTimes } from '../services/ecaActivity.js'
import { uploadFile, generateKey } from '../services/storage.js'
import { checkUpload } from '../services/uploadValidation.js'
import logger from '../services/logger.js'
import { notifyClubBookingPaid } from '../services/clubNotify.js'

const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } })
const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp']

// Provider self-service portal. Every route is guarded by
// requireProviderOrSchoolAdmin and scoped to req.providerUser.providerId — a
// provider can only ever read or
// mutate its own record.
const router = Router()

router.use(requireProviderOrSchoolAdmin)

const updateProfileSchema = z.object({
  providerName: z.string().min(1).optional(),
  logoUrl: z.string().url().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  displayName: z.string().min(1).optional(),
})

/** 24-hour "HH:MM" — the shape EcaTerm's default times are already stored in. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 15:30')

const operatorSchema = z.object({ name: z.string().min(1).max(80) })

const activitySchema = z.object({
  ecaTermId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  timeSlot: z.enum(['BEFORE_SCHOOL', 'AFTER_SCHOOL']),
  location: z.string().nullable().optional(),
  maxCapacity: z.number().int().positive().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  costDescription: z.string().nullable().optional(),
  paymentUrl: z.string().url().nullable().optional(),
  eligibleGender: z.enum(['MIXED', 'BOYS_ONLY', 'GIRLS_ONLY']).optional(),
  // Year groups the club is open to. Absent or empty = open to every year
  // group, which is what the parent app and the allocator already assume of
  // an empty list. Ids are checked against the term's school on write.
  eligibleYearGroupIds: z.array(z.string()).optional(),
  // Clubs sharing a slot rarely share a clock, so a club may override the
  // term's BEFORE_SCHOOL / AFTER_SCHOOL default times. Null clears the
  // override and puts the club back on the term default.
  customStartTime: hhmm.nullable().optional(),
  customEndTime: hhmm.nullable().optional(),
  // The company running this club. Null means the partner runs it themselves.
  operatorId: z.string().nullable().optional(),
})
// Update accepts everything create does (minus the term) plus the parent-app
// visibility toggle. Create never publishes immediately — a provider opts in
// afterwards via PATCH { isPublished: true }.
const updateActivitySchema = activitySchema.partial().omit({ ecaTermId: true }).extend({
  isPublished: z.boolean().optional(),
})
const paymentStatusSchema = z.object({ paymentStatus: z.enum(['UNPAID', 'PAID', 'PARTIAL', 'WAIVED']) })

const menuItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(['LUNCH', 'BREAKFAST', 'SNACK']).optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  dietaryTags: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
})
const createMenuSchema = z.object({
  schoolId: z.string().min(1),
  weekOf: z.string().min(1), // YYYY-MM-DD (Monday)
  title: z.string().nullable().optional(),
  items: z.array(menuItemSchema).optional(),
})
const updateMenuSchema = z.object({
  title: z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
  items: z.array(menuItemSchema).optional(),
})

type MenuItemInput = z.infer<typeof menuItemSchema>
function buildMenuItemData(item: MenuItemInput, idx: number, menuId?: string) {
  return {
    ...(menuId && { menuId }),
    dayOfWeek: item.dayOfWeek,
    mealType: item.mealType || 'LUNCH',
    name: item.name,
    description: item.description ?? null,
    price: item.price ?? null,
    dietaryTags: item.dietaryTags && item.dietaryTags.length ? JSON.stringify(item.dietaryTags) : null,
    allergens: item.allergens && item.allergens.length ? JSON.stringify(item.allergens) : null,
    order: idx,
  }
}
function serializeMenuItem(i: {
  id: string; dayOfWeek: number; mealType: string; name: string; description: string | null
  price: number | null; dietaryTags: string | null; allergens: string | null
}) {
  return {
    id: i.id, dayOfWeek: i.dayOfWeek, mealType: i.mealType, name: i.name, description: i.description, price: i.price,
    dietaryTags: i.dietaryTags ? (JSON.parse(i.dietaryTags) as string[]) : [],
    allergens: i.allergens ? (JSON.parse(i.allergens) as string[]) : [],
  }
}

// The set of schools this provider is linked to — the tenant boundary for
// everything the provider can read or write.
async function mySchoolIds(providerId: string): Promise<string[]> {
  const links = await prisma.providerSchoolLink.findMany({ where: { providerId }, select: { schoolId: true } })
  return links.map(l => l.schoolId)
}

/** The term fields an activity row needs: its name and school for display,
 * plus the slot defaults a club falls back to when it sets no time of its own. */
const TERM_SELECT = {
  name: true,
  school: { select: { id: true, name: true } },
  defaultBeforeSchoolStart: true,
  defaultBeforeSchoolEnd: true,
  defaultAfterSchoolStart: true,
  defaultAfterSchoolEnd: true,
} as const

/** Year-group ids are client-supplied and a provider spans several schools, so
 * every id must belong to the school whose term the club sits in. */
/** An operator id must belong to the partner setting it — ids are client-supplied. */
async function operatorIsOwned(operatorId: string, providerId: string): Promise<boolean> {
  const found = await prisma.clubOperator.findFirst({
    where: { id: operatorId, providerId },
    select: { id: true },
  })
  return !!found
}

async function unknownYearGroupIds(ids: string[], schoolId: string): Promise<string[]> {
  if (ids.length === 0) return []
  const found = await prisma.yearGroup.findMany({
    where: { schoolId, id: { in: ids } },
    select: { id: true },
  })
  const ok = new Set(found.map(y => y.id))
  return [...new Set(ids)].filter(id => !ok.has(id))
}

/** An activity's operator as the client needs it. */
const OPERATOR_SELECT = { id: true, name: true, logoUrl: true } as const

function serializeActivity(a: {
  id: string; name: string; description: string | null; dayOfWeek: number; timeSlot: string
  location: string | null; maxCapacity: number | null; cost: number | null; costDescription: string | null
  paymentUrl: string | null; isActive: boolean; isCancelled: boolean; isPublished: boolean; ecaTermId: string
  customStartTime: string | null; customEndTime: string | null; eligibleYearGroupIds: unknown
  operatorId: string | null
  operator?: { id: string; name: string; logoUrl: string | null } | null
  ecaTerm?: {
    name: string; school: { id: string; name: string }
    defaultBeforeSchoolStart: string | null; defaultBeforeSchoolEnd: string | null
    defaultAfterSchoolStart: string | null; defaultAfterSchoolEnd: string | null
  }
  createdAt: Date
}) {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    dayOfWeek: a.dayOfWeek,
    timeSlot: a.timeSlot,
    location: a.location,
    maxCapacity: a.maxCapacity,
    cost: a.cost,
    costDescription: a.costDescription,
    paymentUrl: a.paymentUrl,
    customStartTime: a.customStartTime,
    customEndTime: a.customEndTime,
    // What parents will actually see — the override, or the term's default.
    ...effectiveTimes(a, a.ecaTerm),
    eligibleYearGroupIds: parseYearGroupIds(a.eligibleYearGroupIds),
    operatorId: a.operatorId,
    operatorName: a.operator?.name ?? null,
    operatorLogoUrl: a.operator?.logoUrl ?? null,
    isActive: a.isActive,
    isCancelled: a.isCancelled,
    isPublished: a.isPublished,
    ecaTermId: a.ecaTermId,
    termName: a.ecaTerm?.name,
    schoolId: a.ecaTerm?.school.id,
    schoolName: a.ecaTerm?.school.name,
    createdAt: a.createdAt.toISOString(),
  }
}

// ─── Current provider profile (org + self + linked schools) ──────────────────
router.get('/profile', async (req, res) => {
  try {
    const { id: providerUserId, providerId } = req.providerUser!
    // Acting as a school admin there IS no provider person — `me` is the
    // signed-in PROVIDER's own record, so it's simply absent.
    const actingAdmin = req.providerActingAdmin === true
    const [provider, me] = await Promise.all([
      prisma.provider.findUnique({
        where: { id: providerId },
        include: { schoolLinks: { include: { school: { select: { id: true, name: true, shortName: true } } } } },
      }),
      actingAdmin
        ? Promise.resolve(null)
        : prisma.providerUser.findUnique({ where: { id: providerUserId }, select: { id: true, name: true, email: true, lastLoginAt: true } }),
    ])
    if (!provider || (!me && !actingAdmin)) return res.status(404).json({ error: 'Profile not found' })

    res.json({
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        status: provider.status,
        logoUrl: provider.logoUrl,
        contactEmail: provider.contactEmail,
        contactPhone: provider.contactPhone,
        schools: provider.schoolLinks.map(l => ({ id: l.school.id, name: l.school.name, shortName: l.school.shortName })),
      },
      me: me
        ? { id: me.id, name: me.name, email: me.email, lastLoginAt: me.lastLoginAt?.toISOString() || null }
        : null,
      // Lets the client label the session honestly ("editing as the school").
      actingAsAdmin: actingAdmin,
    })
  } catch (error) {
    console.error('Provider profile error:', error)
    res.status(500).json({ error: 'Failed to load profile' })
  }
})

// ─── Update org details + own display name ───────────────────────────────────
router.patch('/profile', validate(updateProfileSchema), async (req, res) => {
  try {
    const { id: providerUserId, providerId } = req.providerUser!
    const { providerName, logoUrl, contactEmail, contactPhone, displayName } = req.body

    if (providerName !== undefined || logoUrl !== undefined || contactEmail !== undefined || contactPhone !== undefined) {
      await prisma.provider.update({
        where: { id: providerId },
        data: {
          ...(providerName !== undefined && { name: providerName }),
          ...(logoUrl !== undefined && { logoUrl }),
          ...(contactEmail !== undefined && { contactEmail }),
          ...(contactPhone !== undefined && { contactPhone }),
        },
      })
    }
    // `displayName` is the signed-in provider person's OWN name. An admin editing
    // the organisation must never rename a provider's staff member, so it's
    // ignored rather than applied to the admin's own user row.
    if (displayName !== undefined && req.providerActingAdmin !== true) {
      await prisma.providerUser.update({ where: { id: providerUserId }, data: { name: displayName } })
    }

    res.json({ message: 'Profile updated' })
  } catch (error) {
    console.error('Provider profile update error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// ─── Terms the provider may add activities to (across its linked schools) ─────
router.get('/terms', async (req, res) => {
  try {
    const schoolIds = await mySchoolIds(req.providerUser!.providerId)
    const terms = await prisma.ecaTerm.findMany({
      where: { schoolId: { in: schoolIds }, status: { not: 'COMPLETED' } },
      include: { school: { select: { id: true, name: true } } },
      orderBy: { startDate: 'desc' },
    })
    res.json(terms.map(t => ({
      id: t.id,
      name: t.name,
      academicYear: t.academicYear,
      status: t.status,
      schoolId: t.school.id,
      schoolName: t.school.name,
      // Shown as the placeholder on a club's time fields: leave them empty and
      // the club runs to these.
      defaultBeforeSchoolStart: t.defaultBeforeSchoolStart,
      defaultBeforeSchoolEnd: t.defaultBeforeSchoolEnd,
      defaultAfterSchoolStart: t.defaultAfterSchoolStart,
      defaultAfterSchoolEnd: t.defaultAfterSchoolEnd,
    })))
  } catch (error) {
    console.error('Provider terms error:', error)
    res.status(500).json({ error: 'Failed to load terms' })
  }
})

// ─── Club operators: the companies whose clubs this partner organises ────────
// A brand, not an account — no login, no school link. Scoped to the partner, so
// one partner can never see or edit another's roster.
router.get('/operators', async (req, res) => {
  try {
    const operators = await prisma.clubOperator.findMany({
      where: { providerId: req.providerUser!.providerId },
      select: { id: true, name: true, logoUrl: true, _count: { select: { activities: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(operators.map(o => ({ id: o.id, name: o.name, logoUrl: o.logoUrl, clubCount: o._count.activities })))
  } catch (error) {
    console.error('Provider operators error:', error)
    res.status(500).json({ error: 'Failed to load operators' })
  }
})

router.post('/operators', validate(operatorSchema), async (req, res) => {
  try {
    const operator = await prisma.clubOperator.create({
      data: { name: req.body.name.trim(), providerId: req.providerUser!.providerId },
    })
    res.status(201).json({ id: operator.id, name: operator.name, logoUrl: operator.logoUrl, clubCount: 0 })
  } catch (error) {
    // @@unique([providerId, name]) — the same brand twice is a mistake, not a
    // second operator, and saying so beats a 500.
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'You already have an operator with that name' })
    }
    console.error('Provider create operator error:', error)
    res.status(500).json({ error: 'Failed to add operator' })
  }
})

router.patch('/operators/:id', validate(operatorSchema), async (req, res) => {
  try {
    const owned = await prisma.clubOperator.findFirst({
      where: { id: req.params.id, providerId: req.providerUser!.providerId },
      select: { id: true },
    })
    if (!owned) return res.status(404).json({ error: 'Operator not found' })
    const operator = await prisma.clubOperator.update({
      where: { id: owned.id },
      data: { name: req.body.name.trim() },
    })
    res.json({ id: operator.id, name: operator.name, logoUrl: operator.logoUrl })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'You already have an operator with that name' })
    }
    console.error('Provider update operator error:', error)
    res.status(500).json({ error: 'Failed to rename operator' })
  }
})

router.delete('/operators/:id', async (req, res) => {
  try {
    const owned = await prisma.clubOperator.findFirst({
      where: { id: req.params.id, providerId: req.providerUser!.providerId },
      select: { id: true, _count: { select: { activities: true } } },
    })
    if (!owned) return res.status(404).json({ error: 'Operator not found' })
    // The FK is SET NULL, so deleting would silently strip the brand off live
    // clubs rather than failing. Refuse instead and say how many.
    if (owned._count.activities > 0) {
      return res.status(409).json({
        error: `${owned._count.activities} club${owned._count.activities === 1 ? '' : 's'} still use this operator`,
      })
    }
    await prisma.clubOperator.delete({ where: { id: owned.id } })
    res.json({ message: 'Operator removed' })
  } catch (error) {
    console.error('Provider delete operator error:', error)
    res.status(500).json({ error: 'Failed to remove operator' })
  }
})

router.post('/operators/:id/logo', logoUpload.single('logo'), async (req, res) => {
  try {
    const owned = await prisma.clubOperator.findFirst({
      where: { id: req.params.id, providerId: req.providerUser!.providerId },
      select: { id: true },
    })
    if (!owned) return res.status(404).json({ error: 'Operator not found' })

    const file = req.file
    if (!file) return res.status(400).json({ error: 'Logo file is required' })
    const check = checkUpload(file.buffer, file.mimetype, file.originalname, LOGO_MIMES)
    if (!check.valid) return res.status(400).json({ error: `Invalid image: ${check.reason}` })

    const key = generateKey('operator-logos', file.originalname)
    const logoUrl = await uploadFile(file.buffer, key, file.mimetype)
    await prisma.clubOperator.update({ where: { id: owned.id }, data: { logoUrl } })
    res.json({ logoUrl })
  } catch (error) {
    console.error('Provider operator logo error:', error)
    res.status(500).json({ error: 'Failed to upload logo' })
  }
})

// ─── Year groups a club can be restricted to, per linked school ──────────────
// A provider works across several schools and year groups are per school, so
// these are grouped by school and the club form filters to its term's school.
router.get('/year-groups', async (req, res) => {
  try {
    const schoolIds = await mySchoolIds(req.providerUser!.providerId)
    const yearGroups = await prisma.yearGroup.findMany({
      where: { schoolId: { in: schoolIds } },
      select: { id: true, name: true, order: true, schoolId: true },
      orderBy: [{ schoolId: 'asc' }, { order: 'asc' }],
    })
    res.json(yearGroups)
  } catch (error) {
    console.error('Provider year groups error:', error)
    res.status(500).json({ error: 'Failed to load year groups' })
  }
})

// ─── The provider's own activities ───────────────────────────────────────────
router.get('/activities', async (req, res) => {
  try {
    const activities = await prisma.ecaActivity.findMany({
      where: { providerId: req.providerUser!.providerId },
      include: { ecaTerm: { select: TERM_SELECT }, operator: { select: OPERATOR_SELECT } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(activities.map(serializeActivity))
  } catch (error) {
    console.error('Provider activities error:', error)
    res.status(500).json({ error: 'Failed to load activities' })
  }
})

router.post('/activities', validate(activitySchema), async (req, res) => {
  try {
    const { providerId } = req.providerUser!
    const body = req.body

    // The term must belong to a school this provider is linked to.
    const schoolIds = await mySchoolIds(providerId)
    const term = await prisma.ecaTerm.findFirst({
      where: { id: body.ecaTermId, schoolId: { in: schoolIds } },
      select: { id: true, schoolId: true },
    })
    if (!term) return res.status(404).json({ error: 'Term not found' })

    const yearGroupIds = body.eligibleYearGroupIds ?? []
    const unknown = await unknownYearGroupIds(yearGroupIds, term.schoolId)
    if (unknown.length > 0) {
      return res.status(400).json({ error: 'Unknown year group for this school' })
    }

    if (body.operatorId && !(await operatorIsOwned(body.operatorId, providerId))) {
      return res.status(400).json({ error: 'Unknown club operator' })
    }

    const activity = await prisma.ecaActivity.create({
      data: {
        ecaTermId: term.id,
        schoolId: term.schoolId,
        providerId,
        name: body.name,
        description: body.description ?? null,
        dayOfWeek: body.dayOfWeek,
        timeSlot: body.timeSlot,
        location: body.location ?? null,
        // Providers create open-enrolment clubs; the school controls the other
        // activity types (invite-only / compulsory / tryout).
        activityType: 'OPEN',
        eligibleGender: body.eligibleGender ?? 'MIXED',
        maxCapacity: body.maxCapacity ?? null,
        cost: body.cost ?? null,
        costDescription: body.costDescription ?? null,
        paymentUrl: body.paymentUrl ?? null,
        customStartTime: body.customStartTime ?? null,
        customEndTime: body.customEndTime ?? null,
        // Stored as a real array; the admin ECA routes wrote a JSON string into
        // this column historically, and every reader handles both (see
        // parseYearGroupIds).
        eligibleYearGroupIds: yearGroupIds,
        operatorId: body.operatorId ?? null,
      },
      include: { ecaTerm: { select: TERM_SELECT }, operator: { select: OPERATOR_SELECT } },
    })

    res.status(201).json(serializeActivity(activity))
  } catch (error) {
    console.error('Provider create activity error:', error)
    res.status(500).json({ error: 'Failed to create activity' })
  }
})

router.patch('/activities/:id', validate(updateActivitySchema), async (req, res) => {
  try {
    // Ownership: only the provider that owns the activity may edit it.
    const owned = await prisma.ecaActivity.findFirst({
      where: { id: req.params.id, providerId: req.providerUser!.providerId },
      select: { id: true, schoolId: true },
    })
    if (!owned) return res.status(404).json({ error: 'Activity not found' })

    const b = req.body
    if (b.eligibleYearGroupIds !== undefined) {
      const unknown = await unknownYearGroupIds(b.eligibleYearGroupIds, owned.schoolId)
      if (unknown.length > 0) {
        return res.status(400).json({ error: 'Unknown year group for this school' })
      }
    }
    if (b.operatorId && !(await operatorIsOwned(b.operatorId, req.providerUser!.providerId))) {
      return res.status(400).json({ error: 'Unknown club operator' })
    }

    const activity = await prisma.ecaActivity.update({
      where: { id: owned.id },
      data: {
        ...(b.operatorId !== undefined && { operatorId: b.operatorId }),
        ...(b.name !== undefined && { name: b.name }),
        ...(b.description !== undefined && { description: b.description }),
        ...(b.dayOfWeek !== undefined && { dayOfWeek: b.dayOfWeek }),
        ...(b.timeSlot !== undefined && { timeSlot: b.timeSlot }),
        ...(b.location !== undefined && { location: b.location }),
        ...(b.maxCapacity !== undefined && { maxCapacity: b.maxCapacity }),
        ...(b.cost !== undefined && { cost: b.cost }),
        ...(b.costDescription !== undefined && { costDescription: b.costDescription }),
        ...(b.paymentUrl !== undefined && { paymentUrl: b.paymentUrl }),
        ...(b.eligibleGender !== undefined && { eligibleGender: b.eligibleGender }),
        ...(b.customStartTime !== undefined && { customStartTime: b.customStartTime }),
        ...(b.customEndTime !== undefined && { customEndTime: b.customEndTime }),
        ...(b.eligibleYearGroupIds !== undefined && { eligibleYearGroupIds: b.eligibleYearGroupIds }),
        ...(b.isPublished !== undefined && { isPublished: b.isPublished }),
      },
      include: { ecaTerm: { select: TERM_SELECT }, operator: { select: OPERATOR_SELECT } },
    })
    res.json(serializeActivity(activity))
  } catch (error) {
    console.error('Provider update activity error:', error)
    res.status(500).json({ error: 'Failed to update activity' })
  }
})

router.delete('/activities/:id', async (req, res) => {
  try {
    const result = await prisma.ecaActivity.deleteMany({
      where: { id: req.params.id, providerId: req.providerUser!.providerId },
    })
    if (result.count === 0) return res.status(404).json({ error: 'Activity not found' })
    res.json({ message: 'Activity deleted' })
  } catch (error) {
    console.error('Provider delete activity error:', error)
    res.status(500).json({ error: 'Failed to delete activity' })
  }
})

// ─── Bookings for the provider's clubs ───────────────────────────────────────
router.get('/bookings', async (req, res) => {
  try {
    const { providerId } = req.providerUser!

    // Parent contact is shared per-school, per the school admin's toggle.
    const links = await prisma.providerSchoolLink.findMany({
      where: { providerId },
      select: { schoolId: true, shareParentContact: true },
    })
    const shareBySchool = new Map(links.map(l => [l.schoolId, l.shareParentContact]))

    const bookings = await prisma.ecaProviderBooking.findMany({
      where: { ecaActivity: { providerId }, cancelledAt: null },
      include: {
        student: { select: { firstName: true, lastName: true, allergies: true, medicalNotes: true, class: { select: { name: true } } } },
        parentUser: { select: { name: true, email: true, phone: true } },
        ecaActivity: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Audit trail: record who viewed booking data, and how much of it included
    // parent contact details (PII shared with an outside party). A school admin
    // acting on the provider is logged as the ADMIN they are — never as a
    // provider user, which would misattribute the access.
    const withContact = bookings.filter(b => shareBySchool.get(b.schoolId)).length
    const actingAdmin = req.providerActingAdmin === true
    logger.info(
      {
        providerId,
        ...(actingAdmin
          ? { adminUserId: req.providerUser!.id, actingAsAdmin: true }
          : { providerUserId: req.providerUser!.id }),
        bookingsViewed: bookings.length,
        contactShared: withContact,
      },
      actingAdmin ? 'school admin viewed provider club bookings' : 'provider viewed club bookings',
    )

    res.json(bookings.map(b => {
      const share = shareBySchool.get(b.schoolId) ?? false
      return {
        id: b.id,
        activityId: b.ecaActivity.id,
        activityName: b.ecaActivity.name,
        studentName: `${b.student.firstName} ${b.student.lastName}`,
        className: b.student.class?.name || null,
        // Safety info always accompanies a booking — the provider is supervising
        // this child at the activity, independent of parent-contact sharing.
        allergies: b.student.allergies ? (JSON.parse(b.student.allergies) as string[]) : [],
        medicalNotes: b.student.medicalNotes,
        paymentStatus: b.paymentStatus,
        // Only expose parent contact when the school has enabled sharing.
        parent: share ? { name: b.parentUser.name, email: b.parentUser.email, phone: b.parentUser.phone } : null,
        createdAt: b.createdAt.toISOString(),
      }
    }))
  } catch (error) {
    console.error('Provider bookings error:', error)
    res.status(500).json({ error: 'Failed to load bookings' })
  }
})

// ─── Upload / update the provider's logo ─────────────────────────────────────
router.post('/logo', logoUpload.single('logo'), async (req, res) => {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'Logo file is required' })

    // MIME allowlist + extension match + magic-byte sniff.
    const check = checkUpload(file.buffer, file.mimetype, file.originalname, LOGO_MIMES)
    if (!check.valid) return res.status(400).json({ error: `Invalid image: ${check.reason}` })

    const key = generateKey('provider-logos', file.originalname)
    const logoUrl = await uploadFile(file.buffer, key, file.mimetype)
    await prisma.provider.update({ where: { id: req.providerUser!.providerId }, data: { logoUrl } })

    res.json({ logoUrl })
  } catch (error) {
    console.error('Provider logo upload error:', error)
    res.status(500).json({ error: 'Failed to upload logo' })
  }
})

// ─── Catering: weekly menus owned by this provider ───────────────────────────
router.get('/menus', async (req, res) => {
  try {
    const menus = await prisma.cafeteriaMenu.findMany({
      where: { providerId: req.providerUser!.providerId },
      include: { school: { select: { id: true, name: true } }, _count: { select: { items: true } } },
      orderBy: { weekOf: 'desc' },
    })
    res.json(menus.map(m => ({
      id: m.id,
      weekOf: m.weekOf.toISOString().split('T')[0],
      title: m.title,
      isPublished: m.isPublished,
      itemCount: m._count.items,
      schoolId: m.school.id,
      schoolName: m.school.name,
    })))
  } catch (error) {
    console.error('Provider menus error:', error)
    res.status(500).json({ error: 'Failed to load menus' })
  }
})

router.get('/menus/:id', async (req, res) => {
  try {
    const menu = await prisma.cafeteriaMenu.findFirst({
      where: { id: req.params.id, providerId: req.providerUser!.providerId },
      include: { items: { orderBy: [{ dayOfWeek: 'asc' }, { order: 'asc' }] } },
    })
    if (!menu) return res.status(404).json({ error: 'Menu not found' })
    res.json({
      id: menu.id,
      weekOf: menu.weekOf.toISOString().split('T')[0],
      title: menu.title,
      isPublished: menu.isPublished,
      items: menu.items.map(serializeMenuItem),
    })
  } catch (error) {
    console.error('Provider menu error:', error)
    res.status(500).json({ error: 'Failed to load menu' })
  }
})

router.post('/menus', validate(createMenuSchema), async (req, res) => {
  try {
    const { providerId } = req.providerUser!
    const { schoolId, weekOf, title, items } = req.body

    const schoolIds = await mySchoolIds(providerId)
    if (!schoolIds.includes(schoolId)) return res.status(404).json({ error: 'School not found' })

    const menu = await prisma.cafeteriaMenu.create({
      data: {
        schoolId,
        providerId,
        weekOf: new Date(weekOf + 'T00:00:00'),
        title: title || null,
        items: items && items.length ? { create: items.map((it: MenuItemInput, i: number) => buildMenuItemData(it, i)) } : undefined,
      },
      include: { _count: { select: { items: true } } },
    })
    res.status(201).json({ id: menu.id, weekOf, title: menu.title, isPublished: menu.isPublished, itemCount: menu._count.items })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(400).json({ error: 'A menu for this week already exists' })
    }
    console.error('Provider create menu error:', error)
    res.status(500).json({ error: 'Failed to create menu' })
  }
})

router.put('/menus/:id', validate(updateMenuSchema), async (req, res) => {
  try {
    const owned = await prisma.cafeteriaMenu.findFirst({
      where: { id: req.params.id, providerId: req.providerUser!.providerId },
      select: { id: true },
    })
    if (!owned) return res.status(404).json({ error: 'Menu not found' })

    const { title, isPublished, items } = req.body
    await prisma.$transaction(async tx => {
      if (items !== undefined) {
        await tx.cafeteriaMenuItem.deleteMany({ where: { menuId: owned.id } })
        if (items.length) {
          await tx.cafeteriaMenuItem.createMany({ data: items.map((it: MenuItemInput, i: number) => buildMenuItemData(it, i, owned.id)) })
        }
      }
      await tx.cafeteriaMenu.update({
        where: { id: owned.id },
        data: {
          ...(title !== undefined && { title: title || null }),
          ...(isPublished !== undefined && { isPublished }),
        },
      })
    })
    res.json({ message: 'Menu saved' })
  } catch (error) {
    console.error('Provider update menu error:', error)
    res.status(500).json({ error: 'Failed to save menu' })
  }
})

router.delete('/menus/:id', async (req, res) => {
  try {
    const result = await prisma.cafeteriaMenu.deleteMany({
      where: { id: req.params.id, providerId: req.providerUser!.providerId },
    })
    if (result.count === 0) return res.status(404).json({ error: 'Menu not found' })
    res.json({ message: 'Menu deleted' })
  } catch (error) {
    console.error('Provider delete menu error:', error)
    res.status(500).json({ error: 'Failed to delete menu' })
  }
})

// ─── Update a booking's payment status ───────────────────────────────────────
router.patch('/bookings/:id', validate(paymentStatusSchema), async (req, res) => {
  try {
    // Ownership: the booking must belong to one of the provider's activities.
    const owned = await prisma.ecaProviderBooking.findFirst({
      where: { id: req.params.id, ecaActivity: { providerId: req.providerUser!.providerId } },
      select: {
        id: true, parentUserId: true, schoolId: true,
        student: { select: { firstName: true, lastName: true } },
        ecaActivity: { select: { id: true, name: true } },
      },
    })
    if (!owned) return res.status(404).json({ error: 'Booking not found' })

    await prisma.ecaProviderBooking.update({ where: { id: owned.id }, data: { paymentStatus: req.body.paymentStatus } })

    // Let the parent know their payment landed.
    if (req.body.paymentStatus === 'PAID') {
      void notifyClubBookingPaid({
        activityId: owned.ecaActivity.id,
        activityName: owned.ecaActivity.name,
        studentName: `${owned.student.firstName} ${owned.student.lastName}`,
        parentUserId: owned.parentUserId,
        schoolId: owned.schoolId,
      })
    }

    res.json({ message: 'Payment status updated' })
  } catch (error) {
    console.error('Provider update booking error:', error)
    res.status(500).json({ error: 'Failed to update booking' })
  }
})

export default router
