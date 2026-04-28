import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function serializeItem(item: any) {
  return {
    id: item.id,
    dayOfWeek: item.dayOfWeek,
    dayName: DAY_NAMES[item.dayOfWeek],
    mealType: item.mealType,
    name: item.name,
    description: item.description,
    dietaryTags: item.dietaryTags ? JSON.parse(item.dietaryTags) : [],
    allergens: item.allergens ? JSON.parse(item.allergens) : [],
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    price: item.price,
    isDefault: item.isDefault,
    order: item.order,
  }
}

function buildItemData(item: any, idx: number, menuId?: string) {
  return {
    ...(menuId && { menuId }),
    dayOfWeek: item.dayOfWeek,
    mealType: item.mealType || 'LUNCH',
    name: item.name,
    description: item.description || null,
    dietaryTags: item.dietaryTags ? JSON.stringify(item.dietaryTags) : null,
    allergens: item.allergens && item.allergens.length > 0 ? JSON.stringify(item.allergens) : null,
    calories: item.calories || null,
    protein: item.protein || null,
    carbs: item.carbs || null,
    fat: item.fat || null,
    price: item.price ?? null,
    isDefault: item.isDefault || false,
    order: item.order ?? idx,
  }
}

// ==========================================
// Parent endpoints
// ==========================================

// Get current week's menu
router.get('/current', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    // Find the Monday of this week
    const now = new Date()
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
    monday.setHours(0, 0, 0, 0)

    const menu = await prisma.cafeteriaMenu.findFirst({
      where: {
        schoolId: user.schoolId,
        isPublished: true,
        weekOf: monday,
      },
      include: {
        items: { orderBy: [{ dayOfWeek: 'asc' }, { order: 'asc' }] },
      },
    })

    if (!menu) {
      return res.json(null)
    }

    // Get school cafeteria URL
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { cafeteriaUrl: true },
    })

    res.json({
      id: menu.id,
      weekOf: menu.weekOf.toISOString().split('T')[0],
      title: menu.title,
      imageUrl: menu.imageUrl,
      orderUrl: menu.orderUrl || school?.cafeteriaUrl || null,
      items: menu.items.map(serializeItem),
    })
  } catch (error) {
    console.error('Error fetching current menu:', error)
    res.status(500).json({ error: 'Failed to fetch menu' })
  }
})

// Get menu for a specific week
router.get('/week/:date', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const weekOf = new Date(req.params.date + 'T00:00:00')

    const menu = await prisma.cafeteriaMenu.findFirst({
      where: {
        schoolId: user.schoolId,
        isPublished: true,
        weekOf,
      },
      include: {
        items: { orderBy: [{ dayOfWeek: 'asc' }, { order: 'asc' }] },
      },
    })

    if (!menu) return res.json(null)

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { cafeteriaUrl: true },
    })

    res.json({
      id: menu.id,
      weekOf: menu.weekOf.toISOString().split('T')[0],
      title: menu.title,
      imageUrl: menu.imageUrl,
      orderUrl: menu.orderUrl || school?.cafeteriaUrl || null,
      items: menu.items.map(serializeItem),
    })
  } catch (error) {
    console.error('Error fetching menu:', error)
    res.status(500).json({ error: 'Failed to fetch menu' })
  }
})

// ==========================================
// Admin endpoints
// ==========================================

// List all menus
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const menus = await prisma.cafeteriaMenu.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { weekOf: 'desc' },
    })

    res.json(menus.map(m => ({
      id: m.id,
      weekOf: m.weekOf.toISOString().split('T')[0],
      title: m.title,
      imageUrl: m.imageUrl,
      orderUrl: m.orderUrl,
      isPublished: m.isPublished,
      itemCount: m._count.items,
      createdAt: m.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error listing menus:', error)
    res.status(500).json({ error: 'Failed to list menus' })
  }
})

// Get menu with items
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const menu = await prisma.cafeteriaMenu.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        items: { orderBy: [{ dayOfWeek: 'asc' }, { order: 'asc' }] },
      },
    })

    if (!menu) return res.status(404).json({ error: 'Menu not found' })

    res.json({
      id: menu.id,
      weekOf: menu.weekOf.toISOString().split('T')[0],
      title: menu.title,
      imageUrl: menu.imageUrl,
      orderUrl: menu.orderUrl,
      isPublished: menu.isPublished,
      items: menu.items.map(serializeItem),
      createdAt: menu.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching menu:', error)
    res.status(500).json({ error: 'Failed to fetch menu' })
  }
})

// Create menu
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { weekOf, title, imageUrl, orderUrl, items } = req.body

    if (!weekOf) return res.status(400).json({ error: 'weekOf is required' })

    const menu = await prisma.cafeteriaMenu.create({
      data: {
        schoolId: user.schoolId,
        weekOf: new Date(weekOf + 'T00:00:00'),
        title: title || null,
        imageUrl: imageUrl || null,
        orderUrl: orderUrl || null,
        items: items && items.length > 0 ? {
          create: items.map((item: any, idx: number) => buildItemData(item, idx)),
        } : undefined,
      },
      include: {
        items: { orderBy: [{ dayOfWeek: 'asc' }, { order: 'asc' }] },
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'CAFETERIA_MENU' as any, resourceId: menu.id, metadata: { weekOf } })

    res.status(201).json({
      id: menu.id,
      weekOf: menu.weekOf.toISOString().split('T')[0],
      title: menu.title,
      isPublished: menu.isPublished,
      itemCount: menu.items.length,
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A menu for this week already exists' })
    }
    console.error('Error creating menu:', error)
    res.status(500).json({ error: 'Failed to create menu' })
  }
})

// Update menu
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, imageUrl, orderUrl, isPublished, items } = req.body

    const existing = await prisma.cafeteriaMenu.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!existing) return res.status(404).json({ error: 'Menu not found' })

    // Update menu and replace items
    await prisma.$transaction(async (tx) => {
      if (items !== undefined) {
        await tx.cafeteriaMenuItem.deleteMany({ where: { menuId: id } })
        if (items.length > 0) {
          await tx.cafeteriaMenuItem.createMany({
            data: items.map((item: any, idx: number) => buildItemData(item, idx, id)),
          })
        }
      }

      await tx.cafeteriaMenu.update({
        where: { id },
        data: {
          ...(title !== undefined && { title: title || null }),
          ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
          ...(orderUrl !== undefined && { orderUrl: orderUrl || null }),
          ...(isPublished !== undefined && { isPublished }),
        },
      })
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'CAFETERIA_MENU' as any, resourceId: id })

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating menu:', error)
    res.status(500).json({ error: 'Failed to update menu' })
  }
})

// Delete menu
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.cafeteriaMenu.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!existing) return res.status(404).json({ error: 'Menu not found' })

    await prisma.cafeteriaMenu.delete({ where: { id } })

    logAudit({ req, action: 'DELETE', resourceType: 'CAFETERIA_MENU' as any, resourceId: id })

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting menu:', error)
    res.status(500).json({ error: 'Failed to delete menu' })
  }
})

// Duplicate a menu to a new week
router.post('/:id/duplicate', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { weekOf } = req.body

    if (!weekOf) return res.status(400).json({ error: 'weekOf is required' })

    const source = await prisma.cafeteriaMenu.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { items: true },
    })
    if (!source) return res.status(404).json({ error: 'Menu not found' })

    const newMenu = await prisma.cafeteriaMenu.create({
      data: {
        schoolId: user.schoolId,
        weekOf: new Date(weekOf + 'T00:00:00'),
        title: source.title,
        imageUrl: source.imageUrl,
        orderUrl: source.orderUrl,
        isPublished: false,
        items: {
          create: source.items.map(item => ({
            dayOfWeek: item.dayOfWeek,
            mealType: item.mealType,
            name: item.name,
            description: item.description,
            dietaryTags: item.dietaryTags,
            allergens: item.allergens,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            price: item.price,
            isDefault: item.isDefault,
            order: item.order,
          })),
        },
      },
    })

    res.status(201).json({
      id: newMenu.id,
      weekOf: newMenu.weekOf.toISOString().split('T')[0],
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A menu for this week already exists' })
    }
    console.error('Error duplicating menu:', error)
    res.status(500).json({ error: 'Failed to duplicate menu' })
  }
})

export default router
