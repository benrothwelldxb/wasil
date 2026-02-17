import React, { useState, useRef } from 'react'
import { Plus, X, Pencil, Trash2, GripVertical, GraduationCap } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { YearGroup } from '@wasil/shared'

export function YearGroupsPage() {
  const theme = useTheme()
  const { data: yearGroups, refetch, setData } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [editingGroup, setEditingGroup] = useState<YearGroup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<YearGroup | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Drag state
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const sorted = [...(yearGroups || [])].sort((a, b) => a.order - b.order)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      if (editingGroup) {
        await api.yearGroups.update(editingGroup.id, { name, order: editingGroup.order })
      } else {
        const maxOrder = sorted.length > 0 ? Math.max(...sorted.map((g) => g.order)) : 0
        await api.yearGroups.create({ name, order: maxOrder + 1 })
      }
      setShowForm(false)
      setEditingGroup(null)
      setName('')
      refetch()
    } catch (err) {
      console.error('Failed to save year group:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (group: YearGroup) => {
    setEditingGroup(group)
    setName(group.name)
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingGroup(null)
    setName('')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.yearGroups.delete(deleteTarget.id)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      console.error('Failed to delete year group:', err)
    }
  }

  const handleDragStart = (index: number) => {
    dragItem.current = index
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    dragOverItem.current = index
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = async () => {
    setDragOverIndex(null)
    if (dragItem.current === null || dragOverItem.current === null) return
    if (dragItem.current === dragOverItem.current) return

    const reordered = [...sorted]
    const [removed] = reordered.splice(dragItem.current, 1)
    reordered.splice(dragOverItem.current, 0, removed)

    // Optimistic update
    const updated = reordered.map((g, i) => ({ ...g, order: i }))
    setData(updated)

    try {
      await api.yearGroups.reorder(reordered.map((g) => g.id))
    } catch (err) {
      console.error('Failed to reorder:', err)
      refetch()
    }

    dragItem.current = null
    dragOverItem.current = null
  }

  const handleDragEnd = () => {
    dragItem.current = null
    dragOverItem.current = null
    setDragOverIndex(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Year Groups</h2>
        <button
          onClick={() => { setShowForm(true); setEditingGroup(null); setName('') }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <Plus className="w-4 h-4" />
          New Year Group
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingGroup ? 'Edit Year Group' : 'New Year Group'}
            </h3>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Year 1, Reception"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
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
                {isSubmitting ? 'Saving...' : editingGroup ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Draggable List */}
      <div className="space-y-2">
        {sorted.map((group, index) => (
          <div
            key={group.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${
              dragOverIndex === index ? 'border-blue-400 bg-blue-50' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GripVertical className="w-5 h-5 text-slate-300" />
                <GraduationCap className="w-5 h-5 text-slate-400" />
                <span className="font-semibold text-slate-900">{group.name}</span>
                {group.classCount !== undefined && (
                  <span className="text-sm text-slate-500">
                    {group.classCount} class{group.classCount !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(group)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(group)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {yearGroups && yearGroups.length === 0 && (
          <p className="text-center text-slate-400 py-8">No year groups yet.</p>
        )}
      </div>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Year Group"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
