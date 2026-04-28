import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ThumbsUp, Share2, AlertTriangle, Pin, Check, Clock, CreditCard, Paperclip, FileText, Image, Download, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useTheme } from '@wasil/shared'
import type { Message, FormField, FormFieldCondition } from '@wasil/shared'

interface MessageCardProps {
  message: Message
  onAcknowledge?: (id: string) => void
  onFormRespond?: (formId: string, answers: Record<string, unknown>) => void
  showAcknowledgeButton?: boolean
  classColors?: Record<string, { bg: string; hex: string }>
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageType(fileType: string): boolean {
  return fileType.startsWith('image/')
}

export function MessageCard({
  message,
  onAcknowledge,
  onFormRespond,
  showAcknowledgeButton = true,
  classColors = {},
}: MessageCardProps) {
  const { t } = useTranslation()
  const theme = useTheme()

  const form = message.form
  const hasForm = !!form
  const hasResponded = !!form?.userResponse
  const attachments = message.attachments || []
  const hasAttachments = attachments.length > 0
  const [showAttachments, setShowAttachments] = useState(false)

  // Form urgency banner logic
  const getFormBanner = () => {
    if (!hasForm || hasResponded) return null
    if (!form.expiresAt) return null

    const now = new Date()
    const expires = new Date(form.expiresAt)
    const diffMs = expires.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { color: '#A8929A', text: t('messages.formExpired') }
    }
    if (diffDays === 0) {
      return { color: '#D14D4D', text: t('messages.formDueToday') }
    }
    if (diffDays <= 3) {
      return { color: '#E8A54B', text: t('messages.formDaysRemaining', { days: diffDays }) }
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
  const [currentPage, setCurrentPage] = useState(0)

  // Multi-page support
  const pages = [...new Set(fields.map(f => f.page || 0))].sort((a, b) => a - b)
  const isMultiPage = pages.length > 1
  const totalPages = pages.length
  const isLastPage = currentPage === pages[pages.length - 1]

  // Conditional logic: check if a field should be visible
  const shouldShowField = (field: FormField): boolean => {
    if (!field.condition) return true
    const { fieldId, operator, value } = field.condition
    const answer = answers[fieldId]
    switch (operator) {
      case 'is_checked': return answer === true
      case 'is_not_checked': return answer !== true
      case 'equals': return answer === value
      case 'not_equals': return answer !== value
      default: return true
    }
  }

  // Get visible fields for current page
  const currentPageFields = fields
    .filter(f => (f.page || 0) === (pages[currentPage] ?? 0))
    .filter(shouldShowField)

  const handleFormSubmit = () => {
    if (!form || !onFormRespond) return
    // Validate all visible fields across all pages
    const newErrors: Record<string, string> = {}
    fields.forEach(f => {
      if (f.required && shouldShowField(f)) {
        const val = answers[f.id]
        if (val === undefined || val === null || val === '' || val === false) {
          newErrors[f.id] = `${f.label} is required`
        }
      }
    })
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      // Navigate to first page with errors
      const firstErrorField = fields.find(f => newErrors[f.id])
      if (firstErrorField) {
        const errorPage = pages.indexOf(firstErrorField.page || 0)
        if (errorPage >= 0) setCurrentPage(errorPage)
      }
      return
    }
    setErrors({})
    onFormRespond(form.id, answers)
  }

  const handleNextPage = () => {
    // Validate current page required fields
    const newErrors: Record<string, string> = {}
    currentPageFields.forEach(f => {
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
    setCurrentPage(prev => Math.min(prev + 1, totalPages - 1))
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const isUrgent = message.isUrgent

  // Get initials for avatar
  const getInitials = (name: string) => {
    if (name === 'Whole School') return 'WS'
    // Try to get class abbreviation (e.g., "Year 3" -> "Y3", "FS1 Blue" -> "F1")
    const match = name.match(/^(?:Year\s*)?(\w).*?(\d)?/)
    if (match) return (match[1] + (match[2] || '')).toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }

  const classHexColor = classColors[message.targetClass]?.hex
  const avatarColor = message.targetClass === 'Whole School'
    ? '#C4506E'
    : (classHexColor || '#5C6BC0')

  return (
    <div
      className="bg-white overflow-hidden"
      style={{
        borderRadius: '22px',
        border: isUrgent ? '2px solid #D14D4D' : '1.5px solid #F0E4E6',
      }}
    >
      <div className="p-[18px]">
        {/* Urgent badge */}
        {isUrgent && (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold mb-3"
            style={{ backgroundColor: '#FEF2F2', color: '#D14D4D' }}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('messages.urgent', 'Urgent')}
          </div>
        )}

        {/* Form urgency badge */}
        {formBanner && !isUrgent && (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold mb-3"
            style={{ backgroundColor: formBanner.color + '18', color: formBanner.color }}
          >
            <Clock className="h-3.5 w-3.5" />
            {formBanner.text}
          </div>
        )}

        {/* Header: Avatar + sender + time + unread dot */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-extrabold flex-shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {getInitials(message.targetClass)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-bold" style={{ color: '#2D2225' }}>
                {message.targetClass}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#A8929A' }}>
                {formatTimeAgo(message.createdAt)}
              </span>
            </div>
          </div>
          {message.isPinned && (
            <Pin className="h-4 w-4 flex-shrink-0" style={{ color: '#A8929A', transform: 'rotate(45deg)' }} />
          )}
          {!message.acknowledged && (
            <div className="w-[9px] h-[9px] rounded-full flex-shrink-0" style={{ backgroundColor: '#C4506E' }} />
          )}
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-bold mb-1" style={{ color: '#2D2225' }}>
          {message.title}
        </h3>

        {/* Due Date */}
        {message.actionDueDate && (
          <div
            className="mb-2 px-3 py-2 rounded-xl text-[13px] font-semibold"
            style={{ backgroundColor: '#FFF7EC', color: '#8B5E0F' }}
          >
            Due: {formatDate(message.actionDueDate)}
            {message.actionAmount && ` \u2022 ${message.actionAmount}`}
          </div>
        )}

        {/* Content */}
        <div
          className="text-sm leading-relaxed font-medium mb-3 rich-content"
          style={{ color: '#7A6469' }}
          dangerouslySetInnerHTML={{ __html: message.content }}
        />

        {/* Attachments indicator */}
        {hasAttachments && (
          <div className="mb-3">
            <button
              onClick={() => setShowAttachments(!showAttachments)}
              className="flex items-center gap-1.5 text-[13px] font-semibold transition-colors"
              style={{ color: '#7A6469' }}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span>{attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}</span>
              {showAttachments ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showAttachments && (
              <div
                className="mt-2 rounded-[14px] overflow-hidden"
                style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6' }}
              >
                {attachments.map((attachment, index) => (
                  <a
                    key={attachment.id}
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-white/60"
                    style={{
                      borderTop: index > 0 ? '1px solid #F0E4E6' : undefined,
                    }}
                  >
                    {isImageType(attachment.fileType) ? (
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        <img
                          src={attachment.fileUrl}
                          alt={attachment.fileName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: '#F0E4E6' }}
                      >
                        <FileText className="h-4 w-4" style={{ color: '#C4506E' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: '#2D2225' }}>
                        {attachment.fileName}
                      </p>
                      <p className="text-[11px] font-medium" style={{ color: '#A8929A' }}>
                        {formatFileSize(attachment.fileSize)}
                      </p>
                    </div>
                    <Download className="h-4 w-4 flex-shrink-0" style={{ color: '#A8929A' }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pay Now Button */}
        {message.actionType === 'payment' && theme.paymentUrl && (
          <a
            href={theme.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 flex items-center justify-center gap-2 w-full py-3 rounded-[14px] text-white font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#C4506E' }}
          >
            <CreditCard className="h-5 w-5" />
            <span>{t('messages.payNow', 'Pay Now')}</span>
          </a>
        )}

        {/* Inline Form Fields */}
        {hasForm && !hasResponded && (
          <div
            className="mb-3 p-4 rounded-[16px]"
            style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6' }}
          >
            <h4 className="font-bold text-sm mb-1" style={{ color: '#2D2225' }}>{form.title}</h4>
            {form.description && <p className="text-xs font-medium mb-3" style={{ color: '#7A6469' }}>{form.description}</p>}

            {/* Progress bar for multi-page */}
            {isMultiPage && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold" style={{ color: '#A8929A' }}>
                    Page {currentPage + 1} of {totalPages}
                  </span>
                </div>
                <div className="flex gap-1">
                  {pages.map((_, idx) => (
                    <div
                      key={idx}
                      className="h-1.5 rounded-full flex-1 transition-colors"
                      style={{ backgroundColor: idx <= currentPage ? '#C4506E' : '#F0E4E6' }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {currentPageFields.map(field => (
                <div key={field.id}>
                  <label className="block text-[13px] font-bold mb-1" style={{ color: '#7A6469' }}>
                    {field.label}
                    {field.required && <span style={{ color: '#D14D4D' }}> *</span>}
                  </label>

                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={(answers[field.id] as string) || ''}
                      onChange={e => updateAnswer(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                      style={{ border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                    />
                  )}

                  {field.type === 'textarea' && (
                    <textarea
                      value={(answers[field.id] as string) || ''}
                      onChange={e => updateAnswer(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none resize-none"
                      style={{ border: '1.5px solid #F0E4E6', color: '#2D2225' }}
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
                      className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                      style={{ border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                    />
                  )}

                  {field.type === 'date' && (
                    <input
                      type="date"
                      value={(answers[field.id] as string) || ''}
                      onChange={e => updateAnswer(field.id, e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none"
                      style={{ border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                    />
                  )}

                  {field.type === 'checkbox' && (
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={!!answers[field.id]}
                        onChange={e => updateAnswer(field.id, e.target.checked)}
                        className="w-5 h-5 rounded"
                        style={{ accentColor: '#C4506E' }}
                      />
                      <span className="text-sm font-medium" style={{ color: '#4A3A40' }}>
                        {field.placeholder || field.label}
                      </span>
                    </label>
                  )}

                  {field.type === 'select' && (
                    <div className="space-y-2">
                      {(field.options || []).map(option => (
                        <button
                          key={option}
                          onClick={() => updateAnswer(field.id, option)}
                          className="w-full text-left px-4 py-3 rounded-xl transition-all cursor-pointer"
                          style={{
                            border: answers[field.id] === option
                              ? '2px solid #C4506E'
                              : '1.5px solid #F0E4E6',
                            backgroundColor: answers[field.id] === option
                              ? '#FFF0F3'
                              : '#FFFFFF',
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{
                                border: answers[field.id] === option
                                  ? '2px solid #C4506E'
                                  : '2px solid #D8CDD0',
                              }}
                            >
                              {answers[field.id] === option && (
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#C4506E' }} />
                              )}
                            </div>
                            <span
                              className="text-sm font-semibold"
                              style={{ color: answers[field.id] === option ? '#C4506E' : '#4A3A40' }}
                            >
                              {option}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {field.type === 'signature' && (
                    <SignaturePad
                      value={(answers[field.id] as string) || ''}
                      onChange={(dataUrl) => updateAnswer(field.id, dataUrl)}
                    />
                  )}

                  {errors[field.id] && (
                    <p className="text-xs font-semibold mt-1" style={{ color: '#D14D4D' }}>{errors[field.id]}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Navigation / Submit */}
            {isMultiPage ? (
              <div className="flex gap-2 mt-4">
                {currentPage > 0 && (
                  <button
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="flex items-center gap-1 px-4 py-3 rounded-[14px] font-bold text-sm"
                    style={{ backgroundColor: '#F5EEF0', color: '#7A6469' }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                )}
                {isLastPage ? (
                  <button
                    onClick={handleFormSubmit}
                    className="flex-1 py-3 rounded-[14px] text-white font-bold text-sm transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#C4506E' }}
                  >
                    {t('common.submit', 'Submit')}
                  </button>
                ) : (
                  <button
                    onClick={handleNextPage}
                    className="flex-1 flex items-center justify-center gap-1 py-3 rounded-[14px] text-white font-bold text-sm transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#C4506E' }}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={handleFormSubmit}
                className="mt-4 w-full py-3 rounded-[14px] text-white font-bold transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#C4506E' }}
              >
                {t('common.submit', 'Submit')}
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showAcknowledgeButton && onAcknowledge && !message.acknowledged && (
              <button
                onClick={() => onAcknowledge(message.id)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-[14px] text-sm font-bold transition-colors"
                style={{ backgroundColor: '#FFF0F3', color: '#C4506E' }}
              >
                <Check className="h-4 w-4" />
                <span>{t('messages.acknowledge', 'Acknowledge')}</span>
              </button>
            )}
            {message.acknowledged && (
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ backgroundColor: '#EDFAF2', color: '#5BA97B' }}
              >
                <Check className="h-3.5 w-3.5" />
                {t('messages.acknowledged', 'Acknowledged')}
              </span>
            )}
            {hasForm && hasResponded && (
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ backgroundColor: '#EDFAF2', color: '#5BA97B' }}
              >
                <Check className="h-3.5 w-3.5" />
                {t('messages.completed', 'Completed')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#A8929A' }}>
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>{message.acknowledgmentCount || 0}</span>
          </div>
        </div>

        {/* Sender */}
        <p className="text-xs font-medium mt-3" style={{ color: '#A8929A' }}>
          {message.senderName} &bull; {formatTimeAgo(message.createdAt)}
        </p>
      </div>
    </div>
  )
}

// ==========================================
// Signature Pad Component
// ==========================================

function SignaturePad({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(!!value)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    ctx.scale(2, 2)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = '#2D2225'

    // Restore existing signature
    if (value) {
      const img = new window.Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height)
      }
      img.src = value
    }
  }, [])

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    isDrawing.current = true
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const endDraw = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    setHasDrawn(true)
    const canvas = canvasRef.current
    if (canvas) {
      onChange(canvas.toDataURL('image/png'))
    }
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    onChange('')
  }

  return (
    <div>
      <div
        className="relative rounded-xl overflow-hidden"
        style={{ border: '1.5px solid #F0E4E6', backgroundColor: '#FFFFFF' }}
      >
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ height: '120px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm" style={{ color: '#C9BCC0' }}>Sign here</span>
          </div>
        )}
      </div>
      {hasDrawn && (
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 text-xs font-semibold mt-1"
          style={{ color: '#A8929A' }}
        >
          <Trash2 className="w-3 h-3" />
          Clear signature
        </button>
      )}
    </div>
  )
}
