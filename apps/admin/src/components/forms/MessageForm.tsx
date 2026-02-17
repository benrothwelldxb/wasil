import React from 'react'
import { useTheme, useApi, api } from '@wasil/shared'
import type { Form } from '@wasil/shared'

export interface MessageFormData {
  title: string
  content: string
  targetClass: string
  classId?: string
  yearGroupId?: string
  isPinned: boolean
  isUrgent: boolean
  expiresAt: string
  hasAction: boolean
  actionType: string
  actionLabel: string
  actionDueDate: string
  actionAmount: string
  formId?: string
}

export interface AudienceOption {
  value: string
  type: 'school' | 'yearGroup' | 'class'
  id?: string
}

interface MessageFormProps {
  formData: MessageFormData
  onChange: (data: MessageFormData) => void
  onSubmit: (e: React.FormEvent) => void
  audienceOptions?: AudienceOption[]
  targetClassOptions?: string[]
  isSubmitting: boolean
  submitLabel?: string
}

const FORM_TYPE_LABELS: Record<string, string> = {
  'permission-consent': 'Permission',
  'trip-consent': 'Trip',
  'payment-request': 'Payment',
  'medical-info': 'Medical',
  'general-info': 'General',
  'quick-poll': 'Poll',
}

export function MessageForm({
  formData,
  onChange,
  onSubmit,
  audienceOptions,
  targetClassOptions,
  isSubmitting,
  submitLabel = 'Send Message',
}: MessageFormProps) {
  const theme = useTheme()
  const { data: availableForms } = useApi<Form[]>(() => api.forms.listAvailable(), [])

  const handleAudienceChange = (value: string) => {
    if (audienceOptions) {
      const option = audienceOptions.find(o => o.value === value)
      if (option) {
        onChange({
          ...formData,
          targetClass: option.value,
          classId: option.type === 'class' ? option.id : undefined,
          yearGroupId: option.type === 'yearGroup' ? option.id : undefined,
        })
        return
      }
    }
    onChange({ ...formData, targetClass: value, classId: undefined, yearGroupId: undefined })
  }

  const options = audienceOptions
    ? audienceOptions.map(o => o.value)
    : (targetClassOptions || ['Whole School'])

  const selectedForm = availableForms?.find(f => f.id === formData.formId)

  return (
    <form onSubmit={onSubmit} className="bg-gray-50 rounded-lg p-4 mb-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => onChange({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
          <textarea
            value={formData.content}
            onChange={(e) => onChange({ ...formData, content: e.target.value })}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
          <select
            value={formData.targetClass}
            onChange={(e) => handleAudienceChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            {audienceOptions ? (
              audienceOptions.map((opt) => (
                <option key={`${opt.type}-${opt.id || opt.value}`} value={opt.value}>
                  {opt.type === 'class' ? `  └ ${opt.value}` : opt.value}
                </option>
              ))
            ) : (
              options.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))
            )}
          </select>
        </div>

        {/* Attach Form */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Attach Form</label>
          <select
            value={formData.formId || ''}
            onChange={(e) => onChange({ ...formData, formId: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">No form attached</option>
            {availableForms?.map(f => (
              <option key={f.id} value={f.id}>
                {f.title} [{FORM_TYPE_LABELS[f.type] || f.type}]
              </option>
            ))}
          </select>
          {selectedForm && (
            <div className="mt-2 p-2 bg-white rounded border border-gray-200 text-sm">
              <span className="font-medium">{selectedForm.title}</span>
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                {FORM_TYPE_LABELS[selectedForm.type] || selectedForm.type}
              </span>
              <span className="ml-2 text-gray-500">{(selectedForm.fields as any[]).length} fields</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Show Until (optional)</label>
          <input
            type="date"
            value={formData.expiresAt}
            onChange={(e) => onChange({ ...formData, expiresAt: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">Message will be hidden from parents after this date</p>
        </div>
        <div className="flex items-center flex-wrap gap-4">
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="isPinned" checked={formData.isPinned} onChange={(e) => onChange({ ...formData, isPinned: e.target.checked })} className="rounded" />
            <label htmlFor="isPinned" className="text-sm text-gray-700">Pin to top</label>
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="isUrgent" checked={formData.isUrgent} onChange={(e) => onChange({ ...formData, isUrgent: e.target.checked })} className="rounded" />
            <label htmlFor="isUrgent" className="text-sm text-gray-700">Mark as urgent</label>
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="hasAction" checked={formData.hasAction} onChange={(e) => onChange({ ...formData, hasAction: e.target.checked })} className="rounded" />
            <label htmlFor="hasAction" className="text-sm text-gray-700">Requires action</label>
          </div>
        </div>
        {formData.hasAction && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
              <select value={formData.actionType} onChange={(e) => onChange({ ...formData, actionType: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="consent">Consent</option>
                <option value="payment">Payment</option>
                <option value="rsvp">RSVP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={formData.actionDueDate} onChange={(e) => onChange({ ...formData, actionDueDate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          {isSubmitting ? 'Please wait...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
