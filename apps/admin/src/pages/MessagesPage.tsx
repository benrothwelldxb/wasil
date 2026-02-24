import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2 } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { Message, Class, YearGroup, Group } from '@wasil/shared'
import { MessageForm } from '../components/forms'
import type { MessageFormData, AudienceOption } from '../components/forms'

export function MessagesPage() {
  const theme = useTheme()
  const { data: messages, refetch: refetchMessages } = useApi<Message[]>(() => api.messages.listAll(), [])
  const { data: yearGroups } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])
  const { data: groups } = useApi<Group[]>(() => api.groups.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)
  const [formData, setFormData] = useState<MessageFormData>({
    title: '', content: '', targetClass: 'Whole School', isPinned: false, isUrgent: false,
    expiresAt: '', hasAction: false, actionType: 'consent', actionLabel: '', actionDueDate: '', actionAmount: '',
  })

  const activeGroups = (groups || []).filter(g => g.isActive)
  const audienceOptions: AudienceOption[] = [
    { value: 'Whole School', type: 'school' },
    ...(yearGroups || []).flatMap(yg => {
      const ygClasses = (classes || []).filter(c => c.yearGroupId === yg.id)
      return [
        { value: yg.name, type: 'yearGroup' as const, id: yg.id },
        ...ygClasses.map(c => ({ value: c.name, type: 'class' as const, id: c.id })),
      ]
    }),
    ...(classes || []).filter(c => !c.yearGroupId).map(c => ({ value: c.name, type: 'class' as const, id: c.id })),
    ...(activeGroups.length > 0 ? [
      { value: '── Groups ──', type: 'divider' as const },
      ...activeGroups.map(g => ({ value: g.name, type: 'group' as const, id: g.id })),
    ] : []),
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        title: formData.title, content: formData.content, targetClass: formData.targetClass,
        classId: formData.classId || undefined, yearGroupId: formData.yearGroupId || undefined,
        groupId: formData.groupId || undefined,
        isPinned: formData.isPinned, isUrgent: formData.isUrgent, expiresAt: formData.expiresAt || undefined,
        formId: formData.formId || undefined,
        ...(formData.hasAction && { actionType: formData.actionType, actionLabel: formData.actionLabel, actionDueDate: formData.actionDueDate, actionAmount: formData.actionAmount }),
      }
      if (editingMessage) {
        await api.messages.update(editingMessage.id, data)
        setEditingMessage(null)
      } else {
        await api.messages.create(data)
      }
      resetForm()
      refetchMessages()
    } catch (error) {
      alert(`Failed to save message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (message: Message) => {
    setFormData({
      title: message.title, content: message.content, targetClass: message.targetClass,
      isPinned: message.isPinned || false, isUrgent: message.isUrgent || false,
      expiresAt: message.expiresAt ? message.expiresAt.split('T')[0] : '',
      hasAction: !!message.actionType, actionType: message.actionType || 'consent',
      actionLabel: message.actionLabel || '', actionDueDate: message.actionDueDate || '', actionAmount: message.actionAmount || '',
      formId: message.formId || undefined,
    })
    setEditingMessage(message)
    setShowForm(true)
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingMessage(null)
    setFormData({ title: '', content: '', targetClass: 'Whole School', isPinned: false, isUrgent: false, expiresAt: '', hasAction: false, actionType: 'consent', actionLabel: '', actionDueDate: '', actionAmount: '' })
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await api.messages.delete(deleteConfirm.id)
      refetchMessages()
      setDeleteConfirm(null)
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Messages</h2>
        <button onClick={() => showForm ? resetForm() : setShowForm(true)} className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white" style={{ backgroundColor: theme.colors.brandColor }}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showForm ? 'Cancel' : 'New Message'}</span>
        </button>
      </div>

      {showForm && (
        <MessageForm formData={formData} onChange={setFormData} onSubmit={handleSubmit} audienceOptions={audienceOptions} isSubmitting={isSubmitting} submitLabel={editingMessage ? 'Update Message' : 'Send Message'} />
      )}

      <div className="space-y-3">
        {messages?.map((message) => (
          <div key={message.id} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs px-2 py-1 rounded-full text-white" style={{ backgroundColor: theme.colors.brandColor }}>{message.targetClass}</span>
                  {message.isPinned && <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">Pinned</span>}
                  {message.isUrgent && <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">Urgent</span>}
                  {message.formId && <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">Form</span>}
                </div>
                <h4 className="font-medium mt-2">{message.title}</h4>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{message.content}</p>
                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                  <span>{new Date(message.createdAt).toLocaleDateString()}</span>
                  {message.acknowledgmentCount !== undefined && <span>{message.acknowledgmentCount} acknowledged</span>}
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button onClick={() => handleEdit(message)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setDeleteConfirm({ id: message.id, title: message.title })} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {deleteConfirm && (
        <ConfirmModal title="Delete Message?" message={`Are you sure you want to delete "${deleteConfirm.title}"? This action cannot be undone.`} confirmLabel="Delete" variant="danger" isLoading={isDeleting} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} />
      )}
    </div>
  )
}
