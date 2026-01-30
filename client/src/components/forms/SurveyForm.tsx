import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import type { AudienceOption } from './MessageForm'

export interface SurveyFormData {
  question: string
  options: string[]
  targetClass: string
  classId?: string
  yearGroupId?: string
}

interface SurveyFormProps {
  formData: SurveyFormData
  onChange: (data: SurveyFormData) => void
  onSubmit: (e: React.FormEvent) => void
  audienceOptions?: AudienceOption[]
  targetClassOptions?: string[]
  isSubmitting: boolean
  submitLabel?: string
}

export function SurveyForm({
  formData,
  onChange,
  onSubmit,
  audienceOptions,
  targetClassOptions,
  isSubmitting,
  submitLabel = 'Create Survey',
}: SurveyFormProps) {
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

  return (
    <form onSubmit={onSubmit} className="bg-gray-50 rounded-lg p-4 mb-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
          <input
            type="text"
            value={formData.question}
            onChange={(e) => onChange({ ...formData, question: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
          {formData.options.map((option, idx) => (
            <input
              key={idx}
              type="text"
              value={option}
              onChange={(e) => {
                const newOptions = [...formData.options]
                newOptions[idx] = e.target.value
                onChange({ ...formData, options: newOptions })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
              placeholder={`Option ${idx + 1}`}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...formData, options: [...formData.options, ''] })}
            className="text-sm hover:underline"
            style={{ color: theme.colors.brandColor }}
          >
            + Add Option
          </button>
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
                <option
                  key={`${opt.type}-${opt.id || opt.value}`}
                  value={opt.value}
                >
                  {opt.type === 'class' ? `  └ ${opt.value}` : opt.value}
                </option>
              ))
            ) : (
              (targetClassOptions || ['Whole School']).map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))
            )}
          </select>
        </div>
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
