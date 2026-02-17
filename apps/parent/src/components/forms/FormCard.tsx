import React, { useState } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from '@wasil/shared'
import type { Form, FormField } from '@wasil/shared'

interface FormCardProps {
  form: Form
  onRespond: (formId: string, answers: Record<string, unknown>) => void
  classColors?: Record<string, { bg: string; text?: string; hex?: string }>
}

export function FormCard({ form, onRespond, classColors = {} }: FormCardProps) {
  const theme = useTheme()
  const fields = form.fields as FormField[]
  const hasResponded = !!form.userResponse

  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    if (form.userResponse) {
      return form.userResponse.answers as Record<string, unknown>
    }
    const initial: Record<string, unknown> = {}
    fields.forEach(f => {
      initial[f.id] = f.type === 'checkbox' ? false : ''
    })
    return initial
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = () => {
    // Validate required fields
    const newErrors: Record<string, string> = {}
    fields.forEach(f => {
      if (f.required) {
        const val = answers[f.id]
        if (val === undefined || val === null || val === '' || val === false) {
          newErrors[f.id] = `${f.label} is required`
        }
      }
    })
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})
    onRespond(form.id, answers)
  }

  const updateAnswer = (fieldId: string, value: unknown) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }))
    if (errors[fieldId]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
  }

  const classColor = classColors[form.targetClass] || { bg: 'bg-burgundy' }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <span
          className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${classColor.bg} ${classColor.text || 'text-white'}`}
          style={
            form.targetClass === 'Whole School'
              ? { backgroundColor: theme.colors.brandColor, color: 'white' }
              : undefined
          }
        >
          {form.targetClass}
        </span>
        {hasResponded && (
          <span className="flex items-center space-x-1 text-green-600 text-xs font-medium">
            <Check className="h-3 w-3" />
            <span>Completed</span>
          </span>
        )}
      </div>

      <h3 className="font-semibold text-gray-900 mb-1">{form.title}</h3>
      {form.description && <p className="text-sm text-gray-500 mb-4">{form.description}</p>}

      <div className="space-y-4">
        {fields.map(field => (
          <div key={field.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>

            {field.type === 'text' && (
              <input
                type="text"
                value={(answers[field.id] as string) || ''}
                onChange={e => updateAnswer(field.id, e.target.value)}
                placeholder={field.placeholder}
                disabled={hasResponded}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
              />
            )}

            {field.type === 'textarea' && (
              <textarea
                value={(answers[field.id] as string) || ''}
                onChange={e => updateAnswer(field.id, e.target.value)}
                placeholder={field.placeholder}
                disabled={hasResponded}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
              />
            )}

            {field.type === 'number' && (
              <input
                type="number"
                value={(answers[field.id] as string) || ''}
                onChange={e => updateAnswer(field.id, e.target.value)}
                placeholder={field.placeholder}
                disabled={hasResponded}
                min={field.validation?.min}
                max={field.validation?.max}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
              />
            )}

            {field.type === 'date' && (
              <input
                type="date"
                value={(answers[field.id] as string) || ''}
                onChange={e => updateAnswer(field.id, e.target.value)}
                disabled={hasResponded}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
              />
            )}

            {field.type === 'checkbox' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!answers[field.id]}
                  onChange={e => updateAnswer(field.id, e.target.checked)}
                  disabled={hasResponded}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700">{field.placeholder || field.label}</span>
              </label>
            )}

            {field.type === 'select' && (
              <div className="space-y-2">
                {(field.options || []).map(option => (
                  <button
                    key={option}
                    onClick={() => !hasResponded && updateAnswer(field.id, option)}
                    disabled={hasResponded}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                      answers[field.id] === option
                        ? 'border-2'
                        : 'border-gray-200 hover:border-gray-300'
                    } ${hasResponded ? 'cursor-default' : 'cursor-pointer'}`}
                    style={
                      answers[field.id] === option
                        ? { borderColor: theme.colors.brandColor, backgroundColor: `${theme.colors.brandColor}10` }
                        : undefined
                    }
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          answers[field.id] === option ? '' : 'border-gray-300'
                        }`}
                        style={answers[field.id] === option ? { borderColor: theme.colors.brandColor } : undefined}
                      >
                        {answers[field.id] === option && (
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.colors.brandColor }} />
                        )}
                      </div>
                      <span className={`text-sm ${answers[field.id] === option ? 'font-medium' : 'text-gray-700'}`}>
                        {option}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {errors[field.id] && (
              <p className="text-xs text-red-500 mt-1">{errors[field.id]}</p>
            )}
          </div>
        ))}
      </div>

      {!hasResponded && (
        <button
          onClick={handleSubmit}
          className="mt-4 w-full py-2 rounded-lg text-white font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          Submit
        </button>
      )}
    </div>
  )
}
