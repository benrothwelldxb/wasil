import React from 'react'
import { Plus, Trash2, ChevronDown, SeparatorHorizontal, PenTool } from 'lucide-react'
import { useTheme } from '@wasil/shared'
import type { FormField, FormFieldType, FormFieldCondition, FormStatus } from '@wasil/shared'
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
  { value: 'signature', label: 'Signature' },
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

  const addField = (type: FormFieldType = 'text') => {
    const maxPage = formData.fields.reduce((max, f) => Math.max(max, f.page || 0), 0)
    const newField: FormField = {
      id: `field_custom_${Date.now()}`,
      type,
      label: type === 'signature' ? 'Signature' : '',
      required: type === 'signature',
      removable: true,
      page: maxPage, // add to last page
    }
    onChange({ ...formData, fields: [...formData.fields, newField] })
  }

  const addPageBreak = () => {
    const maxPage = formData.fields.reduce((max, f) => Math.max(max, f.page || 0), 0)
    // Bump all fields after the last one to the next page
    // Actually just add a new field on the next page
    const newField: FormField = {
      id: `field_custom_${Date.now()}`,
      type: 'text',
      label: '',
      required: false,
      removable: true,
      page: maxPage + 1,
    }
    onChange({ ...formData, fields: [...formData.fields, newField] })
  }

  // Get all pages
  const pages = [...new Set(formData.fields.map(f => f.page || 0))].sort((a, b) => a - b)
  const isMultiPage = pages.length > 1

  // Get fields that can be used as conditions (checkbox and select on previous pages or same page)
  const getConditionableFields = (currentFieldIdx: number) => {
    return formData.fields
      .slice(0, currentFieldIdx)
      .filter(f => f.type === 'checkbox' || f.type === 'select')
  }

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

        {/* Target Audience */}
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

          {/* Render by page */}
          {pages.map(pageNum => {
            const pageFields = formData.fields
              .map((f, idx) => ({ field: f, idx }))
              .filter(({ field }) => (field.page || 0) === pageNum)

            return (
              <div key={pageNum} className="mb-4">
                {isMultiPage && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Page {pageNum + 1}
                    </span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>
                )}
                <div className="space-y-3">
                  {pageFields.map(({ field, idx }) => (
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
                          <div className="flex items-center gap-4 flex-wrap">
                            <label className="flex items-center gap-1.5 text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={e => updateField(idx, { required: e.target.checked })}
                              />
                              Required
                            </label>
                            {isMultiPage && (
                              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                Page
                                <select
                                  value={field.page || 0}
                                  onChange={e => updateField(idx, { page: parseInt(e.target.value) })}
                                  className="px-1 py-0.5 border border-gray-200 rounded text-xs"
                                >
                                  {pages.map(p => (
                                    <option key={p} value={p}>Page {p + 1}</option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>

                          {/* Conditional logic */}
                          {getConditionableFields(idx).length > 0 && (
                            <div className="border-t border-gray-100 pt-2">
                              {field.condition ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-500">Show when</span>
                                  <select
                                    value={field.condition.fieldId}
                                    onChange={e => {
                                      const targetField = formData.fields.find(f => f.id === e.target.value)
                                      const op = targetField?.type === 'checkbox' ? 'is_checked' : 'equals'
                                      updateField(idx, { condition: { fieldId: e.target.value, operator: op, value: '' } })
                                    }}
                                    className="px-1.5 py-1 border border-gray-200 rounded text-xs"
                                  >
                                    {getConditionableFields(idx).map(f => (
                                      <option key={f.id} value={f.id}>{f.label || 'Untitled'}</option>
                                    ))}
                                  </select>
                                  {(() => {
                                    const condField = formData.fields.find(f => f.id === field.condition?.fieldId)
                                    if (condField?.type === 'checkbox') {
                                      return (
                                        <select
                                          value={field.condition.operator}
                                          onChange={e => updateField(idx, { condition: { ...field.condition!, operator: e.target.value as any } })}
                                          className="px-1.5 py-1 border border-gray-200 rounded text-xs"
                                        >
                                          <option value="is_checked">is checked</option>
                                          <option value="is_not_checked">is not checked</option>
                                        </select>
                                      )
                                    }
                                    if (condField?.type === 'select') {
                                      return (
                                        <>
                                          <select
                                            value={field.condition.operator}
                                            onChange={e => updateField(idx, { condition: { ...field.condition!, operator: e.target.value as any } })}
                                            className="px-1.5 py-1 border border-gray-200 rounded text-xs"
                                          >
                                            <option value="equals">equals</option>
                                            <option value="not_equals">does not equal</option>
                                          </select>
                                          <select
                                            value={field.condition.value || ''}
                                            onChange={e => updateField(idx, { condition: { ...field.condition!, value: e.target.value } })}
                                            className="px-1.5 py-1 border border-gray-200 rounded text-xs"
                                          >
                                            <option value="">Select...</option>
                                            {(condField.options || []).map(o => (
                                              <option key={o} value={o}>{o}</option>
                                            ))}
                                          </select>
                                        </>
                                      )
                                    }
                                    return null
                                  })()}
                                  <button
                                    type="button"
                                    onClick={() => updateField(idx, { condition: undefined })}
                                    className="text-xs text-red-400 hover:text-red-600"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const condFields = getConditionableFields(idx)
                                    if (condFields.length > 0) {
                                      const f = condFields[0]
                                      const op = f.type === 'checkbox' ? 'is_checked' : 'equals'
                                      updateField(idx, { condition: { fieldId: f.id, operator: op as any, value: '' } })
                                    }
                                  }}
                                  className="text-xs hover:underline"
                                  style={{ color: '#5B8EC4' }}
                                >
                                  + Add condition
                                </button>
                              )}
                            </div>
                          )}

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

                          {/* Signature preview */}
                          {field.type === 'signature' && (
                            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-3 text-center">
                              <PenTool className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                              <p className="text-xs text-gray-400">Signature pad will appear here for parents</p>
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
              </div>
            )
          })}

          {/* Add field buttons */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button
              type="button"
              onClick={() => addField()}
              className="flex items-center gap-1 text-sm hover:underline"
              style={{ color: theme.colors.brandColor }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Field
            </button>
            <button
              type="button"
              onClick={() => addField('signature')}
              className="flex items-center gap-1 text-sm hover:underline"
              style={{ color: '#8B6EAE' }}
            >
              <PenTool className="h-3.5 w-3.5" />
              Add Signature
            </button>
            <button
              type="button"
              onClick={addPageBreak}
              className="flex items-center gap-1 text-sm hover:underline"
              style={{ color: '#5B8EC4' }}
            >
              <SeparatorHorizontal className="h-3.5 w-3.5" />
              Add Page Break
            </button>
          </div>
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
