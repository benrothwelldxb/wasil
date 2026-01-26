import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'

export interface MessageFormData {
  title: string
  content: string
  targetClass: string
  hasAction: boolean
  actionType: string
  actionLabel: string
  actionDueDate: string
  actionAmount: string
}

interface MessageFormProps {
  formData: MessageFormData
  onChange: (data: MessageFormData) => void
  onSubmit: (e: React.FormEvent) => void
  targetClassOptions: string[]
  isSubmitting: boolean
}

export function MessageForm({
  formData,
  onChange,
  onSubmit,
  targetClassOptions,
  isSubmitting,
}: MessageFormProps) {
  const theme = useTheme()

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
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Class</label>
          <select
            value={formData.targetClass}
            onChange={(e) => onChange({ ...formData, targetClass: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-burgundy focus:border-burgundy"
          >
            {targetClassOptions.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="hasAction"
            checked={formData.hasAction}
            onChange={(e) => onChange({ ...formData, hasAction: e.target.checked })}
            className="rounded"
          />
          <label htmlFor="hasAction" className="text-sm text-gray-700">Requires action from parents</label>
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
          {isSubmitting ? 'Sending...' : 'Send Message'}
        </button>
      </div>
    </form>
  )
}
