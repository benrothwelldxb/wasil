import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'

const router = Router()

// Get term dates
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const termDates = await prisma.termDate.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { date: 'asc' },
    })

    res.json(termDates.map(td => ({
      id: td.id,
      term: td.term,
      termName: td.termName,
      label: td.label,
      sublabel: td.sublabel,
      date: td.date.toISOString().split('T')[0],
      endDate: td.endDate?.toISOString().split('T')[0] || null,
      type: td.type,
      color: td.color,
      schoolId: td.schoolId,
    })))
  } catch (error) {
    console.error('Error fetching term dates:', error)
    res.status(500).json({ error: 'Failed to fetch term dates' })
  }
})

// Create term date (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { term, termName, label, sublabel, date, endDate, type, color } = req.body

    const termDate = await prisma.termDate.create({
      data: {
        term,
        termName,
        label,
        sublabel: sublabel || null,
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        type,
        color,
        schoolId: user.schoolId,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'TERM_DATE', resourceId: termDate.id, metadata: { label: termDate.label } })

    res.status(201).json({
      id: termDate.id,
      term: termDate.term,
      termName: termDate.termName,
      label: termDate.label,
      sublabel: termDate.sublabel,
      date: termDate.date.toISOString().split('T')[0],
      endDate: termDate.endDate?.toISOString().split('T')[0] || null,
      type: termDate.type,
      color: termDate.color,
      schoolId: termDate.schoolId,
    })
  } catch (error) {
    console.error('Error creating term date:', error)
    res.status(500).json({ error: 'Failed to create term date' })
  }
})

// Update term date (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { term, termName, label, sublabel, date, endDate, type, color } = req.body

    const termDate = await prisma.termDate.update({
      where: { id },
      data: {
        term,
        termName,
        label,
        sublabel: sublabel || null,
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        type,
        color,
      },
    })

    res.json({
      id: termDate.id,
      term: termDate.term,
      termName: termDate.termName,
      label: termDate.label,
      sublabel: termDate.sublabel,
      date: termDate.date.toISOString().split('T')[0],
      endDate: termDate.endDate?.toISOString().split('T')[0] || null,
      type: termDate.type,
      color: termDate.color,
      schoolId: termDate.schoolId,
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'TERM_DATE', resourceId: termDate.id, metadata: { label: termDate.label } })
  } catch (error) {
    console.error('Error updating term date:', error)
    res.status(500).json({ error: 'Failed to update term date' })
  }
})

// Seed term dates with UAE school calendar (admin only)
router.post('/seed', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    // Delete existing term dates for this school
    await prisma.termDate.deleteMany({
      where: { schoolId: user.schoolId },
    })

    // UAE School Calendar 2025-2026
    // Colors must match admin colorOptions: green, red, blue, amber, purple, gray
    const termDates = [
      // Term 1
      { term: 1, termName: 'Term 1', label: 'Term 1 Starts', date: '2025-08-25', type: 'term-start', color: 'green' },
      { term: 1, termName: 'Term 1', label: 'UAE National Day', sublabel: 'Public Holiday', date: '2025-12-02', endDate: '2025-12-03', type: 'public-holiday', color: 'amber' },
      { term: 1, termName: 'Term 1', label: 'Winter Break', sublabel: 'Term 1 Ends', date: '2025-12-13', endDate: '2026-01-05', type: 'term-end', color: 'red' },

      // Term 2
      { term: 2, termName: 'Term 2', label: 'Term 2 Starts', date: '2026-01-06', type: 'term-start', color: 'green' },
      { term: 2, termName: 'Term 2', label: 'Spring Break', sublabel: 'Mid-term Break', date: '2026-03-23', endDate: '2026-04-03', type: 'half-term', color: 'blue' },
      { term: 2, termName: 'Term 2', label: 'Eid al-Fitr', sublabel: 'Public Holiday (dates TBC)', date: '2026-03-20', endDate: '2026-03-22', type: 'public-holiday', color: 'amber' },
      { term: 2, termName: 'Term 2', label: 'Term 2 Ends', date: '2026-04-03', type: 'term-end', color: 'red' },

      // Term 3
      { term: 3, termName: 'Term 3', label: 'Term 3 Starts', date: '2026-04-13', type: 'term-start', color: 'green' },
      { term: 3, termName: 'Term 3', label: 'Eid al-Adha', sublabel: 'Public Holiday (dates TBC)', date: '2026-05-27', endDate: '2026-05-30', type: 'public-holiday', color: 'amber' },
      { term: 3, termName: 'Term 3', label: 'Last Day of School', sublabel: 'Summer Break Begins', date: '2026-07-03', type: 'term-end', color: 'red' },
    ]

    const created = await prisma.termDate.createMany({
      data: termDates.map(td => ({
        ...td,
        date: new Date(td.date),
        endDate: td.endDate ? new Date(td.endDate) : null,
        schoolId: user.schoolId,
      })),
    })

    logAudit({ req, action: 'CREATE', resourceType: 'TERM_DATE', resourceId: 'seed', metadata: { count: created.count } })

    res.json({ message: `Created ${created.count} term dates`, count: created.count })
  } catch (error) {
    console.error('Error seeding term dates:', error)
    res.status(500).json({ error: 'Failed to seed term dates' })
  }
})

// Delete term date (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.termDate.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'TERM_DATE', resourceId: id })

    res.json({ message: 'Term date deleted successfully' })
  } catch (error) {
    console.error('Error deleting term date:', error)
    res.status(500).json({ error: 'Failed to delete term date' })
  }
})

export default router
