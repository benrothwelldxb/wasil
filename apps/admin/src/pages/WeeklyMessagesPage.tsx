import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, CheckCircle, MessageSquare } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { WeeklyMessage } from '@wasil/shared'

interface WeeklyForm {
  title: string
  content: string
  weekOf: string
  isCurrent: boolean
}

const emptyForm: WeeklyForm = {
  title: '',
  content: '',
  weekOf: '',
  isCurrent: false,
}

export function WeeklyMessagesPage() {
  const theme = useTheme()
  const { data: messages, refetch } = useApi<WeeklyMessage[]>(() => api.weeklyMessage.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<WeeklyForm>(emptyForm)
  const [editingMessage, setEditingMessage] = useState<WeeklyMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WeeklyMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      if (editingMessage) {
        await api.weeklyMessage.update(editingMessage.id, {
          title: form.title,
          content: form.content,
          weekOf: form.weekOf,
          isCurrent: form.isCurrent,
        })
      } else {
        await api.weeklyMessage.create({
          title: form.title,
          content: form.content,
          weekOf: form.weekOf,
          isCurrent: form.isCurrent,
        })
      }
      setShowForm(false)
      setEditingMessage(null)
      setForm(emptyForm)
      refetch()
    } catch (err) {
      console.error('Failed to save weekly message:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (msg: WeeklyMessage) => {
    setEditingMessage(msg)
    setForm({
      title: msg.title,
      content: msg.content,
      weekOf: msg.weekOf.split('T')[0],
      isCurrent: msg.isCurrent,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingMessage(null)
    setForm(emptyForm)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.weeklyMessage.delete(deleteTarget.id)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      console.error('Failed to delete weekly message:', err)
    }
  }

  const getWeekLabel = (weekOf: string) => {
    const date = new Date(weekOf)
    return `Week of ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Weekly Messages</h2>
        <button
          onClick={() => { setShowForm(true); setEditingMessage(null); setForm(emptyForm) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <Plus className="w-4 h-4" />
          New Message
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingMessage ? 'Edit Message' : 'New Weekly Message'}
            </h3>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={6}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Week Of</label>
              <input
                type="date"
                value={form.weekOf}
                onChange={(e) => setForm((f) => ({ ...f, weekOf: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isCurrent"
                checked={form.isCurrent}
                onChange={(e) => setForm((f) => ({ ...f, isCurrent: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <label htmlFor="isCurrent" className="text-sm text-slate-700">
                Set as current message
              </label>
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
                {isSubmitting ? 'Saving...' : editingMessage ? 'Update Message' : 'Create Message'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Message List */}
      <div className="space-y-3">
        {(messages || []).map((msg) => (
          <div
            key={msg.id}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <h3 className="font-semibold text-slate-900">{msg.title}</h3>
                  {msg.isCurrent && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      <CheckCircle className="w-3 h-3" />
                      Current
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">{getWeekLabel(msg.weekOf)}</p>
                <p className="text-sm text-slate-600 mt-2 line-clamp-2">{msg.content}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {msg.heartCount} heart{msg.heartCount !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => handleEdit(msg)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(msg)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {messages && messages.length === 0 && (
          <p className="text-center text-slate-400 py-8">No weekly messages yet.</p>
        )}
      </div>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Weekly Message"
          message={`Are you sure you want to delete "${deleteTarget.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
