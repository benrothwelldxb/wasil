import React, { useState, useRef } from 'react'
import { Plus, X, Pencil, Trash2, CheckCircle, MessageSquare, Upload, Image, Clock } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type { WeeklyMessage } from '@wasil/shared'

interface WeeklyForm {
  title: string
  content: string
  weekOf: string
  isCurrent: boolean
  imageUrl: string
  scheduledAt: string
}

const emptyForm: WeeklyForm = {
  title: '',
  content: '',
  weekOf: '',
  isCurrent: false,
  imageUrl: '',
  scheduledAt: '',
}

export function WeeklyMessagesPage() {
  const theme = useTheme()
  const toast = useToast()
  const { data: messages, refetch } = useApi<WeeklyMessage[]>(() => api.weeklyMessage.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<WeeklyForm>(emptyForm)
  const [editingMessage, setEditingMessage] = useState<WeeklyMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WeeklyMessage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/messages/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: formData,
      })
      if (!result.ok) throw new Error('Upload failed')
      const data = await result.json()
      setForm(f => ({ ...f, imageUrl: data.fileUrl }))
    } catch (err) {
      console.error('Image upload failed:', err)
      toast.error('Failed to upload image')
    } finally {
      setIsUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        title: form.title,
        content: form.content,
        weekOf: form.weekOf,
        isCurrent: form.isCurrent,
        imageUrl: form.imageUrl || undefined,
        scheduledAt: form.scheduledAt || undefined,
      }
      if (editingMessage) {
        await api.weeklyMessage.update(editingMessage.id, data)
      } else {
        await api.weeklyMessage.create(data)
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
      imageUrl: msg.imageUrl || '',
      scheduledAt: msg.scheduledAt ? msg.scheduledAt.slice(0, 16) : '',
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

  const isScheduledFuture = (msg: WeeklyMessage) => {
    if (!msg.scheduledAt) return false
    return new Date(msg.scheduledAt) > new Date()
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

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Header Image (optional)</label>
              {form.imageUrl ? (
                <div className="relative inline-block">
                  <img
                    src={form.imageUrl}
                    alt="Header"
                    className="h-32 rounded-lg object-cover border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, imageUrl: '' }))}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
                >
                  {isUploading ? (
                    <span>Uploading...</span>
                  ) : (
                    <>
                      <Image className="w-4 h-4" />
                      Upload image
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Schedule For (optional)</label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Leave empty to publish immediately</p>
              </div>
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
                {isSubmitting ? 'Saving...' : form.scheduledAt ? 'Schedule Message' : editingMessage ? 'Update Message' : 'Publish Message'}
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
              <div className="flex-1 flex gap-4">
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MessageSquare className="w-4 h-4 text-slate-400" />
                    <h3 className="font-semibold text-slate-900">{msg.title}</h3>
                    {msg.isCurrent && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Current
                      </span>
                    )}
                    {isScheduledFuture(msg) && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                        <Clock className="w-3 h-3" />
                        Scheduled {new Date(msg.scheduledAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{getWeekLabel(msg.weekOf)}</p>
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">{msg.content}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {msg.heartCount} heart{msg.heartCount !== 1 ? 's' : ''}
                  </p>
                </div>
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
