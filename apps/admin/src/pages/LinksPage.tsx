import React, { useState } from 'react'
import { Plus, Pencil, Trash2, ExternalLink, GripVertical, Eye, EyeOff, X } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { ExternalLink as ExternalLinkType } from '@wasil/shared'

export function LinksPage() {
  const theme = useTheme()
  const { data: links, setData: setLinks, refetch } = useApi<ExternalLinkType[]>(
    () => api.links.listAll(),
    []
  )

  const [showForm, setShowForm] = useState(false)
  const [editingLink, setEditingLink] = useState<ExternalLinkType | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState('')

  const resetForm = () => {
    setShowForm(false)
    setEditingLink(null)
    setTitle('')
    setDescription('')
    setUrl('')
    setIcon('')
  }

  const handleEdit = (link: ExternalLinkType) => {
    setEditingLink(link)
    setTitle(link.title)
    setDescription(link.description || '')
    setUrl(link.url)
    setIcon(link.icon || '')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return

    setIsSubmitting(true)
    try {
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim(),
        icon: icon.trim() || undefined,
      }

      if (editingLink) {
        await api.links.update(editingLink.id, data)
      } else {
        await api.links.create(data)
      }
      resetForm()
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
      await api.links.delete(deleteConfirm.id)
      setDeleteConfirm(null)
      refetch()
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const toggleActive = async (link: ExternalLinkType) => {
    try {
      await api.links.update(link.id, { active: !link.active })
      setLinks(prev =>
        prev?.map(l => l.id === link.id ? { ...l, active: !l.active } : l) || null
      )
    } catch (error) {
      alert(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const suggestedIcons = ['🔗', '📱', '💳', '🎓', '📚', '🏫', '🚌', '🍽️', '📅', '💬', '📧', '🎨']

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Useful Links</h1>
          <p className="text-gray-600 mt-1">External links to apps and resources for parents</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <Plus className="w-5 h-5" />
          <span>Add Link</span>
        </button>
      </div>

      {/* Links List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {!links || links.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <ExternalLink className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No links yet. Add links to external apps and resources that parents may find useful.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {links.map((link) => (
              <div
                key={link.id}
                className={`p-4 flex items-center justify-between ${!link.active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center space-x-4">
                  <span className="text-2xl w-10 text-center">{link.icon || '🔗'}</span>
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
                    onClick={() => toggleActive(link)}
                    className={`p-2 rounded-lg ${link.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                    title={link.active ? 'Hide from parents' : 'Show to parents'}
                  >
                    {link.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleEdit(link)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ id: link.id, title: link.title })}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingLink ? 'Edit Link' : 'Add New Link'}
              </h2>
              <button onClick={resetForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="Emoji"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-center text-xl"
                    maxLength={4}
                  />
                  <div className="flex flex-wrap gap-1">
                    {suggestedIcons.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setIcon(emoji)}
                        className={`w-8 h-8 rounded hover:bg-gray-100 ${icon === emoji ? 'bg-gray-100 ring-2 ring-blue-500' : ''}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
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

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Link"
          message={`Are you sure you want to delete "${deleteConfirm.title}"?`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
          variant="danger"
        />
      )}
    </div>
  )
}
