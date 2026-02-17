import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, BookOpen, FileText, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { KnowledgeCategory, KnowledgeArticle } from '@wasil/shared'

// Common emoji options for categories
const EMOJI_OPTIONS = ['📚', '📖', '🎓', '📝', '📋', '🏫', '👨‍👩‍👧‍👦', '🚌', '🍽️', '⚽', '🎨', '🎵', '💻', '🔬', '📅', '❓', '📞', '🏥', '👕', '💰']

// Color options for categories
const COLOR_OPTIONS = [
  { value: 'bg-blue-500', label: 'Blue' },
  { value: 'bg-green-500', label: 'Green' },
  { value: 'bg-purple-500', label: 'Purple' },
  { value: 'bg-red-500', label: 'Red' },
  { value: 'bg-orange-500', label: 'Orange' },
  { value: 'bg-yellow-500', label: 'Yellow' },
  { value: 'bg-pink-500', label: 'Pink' },
  { value: 'bg-teal-500', label: 'Teal' },
]

interface CategoryFormData {
  name: string
  icon: string
  color: string
}

interface ArticleFormData {
  title: string
  content: string
  categoryId: string
}

const emptyCategoryForm: CategoryFormData = { name: '', icon: '📚', color: 'bg-blue-500' }
const emptyArticleForm: ArticleFormData = { title: '', content: '', categoryId: '' }

export function KnowledgeBasePage() {
  const theme = useTheme()
  const { data: categories, refetch } = useApi<KnowledgeCategory[]>(() => api.knowledge.list(), [])

  // Category state
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [categoryForm, setCategoryForm] = useState<CategoryFormData>(emptyCategoryForm)
  const [editingCategory, setEditingCategory] = useState<KnowledgeCategory | null>(null)
  const [deleteCategory, setDeleteCategory] = useState<KnowledgeCategory | null>(null)

  // Article state
  const [showArticleForm, setShowArticleForm] = useState(false)
  const [articleForm, setArticleForm] = useState<ArticleFormData>(emptyArticleForm)
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null)
  const [deleteArticle, setDeleteArticle] = useState<{ article: KnowledgeArticle; categoryName: string } | null>(null)

  // UI state
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Category handlers
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryForm.name.trim()) return

    setIsSubmitting(true)
    try {
      if (editingCategory) {
        await api.knowledge.updateCategory(editingCategory.id, {
          name: categoryForm.name.trim(),
          icon: categoryForm.icon,
          color: categoryForm.color,
        })
      } else {
        const maxOrder = categories?.reduce((max, c) => Math.max(max, c.order), -1) ?? -1
        await api.knowledge.createCategory({
          name: categoryForm.name.trim(),
          icon: categoryForm.icon,
          color: categoryForm.color,
          order: maxOrder + 1,
        })
      }
      resetCategoryForm()
      refetch()
    } catch (error) {
      console.error('Failed to save category:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetCategoryForm = () => {
    setShowCategoryForm(false)
    setEditingCategory(null)
    setCategoryForm(emptyCategoryForm)
  }

  const handleEditCategory = (category: KnowledgeCategory) => {
    setCategoryForm({ name: category.name, icon: category.icon, color: category.color })
    setEditingCategory(category)
    setShowCategoryForm(true)
  }

  const handleDeleteCategory = async () => {
    if (!deleteCategory) return
    try {
      await api.knowledge.deleteCategory(deleteCategory.id)
      setDeleteCategory(null)
      refetch()
    } catch (error) {
      console.error('Failed to delete category:', error)
    }
  }

  // Article handlers
  const handleArticleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!articleForm.title.trim() || !articleForm.content.trim() || !articleForm.categoryId) return

    setIsSubmitting(true)
    try {
      if (editingArticle) {
        await api.knowledge.updateArticle(editingArticle.id, {
          title: articleForm.title.trim(),
          content: articleForm.content.trim(),
        })
      } else {
        await api.knowledge.createArticle({
          title: articleForm.title.trim(),
          content: articleForm.content.trim(),
          categoryId: articleForm.categoryId,
        })
        // Auto-expand the category
        setExpandedCategories(prev => new Set(prev).add(articleForm.categoryId))
      }
      resetArticleForm()
      refetch()
    } catch (error) {
      console.error('Failed to save article:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetArticleForm = () => {
    setShowArticleForm(false)
    setEditingArticle(null)
    setArticleForm(emptyArticleForm)
  }

  const handleEditArticle = (article: KnowledgeArticle, categoryId: string) => {
    setArticleForm({ title: article.title, content: article.content, categoryId })
    setEditingArticle(article)
    setShowArticleForm(true)
  }

  const handleDeleteArticle = async () => {
    if (!deleteArticle) return
    try {
      await api.knowledge.deleteArticle(deleteArticle.article.id)
      setDeleteArticle(null)
      refetch()
    } catch (error) {
      console.error('Failed to delete article:', error)
    }
  }

  const handleAddArticleToCategory = (categoryId: string) => {
    setArticleForm({ ...emptyArticleForm, categoryId })
    setShowArticleForm(true)
    setExpandedCategories(prev => new Set(prev).add(categoryId))
  }

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Knowledge Base</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowArticleForm(true); setEditingArticle(null); setArticleForm(emptyArticleForm) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
          >
            <FileText className="w-4 h-4" />
            New Article
          </button>
          <button
            onClick={() => { setShowCategoryForm(true); setEditingCategory(null); setCategoryForm(emptyCategoryForm) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-4 h-4" />
            New Category
          </button>
        </div>
      </div>

      {/* Category Form */}
      {showCategoryForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingCategory ? 'Edit Category' : 'New Category'}
            </h3>
            <button onClick={resetCategoryForm} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCategorySubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category Name</label>
              <input
                type="text"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. School Policies, Uniform, Term Dates"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Icon</label>
                <div className="flex flex-wrap gap-1 p-2 border border-slate-300 rounded-lg max-h-24 overflow-y-auto">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setCategoryForm(f => ({ ...f, icon: emoji }))}
                      className={`w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-lg ${
                        categoryForm.icon === emoji ? 'bg-blue-100 ring-2 ring-blue-500' : ''
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                <div className="flex flex-wrap gap-2 p-2 border border-slate-300 rounded-lg">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setCategoryForm(f => ({ ...f, color: color.value }))}
                      className={`w-8 h-8 rounded-full ${color.value} ${
                        categoryForm.color === color.value ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                      }`}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetCategoryForm}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isSubmitting ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Article Form */}
      {showArticleForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingArticle ? 'Edit Article' : 'New Article'}
            </h3>
            <button onClick={resetArticleForm} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleArticleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={articleForm.categoryId}
                onChange={(e) => setArticleForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                required
                disabled={!!editingArticle}
              >
                <option value="">Select a category</option>
                {(categories || []).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Article Title</label>
              <input
                type="text"
                value={articleForm.title}
                onChange={(e) => setArticleForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. What time does school start?"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
              <textarea
                value={articleForm.content}
                onChange={(e) => setArticleForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Write the article content here..."
                rows={6}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
              <p className="mt-1 text-xs text-slate-400">
                Use line breaks for paragraphs. Markdown is not supported.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetArticleForm}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !articleForm.categoryId}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isSubmitting ? 'Saving...' : editingArticle ? 'Update Article' : 'Create Article'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories List */}
      <div className="space-y-3">
        {(categories || []).map((category) => {
          const isExpanded = expandedCategories.has(category.id)
          return (
            <div
              key={category.id}
              className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
            >
              {/* Category Header */}
              <div className="flex items-center p-4">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="flex items-center flex-1 text-left"
                >
                  <div className={`w-10 h-10 rounded-lg ${category.color} flex items-center justify-center text-xl mr-3`}>
                    {category.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{category.name}</h3>
                    <p className="text-sm text-slate-500">
                      {category.articles.length} article{category.articles.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleAddArticleToCategory(category.id)}
                    className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                    title="Add article"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEditCategory(category)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Edit category"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteCategory(category)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Articles List */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {category.articles.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-sm">
                      No articles yet.{' '}
                      <button
                        onClick={() => handleAddArticleToCategory(category.id)}
                        className="text-blue-600 hover:underline"
                      >
                        Add one
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {category.articles.map((article) => (
                        <div
                          key={article.id}
                          className="flex items-center px-4 py-3 hover:bg-slate-50"
                        >
                          <FileText className="w-4 h-4 text-slate-400 mr-3 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-slate-800 text-sm truncate">
                              {article.title}
                            </h4>
                            <p className="text-xs text-slate-400 truncate">
                              {article.content.substring(0, 80)}...
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => handleEditArticle(article, category.id)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteArticle({ article, categoryName: category.name })}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {(!categories || categories.length === 0) && (
          <div className="text-center py-12 text-slate-400">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">No knowledge base categories yet.</p>
            <p className="text-sm">Create categories to organize FAQs and school information for parents.</p>
          </div>
        )}
      </div>

      {/* Delete Category Confirmation */}
      {deleteCategory && (
        <ConfirmModal
          title="Delete Category?"
          message={`Are you sure you want to delete "${deleteCategory.name}"? This will also delete all ${deleteCategory.articles.length} article(s) in this category.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDeleteCategory}
          onCancel={() => setDeleteCategory(null)}
        />
      )}

      {/* Delete Article Confirmation */}
      {deleteArticle && (
        <ConfirmModal
          title="Delete Article?"
          message={`Are you sure you want to delete "${deleteArticle.article.title}" from ${deleteArticle.categoryName}?`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDeleteArticle}
          onCancel={() => setDeleteArticle(null)}
        />
      )}
    </div>
  )
}
