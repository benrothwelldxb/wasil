import { Router } from 'express'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { requireProvider } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import logger from '../services/logger.js'
import { notifyClubBookingPaid } from '../services/clubNotify.js'

// Provider self-service portal. Every route is guarded by requireProvider and
// scoped to req.providerUser.providerId — a provider can only ever read or
// mutate its own record.
const router = Router()

router.use(requireProvider)

const updateProfileSchema = z.object({
  providerName: z.string().min(1).optional(),
  logoUrl: z.string().url().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  displayName: z.string().min(1).optional(),
})

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
})
const updateActivitySchema = activitySchema.partial().omit({ ecaTermId: true })
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

function serializeActivity(a: {
  id: string; name: string; description: string | null; dayOfWeek: number; timeSlot: string
  location: string | null; maxCapacity: number | null; cost: number | null; costDescription: string | null
  paymentUrl: string | null; isActive: boolean; isCancelled: boolean; ecaTermId: string
  ecaTerm?: { name: string; school: { id: string; name: string } }
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
    isActive: a.isActive,
    isCancelled: a.isCancelled,
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
    const [provider, me] = await Promise.all([
      prisma.provider.findUnique({
        where: { id: providerId },
        include: { schoolLinks: { include: { school: { select: { id: true, name: true, shortName: true } } } } },
      }),
      prisma.providerUser.findUnique({ where: { id: providerUserId }, select: { id: true, name: true, email: true, lastLoginAt: true } }),
    ])
    if (!provider || !me) return res.status(404).json({ error: 'Profile not found' })

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
      me: { id: me.id, name: me.name, email: me.email, lastLoginAt: me.lastLoginAt?.toISOString() || null },
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
    if (displayName !== undefined) {
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
    })))
  } catch (error) {
    console.error('Provider terms error:', error)
    res.status(500).json({ error: 'Failed to load terms' })
  }
})

// ─── The provider's own activities ───────────────────────────────────────────
router.get('/activities', async (req, res) => {
  try {
    const activities = await prisma.ecaActivity.findMany({
      where: { providerId: req.providerUser!.providerId },
      include: { ecaTerm: { select: { name: true, school: { select: { id: true, name: true } } } } },
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
      },
      include: { ecaTerm: { select: { name: true, school: { select: { id: true, name: true } } } } },
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
      select: { id: true },
    })
    if (!owned) return res.status(404).json({ error: 'Activity not found' })

    const b = req.body
    const activity = await prisma.ecaActivity.update({
      where: { id: owned.id },
      data: {
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
      },
      include: { ecaTerm: { select: { name: true, school: { select: { id: true, name: true } } } } },
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
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        parentUser: { select: { name: true, email: true, phone: true } },
        ecaActivity: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Audit trail: record that this provider viewed booking data, and how much
    // of it included parent contact details (PII shared with an outside party).
    const withContact = bookings.filter(b => shareBySchool.get(b.schoolId)).length
    logger.info(
      { providerId, providerUserId: req.providerUser!.id, bookingsViewed: bookings.length, contactShared: withContact },
      'provider viewed club bookings',
    )

    res.json(bookings.map(b => {
      const share = shareBySchool.get(b.schoolId) ?? false
      return {
        id: b.id,
        activityId: b.ecaActivity.id,
        activityName: b.ecaActivity.name,
        studentName: `${b.student.firstName} ${b.student.lastName}`,
        className: b.student.class?.name || null,
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
