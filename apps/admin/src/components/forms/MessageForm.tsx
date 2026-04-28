import React, { useRef, useState } from 'react'
import { Paperclip, X, Upload, FileText, Image } from 'lucide-react'
import { RichTextEditor } from './RichTextEditor'
import { useTheme, useApi, api } from '@wasil/shared'
import type { Form } from '@wasil/shared'

export interface AttachmentData {
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
}

export interface MessageFormData {
  title: string
  content: string
  targetClass: string
  classId?: string
  yearGroupId?: string
  groupId?: string
  isPinned: boolean
  isUrgent: boolean
  scheduledAt: string
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
  type: 'school' | 'yearGroup' | 'class' | 'group' | 'divider'
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
  attachments: AttachmentData[]
  onAttachmentsChange: (attachments: AttachmentData[]) => void
}

const FORM_TYPE_LABELS: Record<string, string> = {
  'permission-consent': 'Permission',
  'trip-consent': 'Trip',
  'payment-request': 'Payment',
  'medical-info': 'Medical',
  'general-info': 'General',
  'quick-poll': 'Poll',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageType(fileType: string): boolean {
  return fileType.startsWith('image/')
}

export function MessageForm({
  formData,
  onChange,
  onSubmit,
  audienceOptions,
  targetClassOptions,
  isSubmitting,
  submitLabel = 'Send Message',
  attachments,
  onAttachmentsChange,
}: MessageFormProps) {
  const theme = useTheme()
  const { data: availableForms } = useApi<Form[]>(() => api.forms.listAvailable(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleAudienceChange = (value: string) => {
    if (audienceOptions) {
      const option = audienceOptions.find(o => o.value === value)
      if (option && option.type !== 'divider') {
        onChange({
          ...formData,
          targetClass: option.value,
          classId: option.type === 'class' ? option.id : undefined,
          yearGroupId: option.type === 'yearGroup' ? option.id : undefined,
          groupId: option.type === 'group' ? option.id : undefined,
        })
        return
      }
    }
    onChange({ ...formData, targetClass: value, classId: undefined, yearGroupId: undefined, groupId: undefined })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    try {
      const newAttachments: AttachmentData[] = []
      for (const file of Array.from(files)) {
        const result = await api.messages.uploadAttachment(file)
        newAttachments.push(result)
      }
      onAttachmentsChange([...attachments, ...newAttachments])
    } catch (error) {
      alert(`Failed to upload: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    onAttachmentsChange(attachments.filter((_, i) => i !== index))
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
          <RichTextEditor
            value={formData.content}
            onChange={(html) => onChange({ ...formData, content: html })}
            placeholder="Write your message content..."
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
                opt.type === 'divider' ? (
                  <option key={opt.value} value="" disabled className="font-semibold">
                    {opt.value}
                  </option>
                ) : (
                  <option key={`${opt.type}-${opt.id || opt.value}`} value={opt.value}>
                    {opt.type === 'class' ? `  \u2514 ${opt.value}` : opt.type === 'group' ? `  ${opt.value}` : opt.value}
                  </option>
                )
              ))
            ) : (
              options.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))
            )}
          </select>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Upload className="h-4 w-4 animate-pulse" />
                Uploading...
              </>
            ) : (
              <>
                <Paperclip className="h-4 w-4" />
                Attach Files
              </>
            )}
          </button>
          <p className="text-xs text-gray-500 mt-1">Images, PDF, Word documents (max 16 MB each)</p>

          {attachments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  {isImageType(attachment.fileType) ? (
                    <Image className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate text-gray-700">{attachment.fileName}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(attachment.fileSize)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule For (optional)</label>
            <input
              type="datetime-local"
              value={formData.scheduledAt}
              onChange={(e) => onChange({ ...formData, scheduledAt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty to publish immediately</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Show Until (optional)</label>
            <input
              type="date"
              value={formData.expiresAt}
              onChange={(e) => onChange({ ...formData, expiresAt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Auto-hide after this date</p>
          </div>
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
          disabled={isSubmitting || isUploading}
          className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          {isSubmitting ? 'Please wait...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
