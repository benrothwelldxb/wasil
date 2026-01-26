import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

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
  } catch (error) {
    console.error('Error updating term date:', error)
    res.status(500).json({ error: 'Failed to update term date' })
  }
})

// Delete term date (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.termDate.delete({
      where: { id },
    })

    res.json({ message: 'Term date deleted successfully' })
  } catch (error) {
    console.error('Error deleting term date:', error)
    res.status(500).json({ error: 'Failed to delete term date' })
  }
})

export default router
