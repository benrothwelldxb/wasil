import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'

const router = Router()

interface SearchResult {
  type: string
  id: string
  title: string
  subtitle?: string
  date?: string
  route?: string
}

// Universal search
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const q = (req.query.q as string || '').trim()

    if (!q || q.length < 2) {
      return res.json({ results: [] })
    }

    const schoolId = user.schoolId
    const isParent = user.role === 'PARENT'
    const isStaffOrAdmin = ['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)
    const results: SearchResult[] = []

    // Search messages/posts
    const messages = await prisma.message.findMany({
      where: {
        schoolId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, title: true, targetClass: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    messages.forEach(m => {
      results.push({
        type: 'post',
        id: m.id,
        title: m.title,
        subtitle: m.targetClass,
        date: m.createdAt.toISOString(),
        route: isParent ? '/' : '/messages',
      })
    })

    // Search events
    const events = await prisma.event.findMany({
      where: {
        schoolId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, title: true, date: true, location: true },
      orderBy: { date: 'desc' },
      take: 5,
    })
    events.forEach(e => {
      results.push({
        type: 'event',
        id: e.id,
        title: e.title,
        subtitle: e.location || undefined,
        date: e.date.toISOString(),
        route: '/events',
      })
    })

    // Search weekly messages
    const weeklyMessages = await prisma.weeklyMessage.findMany({
      where: {
        schoolId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, title: true, weekOf: true },
      orderBy: { weekOf: 'desc' },
      take: 3,
    })
    weeklyMessages.forEach(w => {
      results.push({
        type: 'weekly_update',
        id: w.id,
        title: w.title,
        subtitle: 'Principal\'s Update',
        date: w.weekOf.toISOString(),
        route: '/principal-updates',
      })
    })

    // Search forms
    const forms = await prisma.form.findMany({
      where: {
        schoolId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    forms.forEach(f => {
      results.push({
        type: 'form',
        id: f.id,
        title: f.title,
        subtitle: f.status,
        date: f.createdAt.toISOString(),
        route: isParent ? '/' : '/forms',
      })
    })

    // Search knowledge base
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        category: { schoolId },
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, title: true, category: { select: { name: true } } },
      take: 5,
    })
    articles.forEach(a => {
      results.push({
        type: 'article',
        id: a.id,
        title: a.title,
        subtitle: a.category.name,
        route: isParent ? '/resources' : '/knowledge-base',
      })
    })

    // Staff/Admin only searches
    if (isStaffOrAdmin) {
      // Search students
      const students = await prisma.student.findMany({
        where: {
          schoolId,
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
        take: 5,
      })
      students.forEach(s => {
        results.push({
          type: 'student',
          id: s.id,
          title: `${s.firstName} ${s.lastName}`,
          subtitle: s.class.name,
          route: '/students',
        })
      })

      // Search staff/parents
      const users = await prisma.user.findMany({
        where: {
          schoolId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, email: true, role: true },
        take: 5,
      })
      users.forEach(u => {
        results.push({
          type: u.role === 'PARENT' ? 'parent' : 'staff',
          id: u.id,
          title: u.name,
          subtitle: u.email,
          route: u.role === 'PARENT' ? '/parents' : '/staff',
        })
      })
    }

    res.json({ results })
  } catch (error) {
    console.error('Error searching:', error)
    res.status(500).json({ error: 'Search failed' })
  }
})

export default router
