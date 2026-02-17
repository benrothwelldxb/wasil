import { Router, Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

// List students with search, filter by class, pagination
router.get('/', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { search, classId, page = '1', limit = '50' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = Math.min(parseInt(limit as string, 10), 100)
    const skip = (pageNum - 1) * limitNum

    const where: Record<string, unknown> = { schoolId: user.schoolId }

    if (classId) {
      where.classId = classId
    }

    if (search) {
      const searchStr = search as string
      where.OR = [
        { firstName: { contains: searchStr, mode: 'insensitive' } },
        { lastName: { contains: searchStr, mode: 'insensitive' } },
        { externalId: { contains: searchStr, mode: 'insensitive' } },
      ]
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          class: { select: { id: true, name: true } },
          _count: { select: { parentLinks: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take: limitNum,
      }),
      prisma.student.count({ where }),
    ])

    res.json({
      students: students.map(s => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: `${s.firstName} ${s.lastName}`,
        externalId: s.externalId,
        classId: s.classId,
        className: s.class.name,
        parentCount: s._count.parentLinks,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Error fetching students:', error)
    res.status(500).json({ error: 'Failed to fetch students' })
  }
})

// Search students for autocomplete
router.get('/search', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { q, classId, limit = '20' } = req.query

    if (!q || (q as string).length < 2) {
      return res.json([])
    }

    const limitNum = Math.min(parseInt(limit as string, 10), 50)
    const searchStr = q as string

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      OR: [
        { firstName: { contains: searchStr, mode: 'insensitive' } },
        { lastName: { contains: searchStr, mode: 'insensitive' } },
        { externalId: { contains: searchStr, mode: 'insensitive' } },
      ],
    }

    if (classId) {
      where.classId = classId
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        class: { select: { name: true } },
        _count: { select: { parentLinks: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limitNum,
    })

    res.json(
      students.map(s => ({
        id: s.id,
        fullName: `${s.firstName} ${s.lastName}`,
        className: s.class.name,
        hasParent: s._count.parentLinks > 0,
      }))
    )
  } catch (error) {
    console.error('Error searching students:', error)
    res.status(500).json({ error: 'Failed to search students' })
  }
})

// Get single student
router.get('/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const student = await prisma.student.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        class: { select: { id: true, name: true } },
        parentLinks: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    })

    if (!student) {
      return res.status(404).json({ error: 'Student not found' })
    }

    res.json({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.firstName} ${student.lastName}`,
      externalId: student.externalId,
      classId: student.classId,
      className: student.class.name,
      parentCount: student.parentLinks.length,
      parents: student.parentLinks.map(pl => ({
        id: pl.user.id,
        name: pl.user.name,
        email: pl.user.email,
        linkedAt: pl.createdAt,
      })),
    })
  } catch (error) {
    console.error('Error fetching student:', error)
    res.status(500).json({ error: 'Failed to fetch student' })
  }
})

// Create single student
router.post('/', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { firstName, lastName, externalId, classId } = req.body

    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ error: 'First name and last name are required' })
    }

    if (!classId) {
      return res.status(400).json({ error: 'Class ID is required' })
    }

    // Validate class belongs to this school
    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId: user.schoolId },
    })

    if (!cls) {
      return res.status(400).json({ error: 'Invalid class ID' })
    }

    // Check for duplicate externalId in same school
    if (externalId?.trim()) {
      const existing = await prisma.student.findUnique({
        where: { schoolId_externalId: { schoolId: user.schoolId, externalId: externalId.trim() } },
      })
      if (existing) {
        return res.status(400).json({ error: 'A student with this external ID already exists' })
      }
    }

    const student = await prisma.student.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        externalId: externalId?.trim() || null,
        classId,
        schoolId: user.schoolId,
      },
      include: {
        class: { select: { id: true, name: true } },
      },
    })

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'STUDENT',
      resourceId: student.id,
      metadata: { firstName: student.firstName, lastName: student.lastName, className: cls.name },
    })

    res.status(201).json({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.firstName} ${student.lastName}`,
      externalId: student.externalId,
      classId: student.classId,
      className: student.class.name,
      parentCount: 0,
    })
  } catch (error) {
    console.error('Error creating student:', error)
    res.status(500).json({ error: 'Failed to create student' })
  }
})

// Bulk import students from CSV
router.post('/bulk', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { students: studentsData } = req.body

    if (!Array.isArray(studentsData) || studentsData.length === 0) {
      return res.status(400).json({ error: 'Students array is required' })
    }

    // Get all unique class names
    const classNames = [...new Set(studentsData.map((s: { className: string }) => s.className).filter(Boolean))]
    const classes = await prisma.class.findMany({
      where: { schoolId: user.schoolId, name: { in: classNames } },
    })

    const classNameToId = new Map(classes.map(c => [c.name, c.id]))

    // Validate all class names exist
    const missingClasses = classNames.filter(name => !classNameToId.has(name))
    if (missingClasses.length > 0) {
      return res.status(400).json({
        error: 'Some class names not found',
        missingClasses,
      })
    }

    const created: Array<{ id: string; firstName: string; lastName: string; className: string }> = []
    const errors: string[] = []
    let skipped = 0

    for (const s of studentsData) {
      try {
        const firstName = s.firstName?.trim()
        const lastName = s.lastName?.trim()
        const className = s.className?.trim()
        const externalId = s.externalId?.trim() || null

        if (!firstName || !lastName) {
          errors.push(`Missing name: ${JSON.stringify(s)}`)
          skipped++
          continue
        }

        if (!className || !classNameToId.has(className)) {
          errors.push(`Invalid class "${className}" for ${firstName} ${lastName}`)
          skipped++
          continue
        }

        // Check for duplicate externalId
        if (externalId) {
          const existing = await prisma.student.findUnique({
            where: { schoolId_externalId: { schoolId: user.schoolId, externalId } },
          })
          if (existing) {
            errors.push(`Duplicate external ID "${externalId}" for ${firstName} ${lastName}`)
            skipped++
            continue
          }
        }

        const student = await prisma.student.create({
          data: {
            firstName,
            lastName,
            externalId,
            classId: classNameToId.get(className)!,
            schoolId: user.schoolId,
          },
        })

        created.push({
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          className,
        })
      } catch (err) {
        console.error(`Error creating student:`, err)
        errors.push(`Failed to create ${s.firstName} ${s.lastName}`)
        skipped++
      }
    }

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'STUDENT',
      resourceId: 'bulk',
      metadata: { count: created.length },
    })

    res.status(201).json({
      created: created.length,
      skipped,
      students: created,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error bulk importing students:', error)
    res.status(500).json({ error: 'Failed to import students' })
  }
})

// Update student
router.put('/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { firstName, lastName, externalId, classId } = req.body

    const existing = await prisma.student.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Student not found' })
    }

    // Validate class if provided
    if (classId) {
      const cls = await prisma.class.findFirst({
        where: { id: classId, schoolId: user.schoolId },
      })
      if (!cls) {
        return res.status(400).json({ error: 'Invalid class ID' })
      }
    }

    // Check for duplicate externalId
    if (externalId?.trim() && externalId.trim() !== existing.externalId) {
      const duplicate = await prisma.student.findUnique({
        where: { schoolId_externalId: { schoolId: user.schoolId, externalId: externalId.trim() } },
      })
      if (duplicate && duplicate.id !== id) {
        return res.status(400).json({ error: 'A student with this external ID already exists' })
      }
    }

    const student = await prisma.student.update({
      where: { id },
      data: {
        firstName: firstName?.trim() || existing.firstName,
        lastName: lastName?.trim() || existing.lastName,
        externalId: externalId !== undefined ? (externalId?.trim() || null) : existing.externalId,
        classId: classId || existing.classId,
      },
      include: {
        class: { select: { id: true, name: true } },
        _count: { select: { parentLinks: true } },
      },
    })

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'STUDENT',
      resourceId: student.id,
      metadata: { firstName: student.firstName, lastName: student.lastName },
    })

    res.json({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.firstName} ${student.lastName}`,
      externalId: student.externalId,
      classId: student.classId,
      className: student.class.name,
      parentCount: student._count.parentLinks,
    })
  } catch (error) {
    console.error('Error updating student:', error)
    res.status(500).json({ error: 'Failed to update student' })
  }
})

// Delete student (only if no parent links)
router.delete('/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const student = await prisma.student.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        _count: { select: { parentLinks: true } },
      },
    })

    if (!student) {
      return res.status(404).json({ error: 'Student not found' })
    }

    if (student._count.parentLinks > 0) {
      return res.status(400).json({ error: 'Cannot delete student with linked parents. Remove parent links first.' })
    }

    await prisma.student.delete({ where: { id } })

    logAudit({
      req,
      action: 'DELETE',
      resourceType: 'STUDENT',
      resourceId: id,
      metadata: { firstName: student.firstName, lastName: student.lastName },
    })

    res.json({ message: 'Student deleted successfully' })
  } catch (error) {
    console.error('Error deleting student:', error)
    res.status(500).json({ error: 'Failed to delete student' })
  }
})

export default router
