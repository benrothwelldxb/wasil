import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTheme } from '@wasil/shared'
import type { FormField, FormFieldType, FormStatus } from '@wasil/shared'
import type { AudienceOption } from './MessageForm'

export interface FormFormData {
  title: string
  description: string
  type: string
  status: FormStatus
  fields: FormField[]
  targetClass: string
  classIds: string[]
  yearGroupIds: string[]
  expiresAt?: string
}

interface FormFormProps {
  formData: FormFormData
  onChange: (data: FormFormData) => void
  onSubmit: (e: React.FormEvent) => void
  audienceOptions?: AudienceOption[]
  isSubmitting: boolean
  submitLabel?: string
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select / Dropdown' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
]

export function FormForm({
  formData,
  onChange,
  onSubmit,
  audienceOptions,
  isSubmitting,
  submitLabel = 'Create Form',
}: FormFormProps) {
  const theme = useTheme()

  const isWholeSchool = formData.classIds.length === 0 && formData.yearGroupIds.length === 0

  const handleWholeSchoolToggle = (checked: boolean) => {
    if (checked) {
      onChange({ ...formData, targetClass: 'Whole School', classIds: [], yearGroupIds: [] })
    }
    // If unchecking, do nothing — they'll pick specific audiences
  }

  const handleAudienceToggle = (opt: AudienceOption, checked: boolean) => {
    let newClassIds = [...formData.classIds]
    let newYearGroupIds = [...formData.yearGroupIds]

    if (opt.type === 'class' && opt.id) {
      if (checked) {
        newClassIds.push(opt.id)
      } else {
        newClassIds = newClassIds.filter(id => id !== opt.id)
      }
    } else if (opt.type === 'yearGroup' && opt.id) {
      if (checked) {
        newYearGroupIds.push(opt.id)
      } else {
        newYearGroupIds = newYearGroupIds.filter(id => id !== opt.id)
      }
    }

    // Build targetClass display label from selected names
    const selectedNames: string[] = []
    if (audienceOptions) {
      for (const ao of audienceOptions) {
        if (ao.type === 'class' && ao.id && newClassIds.includes(ao.id)) selectedNames.push(ao.value)
        if (ao.type === 'yearGroup' && ao.id && newYearGroupIds.includes(ao.id)) selectedNames.push(ao.value)
      }
    }
    const targetClass = selectedNames.length === 0 ? 'Whole School' : selectedNames.join(', ')

    onChange({ ...formData, classIds: newClassIds, yearGroupIds: newYearGroupIds, targetClass })
  }

  const updateField = (idx: number, updates: Partial<FormField>) => {
    const newFields = [...formData.fields]
    newFields[idx] = { ...newFields[idx], ...updates }
    onChange({ ...formData, fields: newFields })
  }

  const removeField = (idx: number) => {
    onChange({ ...formData, fields: formData.fields.filter((_, i) => i !== idx) })
  }

  const addField = () => {
    const newField: FormField = {
      id: `field_custom_${Date.now()}`,
      type: 'text',
      label: '',
      required: false,
      removable: true,
    }
    onChange({ ...formData, fields: [...formData.fields, newField] })
  }

  // Group audience options by year group
  const nonSchoolOptions = (audienceOptions || []).filter(o => o.type !== 'school')

  return (
    <form onSubmit={onSubmit} className="bg-gray-50 rounded-lg p-4 mb-6">
      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={e => onChange({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={e => onChange({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            rows={2}
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={formData.status}
            onChange={e => onChange({ ...formData, status: e.target.value as FormStatus })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {/* Target Audience — multi-select with checkboxes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
          <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isWholeSchool}
                onChange={e => handleWholeSchoolToggle(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm font-medium text-gray-900">Whole School</span>
            </label>
            {nonSchoolOptions.length > 0 && (
              <div className="border-t border-gray-100 pt-2 space-y-1.5">
                {nonSchoolOptions.map(opt => {
                  const isChecked = opt.type === 'class'
                    ? formData.classIds.includes(opt.id!)
                    : formData.yearGroupIds.includes(opt.id!)
                  return (
                    <label
                      key={`${opt.type}-${opt.id}`}
                      className={`flex items-center gap-2 cursor-pointer ${opt.type === 'class' ? 'ml-4' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={!isWholeSchool && isChecked}
                        disabled={isWholeSchool}
                        onChange={e => handleAudienceToggle(opt, e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className={`text-sm ${opt.type === 'yearGroup' ? 'font-medium text-gray-800' : 'text-gray-600'}`}>
                        {opt.value}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          {!isWholeSchool && (
            <p className="text-xs text-gray-500 mt-1">
              Selected: {formData.targetClass}
            </p>
          )}
        </div>

        {/* Expiry */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Expires at (optional)</label>
          <input
            type="datetime-local"
            value={formData.expiresAt ? formData.expiresAt.slice(0, 16) : ''}
            onChange={e => onChange({ ...formData, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        {/* Fields */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fields</label>
          <div className="space-y-3">
            {formData.fields.map((field, idx) => (
              <div key={field.id} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={field.label}
                        onChange={e => updateField(idx, { label: e.target.value })}
                        placeholder="Field label"
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                        required
                      />
                      <select
                        value={field.type}
                        onChange={e => updateField(idx, { type: e.target.value as FormFieldType })}
                        className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                      >
                        {FIELD_TYPES.map(ft => (
                          <option key={ft.value} value={ft.value}>{ft.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={e => updateField(idx, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      {field.placeholder !== undefined && (
                        <input
                          type="text"
                          value={field.placeholder || ''}
                          onChange={e => updateField(idx, { placeholder: e.target.value })}
                          placeholder="Placeholder text"
                          className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
                        />
                      )}
                    </div>
                    {/* Options for select fields */}
                    {field.type === 'select' && (
                      <div className="space-y-1">
                        {(field.options || []).map((opt, optIdx) => (
                          <div key={optIdx} className="flex gap-1">
                            <input
                              type="text"
                              value={opt}
                              onChange={e => {
                                const newOpts = [...(field.options || [])]
                                newOpts[optIdx] = e.target.value
                                updateField(idx, { options: newOpts })
                              }}
                              placeholder={`Option ${optIdx + 1}`}
                              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newOpts = (field.options || []).filter((_, i) => i !== optIdx)
                                updateField(idx, { options: newOpts })
                              }}
                              className="text-gray-400 hover:text-red-500 p-1"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => updateField(idx, { options: [...(field.options || []), ''] })}
                          className="text-xs hover:underline"
                          style={{ color: theme.colors.brandColor }}
                        >
                          + Add Option
                        </button>
                      </div>
                    )}
                  </div>
                  {field.removable && (
                    <button
                      type="button"
                      onClick={() => removeField(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addField}
            className="mt-2 flex items-center gap-1 text-sm hover:underline"
            style={{ color: theme.colors.brandColor }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Field
          </button>
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
