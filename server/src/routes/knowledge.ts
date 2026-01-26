import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get all knowledge base categories and articles
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const categories = await prisma.knowledgeCategory.findMany({
      where: { schoolId: user.schoolId },
      include: {
        articles: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    })

    res.json(categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      order: cat.order,
      schoolId: cat.schoolId,
      articles: cat.articles.map(art => ({
        id: art.id,
        title: art.title,
        content: art.content,
        categoryId: art.categoryId,
        updatedAt: art.updatedAt.toISOString(),
        createdAt: art.createdAt.toISOString(),
      })),
    })))
  } catch (error) {
    console.error('Error fetching knowledge base:', error)
    res.status(500).json({ error: 'Failed to fetch knowledge base' })
  }
})

// Create category (admin only)
router.post('/category', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, icon, color, order } = req.body

    const category = await prisma.knowledgeCategory.create({
      data: {
        name,
        icon,
        color,
        order: order || 0,
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      order: category.order,
      schoolId: category.schoolId,
      articles: [],
    })
  } catch (error) {
    console.error('Error creating category:', error)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// Update category (admin only)
router.put('/category/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, icon, color, order } = req.body

    const category = await prisma.knowledgeCategory.update({
      where: { id },
      data: { name, icon, color, order },
    })

    res.json({
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      order: category.order,
      schoolId: category.schoolId,
    })
  } catch (error) {
    console.error('Error updating category:', error)
    res.status(500).json({ error: 'Failed to update category' })
  }
})

// Delete category (admin only)
router.delete('/category/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.knowledgeCategory.delete({
      where: { id },
    })

    res.json({ message: 'Category deleted successfully' })
  } catch (error) {
    console.error('Error deleting category:', error)
    res.status(500).json({ error: 'Failed to delete category' })
  }
})

// Create article (admin only)
router.post('/article', isAdmin, async (req, res) => {
  try {
    const { title, content, categoryId } = req.body

    const article = await prisma.knowledgeArticle.create({
      data: {
        title,
        content,
        categoryId,
      },
    })

    res.status(201).json({
      id: article.id,
      title: article.title,
      content: article.content,
      categoryId: article.categoryId,
      updatedAt: article.updatedAt.toISOString(),
      createdAt: article.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating article:', error)
    res.status(500).json({ error: 'Failed to create article' })
  }
})

// Update article (admin only)
router.put('/article/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { title, content } = req.body

    const article = await prisma.knowledgeArticle.update({
      where: { id },
      data: { title, content },
    })

    res.json({
      id: article.id,
      title: article.title,
      content: article.content,
      categoryId: article.categoryId,
      updatedAt: article.updatedAt.toISOString(),
      createdAt: article.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating article:', error)
    res.status(500).json({ error: 'Failed to update article' })
  }
})

// Delete article (admin only)
router.delete('/article/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.knowledgeArticle.delete({
      where: { id },
    })

    res.json({ message: 'Article deleted successfully' })
  } catch (error) {
    console.error('Error deleting article:', error)
    res.status(500).json({ error: 'Failed to delete article' })
  }
})

export default router
