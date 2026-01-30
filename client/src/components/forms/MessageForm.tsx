import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'

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
}

export interface AudienceOption {
  value: string // display label e.g. "Whole School", "Reception", "Foxes"
  type: 'school' | 'yearGroup' | 'class'
  id?: string // yearGroupId or classId
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

  return (
    <form onSubmit={onSubmit} className="bg-gray-50 rounded-lg p-4 mb-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => onChange({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-burgundy focus:border-burgundy"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
          <textarea
            value={formData.content}
            onChange={(e) => onChange({ ...formData, content: e.target.value })}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-burgundy focus:border-burgundy"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
          <select
            value={formData.targetClass}
            onChange={(e) => handleAudienceChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-burgundy focus:border-burgundy"
          >
            {audienceOptions ? (
              audienceOptions.map((opt) => (
                <option
                  key={`${opt.type}-${opt.id || opt.value}`}
                  value={opt.value}
                  style={opt.type === 'class' ? { paddingLeft: '1.5rem' } : undefined}
                >
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Show Until (optional)</label>
          <input
            type="date"
            value={formData.expiresAt}
            onChange={(e) => onChange({ ...formData, expiresAt: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-burgundy focus:border-burgundy"
          />
          <p className="text-xs text-gray-500 mt-1">Message will be hidden from parents after this date</p>
        </div>
        <div className="flex items-center flex-wrap gap-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isPinned"
              checked={formData.isPinned}
              onChange={(e) => onChange({ ...formData, isPinned: e.target.checked })}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="isPinned" className="text-sm text-gray-700">Pin to top</label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isUrgent"
              checked={formData.isUrgent}
              onChange={(e) => onChange({ ...formData, isUrgent: e.target.checked })}
              className="rounded text-red-600 focus:ring-red-500"
            />
            <label htmlFor="isUrgent" className="text-sm text-gray-700">Mark as urgent</label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="hasAction"
              checked={formData.hasAction}
              onChange={(e) => onChange({ ...formData, hasAction: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="hasAction" className="text-sm text-gray-700">Requires action</label>
          </div>
        </div>
        {formData.hasAction && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
              <select
                value={formData.actionType}
                onChange={(e) => onChange({ ...formData, actionType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="consent">Consent</option>
                <option value="payment">Payment</option>
                <option value="rsvp">RSVP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={formData.actionDueDate}
                onChange={(e) => onChange({ ...formData, actionDueDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
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
