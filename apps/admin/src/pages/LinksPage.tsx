import React, { useState } from 'react'
import { Plus, Pencil, Trash2, ExternalLink, Eye, EyeOff, X, FolderPlus, Image } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { ExternalLink as ExternalLinkType, LinkCategory, LinksAllResponse } from '@wasil/shared'

export function LinksPage() {
  const theme = useTheme()
  const { data, refetch } = useApi<LinksAllResponse>(
    () => api.links.listAll(),
    { categories: [], links: [] }
  )

  const categories = data?.categories || []
  const links = data?.links || []

  const [showLinkForm, setShowLinkForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingLink, setEditingLink] = useState<ExternalLinkType | null>(null)
  const [editingCategory, setEditingCategory] = useState<LinkCategory | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'link' | 'category'; id: string; name: string } | null>(null)

  // Link form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Category form state
  const [categoryName, setCategoryName] = useState('')

  const resetLinkForm = () => {
    setShowLinkForm(false)
    setEditingLink(null)
    setTitle('')
    setDescription('')
    setUrl('')
    setIcon('')
    setImageUrl('')
    setCategoryId('')
  }

  const resetCategoryForm = () => {
    setShowCategoryForm(false)
    setEditingCategory(null)
    setCategoryName('')
  }

  const handleEditLink = (link: ExternalLinkType) => {
    setEditingLink(link)
    setTitle(link.title)
    setDescription(link.description || '')
    setUrl(link.url)
    setIcon(link.icon || '')
    setImageUrl(link.imageUrl || '')
    setCategoryId(link.categoryId || '')
    setShowLinkForm(true)
  }

  const handleEditCategory = (cat: LinkCategory) => {
    setEditingCategory(cat)
    setCategoryName(cat.name)
    setShowCategoryForm(true)
  }

  const handleSubmitLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return

    setIsSubmitting(true)
    try {
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim(),
        icon: icon.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        categoryId: categoryId || undefined,
      }

      if (editingLink) {
        await api.links.update(editingLink.id, data)
      } else {
        await api.links.create(data)
      }
      resetLinkForm()
      refetch()
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryName.trim()) return

    setIsSubmitting(true)
    try {
      if (editingCategory) {
        await api.links.updateCategory(editingCategory.id, { name: categoryName.trim() })
      } else {
        await api.links.createCategory({ name: categoryName.trim() })
      }
      resetCategoryForm()
      refetch()
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'link') {
        await api.links.delete(deleteConfirm.id)
      } else {
        await api.links.deleteCategory(deleteConfirm.id)
      }
      setDeleteConfirm(null)
      refetch()
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const toggleActive = async (link: ExternalLinkType) => {
    try {
      await api.links.update(link.id, { active: !link.active })
      refetch()
    } catch (error) {
      alert(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const suggestedIcons = ['🔗', '📱', '💳', '🎓', '📚', '🏫', '🚌', '🍽️', '📅', '💬', '📧', '🎨']

  const getCategoryName = (catId: string | null | undefined) => {
    if (!catId) return 'Uncategorized'
    return categories.find(c => c.id === catId)?.name || 'Uncategorized'
  }

  // Group links by category
  const linksByCategory = categories.map(cat => ({
    ...cat,
    links: links.filter(l => l.categoryId === cat.id),
  }))
  const uncategorizedLinks = links.filter(l => !l.categoryId)

  const renderLinkIcon = (link: ExternalLinkType) => {
    if (link.imageUrl) {
      return (
        <img
          src={link.imageUrl}
          alt=""
          className="w-10 h-10 rounded-lg object-contain bg-gray-50"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      )
    }
    return <span className="text-2xl w-10 text-center">{link.icon || '🔗'}</span>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Useful Links</h1>
          <p className="text-gray-600 mt-1">External links to apps and resources for parents</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowCategoryForm(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <FolderPlus className="w-5 h-5" />
            <span>Add Category</span>
          </button>
          <button
            onClick={() => setShowLinkForm(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-5 h-5" />
            <span>Add Link</span>
          </button>
        </div>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Categories</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="flex items-center space-x-2 px-3 py-2 bg-white rounded-lg border border-gray-200"
              >
                <span className="font-medium text-gray-900">{cat.name}</span>
                <span className="text-xs text-gray-400">
                  ({linksByCategory.find(c => c.id === cat.id)?.links.length || 0})
                </span>
                <button
                  onClick={() => handleEditCategory(cat)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setDeleteConfirm({ type: 'category', id: cat.id, name: cat.name })}
                  className="p-1 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links by Category */}
      {linksByCategory.map(cat => cat.links.length > 0 && (
        <div key={cat.id} className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{cat.name}</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="divide-y divide-gray-100">
              {cat.links.map(link => (
                <LinkRow
                  key={link.id}
                  link={link}
                  renderIcon={renderLinkIcon}
                  onEdit={handleEditLink}
                  onToggle={toggleActive}
                  onDelete={(l) => setDeleteConfirm({ type: 'link', id: l.id, name: l.title })}
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Uncategorized Links */}
      {uncategorizedLinks.length > 0 && (
        <div className="mb-6">
          {categories.length > 0 && (
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Other Links</h2>
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="divide-y divide-gray-100">
              {uncategorizedLinks.map(link => (
                <LinkRow
                  key={link.id}
                  link={link}
                  renderIcon={renderLinkIcon}
                  onEdit={handleEditLink}
                  onToggle={toggleActive}
                  onDelete={(l) => setDeleteConfirm({ type: 'link', id: l.id, name: l.title })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {links.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <ExternalLink className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No links yet. Add links to external apps and resources that parents may find useful.</p>
        </div>
      )}

      {/* Link Form Modal */}
      {showLinkForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingLink ? 'Edit Link' : 'Add New Link'}
              </h2>
              <button onClick={resetLinkForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitLink} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. School Lunch Menu"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">URL *</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what this link is for"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Icon (choose one)</label>

                {/* Emoji Option */}
                <div className="mb-3">
                  <label className="text-xs text-gray-500 mb-1 block">Emoji</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={icon}
                      onChange={(e) => { setIcon(e.target.value); setImageUrl(''); }}
                      placeholder="Emoji"
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-center text-xl"
                      maxLength={4}
                    />
                    <div className="flex flex-wrap gap-1">
                      {suggestedIcons.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => { setIcon(emoji); setImageUrl(''); }}
                          className={`w-8 h-8 rounded hover:bg-gray-100 ${icon === emoji && !imageUrl ? 'bg-gray-100 ring-2 ring-blue-500' : ''}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Image URL Option */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Or Image URL (logo)</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => { setImageUrl(e.target.value); if (e.target.value) setIcon(''); }}
                      placeholder="https://example.com/logo.png"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="w-10 h-10 rounded-lg object-contain bg-gray-50 border"
                        onError={(e) => { (e.target as HTMLImageElement).src = ''; }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Paste a URL to a logo image (PNG, JPG, SVG)</p>
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetLinkForm}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {isSubmitting ? 'Saving...' : editingLink ? 'Update' : 'Add Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </h2>
              <button onClick={resetCategoryForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCategory} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category Name *</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Important Apps, Payment, Resources"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetCategoryForm}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {isSubmitting ? 'Saving...' : editingCategory ? 'Update' : 'Add Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title={`Delete ${deleteConfirm.type === 'category' ? 'Category' : 'Link'}`}
          message={
            deleteConfirm.type === 'category'
              ? `Are you sure you want to delete the category "${deleteConfirm.name}"? Links in this category will become uncategorized.`
              : `Are you sure you want to delete "${deleteConfirm.name}"?`
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
          variant="danger"
        />
      )}
    </div>
  )
}

// Link row component
function LinkRow({
  link,
  renderIcon,
  onEdit,
  onToggle,
  onDelete,
}: {
  link: ExternalLinkType
  renderIcon: (link: ExternalLinkType) => React.ReactNode
  onEdit: (link: ExternalLinkType) => void
  onToggle: (link: ExternalLinkType) => void
  onDelete: (link: ExternalLinkType) => void
}) {
  return (
    <div className={`p-4 flex items-center justify-between ${!link.active ? 'opacity-50' : ''}`}>
      <div className="flex items-center space-x-4">
        {renderIcon(link)}
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-medium text-gray-900">{link.title}</span>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          {link.description && (
            <p className="text-sm text-gray-500">{link.description}</p>
          )}
          <p className="text-xs text-gray-400 truncate max-w-md">{link.url}</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onToggle(link)}
          className={`p-2 rounded-lg ${link.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
          title={link.active ? 'Hide from parents' : 'Show to parents'}
        >
          {link.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onEdit(link)}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(link)}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
