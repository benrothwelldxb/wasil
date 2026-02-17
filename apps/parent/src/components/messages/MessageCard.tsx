import React, { useState } from 'react'
import { ThumbsUp, Share2, AlertTriangle, Pin, Check, Clock } from 'lucide-react'
import { useTheme } from '@wasil/shared'
import type { Message, FormField } from '@wasil/shared'

interface MessageCardProps {
  message: Message
  onAcknowledge?: (id: string) => void
  onFormRespond?: (formId: string, answers: Record<string, unknown>) => void
  showAcknowledgeButton?: boolean
  classColors?: Record<string, { bg: string; hex: string }>
}

export function MessageCard({
  message,
  onAcknowledge,
  onFormRespond,
  showAcknowledgeButton = true,
  classColors = {},
}: MessageCardProps) {
  const theme = useTheme()

  const form = message.form
  const hasForm = !!form
  const hasResponded = !!form?.userResponse

  // Form urgency banner logic
  const getFormBanner = () => {
    if (!hasForm || hasResponded) return null
    if (!form.expiresAt) return null

    const now = new Date()
    const expires = new Date(form.expiresAt)
    const diffMs = expires.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { color: 'bg-gray-500', text: 'Form expired' }
    }
    if (diffDays === 0) {
      return { color: 'bg-red-500', text: 'Form requiring your input \u2014 due today' }
    }
    if (diffDays <= 3) {
      return { color: 'bg-amber-500', text: `Form requiring your input \u2014 ${diffDays} day${diffDays === 1 ? '' : 's'} remaining` }
    }
    return null
  }

  const formBanner = getFormBanner()

  // Inline form state
  const fields = (form?.fields || []) as FormField[]
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    if (form?.userResponse) {
      return form.userResponse.answers as Record<string, unknown>
    }
    const initial: Record<string, unknown> = {}
    fields.forEach(f => {
      initial[f.id] = f.type === 'checkbox' ? false : ''
    })
    return initial
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleFormSubmit = () => {
    if (!form || !onFormRespond) return
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
    onFormRespond(form.id, answers)
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

  const getActionBadge = () => {
    if (!message.actionType) return null

    const badges: Record<string, { label: string; bg: string; text: string }> = {
      consent: {
        label: message.actionLabel || 'Medical Form Required',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
      },
      payment: {
        label: message.actionLabel || 'Payment Due',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
      },
      rsvp: {
        label: message.actionLabel || 'RSVP Required',
        bg: 'bg-purple-50',
        text: 'text-purple-700',
      },
    }

    const badge = badges[message.actionType] || badges.consent
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
        <AlertTriangle className="h-4 w-4 mr-1" />
        {badge.label}
      </span>
    )
  }

  const classHexColor = classColors[message.targetClass]?.hex
  const headerColor = message.classId
    ? (classHexColor || '#4B5563')
    : theme.colors.brandColor

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.toLocaleDateString('en-GB')}, ${date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`
  }

  const isUrgent = message.isUrgent
  const isPinned = message.isPinned

  return (
    <div
      className={`bg-white rounded-xl shadow-sm overflow-hidden ${
        isUrgent ? 'ring-2 ring-red-500 border-red-500' : 'border border-gray-100'
      }`}
    >
      {/* Urgent Banner */}
      {isUrgent && (
        <div className="bg-red-500 px-4 py-1.5 flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 text-white" />
          <span className="text-white text-sm font-semibold">Urgent Message</span>
        </div>
      )}

      {/* Form Urgency Banner */}
      {formBanner && (
        <div className={`${formBanner.color} px-4 py-1.5 flex items-center space-x-2`}>
          <Clock className="h-4 w-4 text-white" />
          <span className="text-white text-sm font-semibold">{formBanner.text}</span>
        </div>
      )}

      {/* Colored Header */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ backgroundColor: headerColor }}
      >
        <div className="flex items-center space-x-2">
          {isPinned && (
            <Pin className="h-4 w-4 text-white opacity-80" style={{ transform: 'rotate(45deg)' }} />
          )}
          <span className="text-white text-sm font-medium">{message.targetClass}</span>
        </div>
        <button className="text-white opacity-80 hover:opacity-100">
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title and Action Badge */}
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-gray-900 text-lg">{message.title}</h3>
          <div className="flex items-center space-x-2">
            {hasForm && hasResponded && (
              <span className="flex items-center space-x-1 text-green-600 text-sm font-medium">
                <Check className="h-4 w-4" />
                <span>Completed</span>
              </span>
            )}
            {getActionBadge()}
          </div>
        </div>

        {/* Due Date Box */}
        {message.actionDueDate && (
          <div
            className="mb-3 p-3 rounded-lg border-l-4"
            style={{
              backgroundColor: `${theme.colors.accentColor}15`,
              borderLeftColor: theme.colors.accentColor,
            }}
          >
            <span className="text-sm font-medium" style={{ color: theme.colors.brandColor }}>
              Due: {formatDate(message.actionDueDate)}
              {message.actionAmount && ` \u2022 ${message.actionAmount}`}
            </span>
          </div>
        )}

        {/* Message Content */}
        <p className="text-gray-700 mb-4">{message.content}</p>

        {/* Inline Form Fields */}
        {hasForm && !hasResponded && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-1">{form.title}</h4>
            {form.description && <p className="text-sm text-gray-500 mb-3">{form.description}</p>}
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
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  )}

                  {field.type === 'textarea' && (
                    <textarea
                      value={(answers[field.id] as string) || ''}
                      onChange={e => updateAnswer(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  )}

                  {field.type === 'number' && (
                    <input
                      type="number"
                      value={(answers[field.id] as string) || ''}
                      onChange={e => updateAnswer(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      min={field.validation?.min}
                      max={field.validation?.max}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  )}

                  {field.type === 'date' && (
                    <input
                      type="date"
                      value={(answers[field.id] as string) || ''}
                      onChange={e => updateAnswer(field.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  )}

                  {field.type === 'checkbox' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!answers[field.id]}
                        onChange={e => updateAnswer(field.id, e.target.checked)}
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
                          onClick={() => updateAnswer(field.id, option)}
                          className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                            answers[field.id] === option
                              ? 'border-2'
                              : 'border-gray-200 hover:border-gray-300'
                          } cursor-pointer`}
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

            <button
              onClick={handleFormSubmit}
              className="mt-4 w-full py-2 rounded-lg text-white font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              Submit
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center space-x-4">
            {showAcknowledgeButton && onAcknowledge && !message.acknowledged && (
              <button
                onClick={() => onAcknowledge(message.id)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <ThumbsUp className="h-4 w-4" />
                <span className="text-sm font-medium">Acknowledge</span>
              </button>
            )}
            {message.acknowledged && (
              <span className="flex items-center space-x-2 text-green-600 text-sm font-medium">
                <ThumbsUp className="h-4 w-4" />
                <span>Acknowledged</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 text-gray-400">
            <ThumbsUp className="h-4 w-4" />
            <span className="text-sm">{message.acknowledgmentCount || 0}</span>
          </div>
        </div>

        {/* Sender Info */}
        <p className="text-xs text-gray-500 mt-3">
          {message.senderName} &bull; {formatTimestamp(message.createdAt)}
        </p>
      </div>
    </div>
  )
}
