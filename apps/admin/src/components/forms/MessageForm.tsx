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
  /** Additional audiences. The server fans out one post per audience, the same
   *  way Desk does, and announces once across the whole selection. The singular
   *  fields above remain the first selection, so nothing that reads them
   *  changes. */
  classIds?: string[]
  yearGroupIds?: string[]
  groupIds?: string[]
  isPinned: boolean
  isUrgent: boolean
  requiresAcknowledgment: boolean
  scheduledAt: string
  expiresAt: string
  hasAction: boolean
  actionType: string
  actionLabel: string
  actionDueDate: string
  actionAmount: string
  formId?: string
  /** ADMIN_NOTICE files it under the parent app's Admin Notices section rather
   *  than the feed, and emails a content-free signal instead of pushing. */
  channel?: 'FEED' | 'ADMIN_NOTICE'
  department?: string
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
  /** False while editing: an edit changes one post rather than fanning out. */
  allowMultipleAudiences?: boolean
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
  allowMultipleAudiences = true,
}: MessageFormProps) {
  const theme = useTheme()
  const { data: formsResponse, error: formsError } = useApi(() => api.forms.listAvailable(), [])
  const availableForms = formsResponse?.forms
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  /**
   * Which audiences are ticked, as one flat list.
   *
   * The form data keeps a primary audience in the singular fields and the rest
   * in the arrays, because that is the shape the server and every existing
   * reader already understand. This collapses both into one set so the UI can
   * think in ticks, and `applySelection` puts them back.
   */
  const selectedIds = new Set<string>([
    ...(formData.classId ? [formData.classId] : []),
    ...(formData.yearGroupId ? [formData.yearGroupId] : []),
    ...(formData.groupId ? [formData.groupId] : []),
    ...(formData.classIds || []),
    ...(formData.yearGroupIds || []),
    ...(formData.groupIds || []),
  ])
  const wholeSchoolSelected = selectedIds.size === 0

  const applySelection = (ids: Set<string>) => {
    const chosen = (audienceOptions || []).filter(o => o.type !== 'divider' && o.id && ids.has(o.id))
    if (chosen.length === 0) {
      // Nothing ticked means whole school — the state the composer opens in.
      onChange({
        ...formData, targetClass: 'Whole School',
        classId: undefined, yearGroupId: undefined, groupId: undefined,
        classIds: [], yearGroupIds: [], groupIds: [],
      })
      return
    }
    const classes = chosen.filter(o => o.type === 'class').map(o => o.id as string)
    const years = chosen.filter(o => o.type === 'yearGroup').map(o => o.id as string)
    const groups = chosen.filter(o => o.type === 'group').map(o => o.id as string)
    onChange({
      ...formData,
      // The first tick stays in the singular fields so existing readers — and
      // the post's own label — behave exactly as before for a single audience.
      targetClass: chosen[0].value,
      classId: classes[0], yearGroupId: years[0], groupId: groups[0],
      classIds: classes, yearGroupIds: years, groupIds: groups,
    })
  }

  const toggleAudience = (id: string) => {
    if (!allowMultipleAudiences) {
      // Single-select: ticking one replaces the selection rather than adding.
      applySelection(selectedIds.has(id) ? new Set() : new Set([id]))
      return
    }
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    applySelection(next)
  }

  /** Legacy path: no audienceOptions means a plain list of class names. */
  const handleAudienceChange = (value: string) => {
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
          {audienceOptions ? (
            <div className="border border-gray-300 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto bg-white">
              {/* Whole school is the absence of a selection rather than an
                  option competing with the others — ticking classes and "whole
                  school" together is a contradiction the UI should not allow. */}
              <button
                type="button"
                onClick={() => applySelection(new Set())}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${wholeSchoolSelected ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${wholeSchoolSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                  {wholeSchoolSelected ? '\u2713' : ''}
                </span>
                Whole School
              </button>
              {audienceOptions.filter(o => o.type !== 'school').map((opt) => (
                opt.type === 'divider' ? (
                  <div key={opt.value} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 bg-gray-50">
                    {opt.value}
                  </div>
                ) : (
                  <label
                    key={`${opt.type}-${opt.id || opt.value}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={!!opt.id && selectedIds.has(opt.id)}
                      onChange={() => opt.id && toggleAudience(opt.id)}
                    />
                    {opt.type === 'class' ? `\u2514 ${opt.value}` : opt.value}
                  </label>
                )
              ))}
            </div>
          ) : (
            <select
              value={formData.targetClass}
              onChange={(e) => handleAudienceChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {options.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          )}
          {selectedIds.size > 1 && (
            // Said plainly, because it is the thing a sender would otherwise
            // discover from a parent: several audiences means several posts.
            <p className="text-xs text-gray-500 mt-1">
              Posts to {selectedIds.size} audiences \u2014 one post each, and parents in more than one are notified once.
            </p>
          )}
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
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
          <p className="text-xs text-gray-500 mt-1">Images, PDF, Word, Excel, PowerPoint (max 16 MB each)</p>

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

        {/* Where it lands. A notice is a different kind of message, not a
            differently-styled post, so this sits above the content options
            rather than among the flags. */}
        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.channel === 'ADMIN_NOTICE'}
              onChange={e => onChange({
                ...formData,
                channel: e.target.checked ? 'ADMIN_NOTICE' : 'FEED',
                department: e.target.checked ? formData.department : undefined,
              })}
              className="rounded mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-gray-800">Send as an admin notice</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Goes to the Admin Notices section instead of the feed. Parents get an email saying
                a notice is waiting — never what it says — and a prompt on their home screen.
              </span>
            </span>
          </label>

          {formData.channel === 'ADMIN_NOTICE' && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">From which department?</label>
              <input
                list="admin-notice-departments"
                value={formData.department || ''}
                onChange={e => onChange({ ...formData, department: e.target.value })}
                placeholder="School Clinic"
                maxLength={60}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <datalist id="admin-notice-departments">
                <option value="School Clinic" />
                <option value="Accounts" />
                <option value="Admissions" />
                <option value="Transport" />
                <option value="School Office" />
              </datalist>
              <p className="text-xs text-gray-500 mt-1">
                Parents see this instead of your name. Keep it consistent — it's how they'll
                recognise the sender.
              </p>
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
                {f.status === 'ACTIVE' ? ' — already sent, this is a reminder' : ''}
              </option>
            ))}
          </select>

          {/* An empty dropdown has three quite different causes, and saying
              which one it is saves a support message every time. */}
          {formsError && (
            <p className="text-xs text-amber-700 mt-1">
              Couldn't load your forms just now — this is a problem at our end, not a sign you have none.
            </p>
          )}
          {!formsError && availableForms?.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {(formsResponse?.unavailable.closed ?? 0) === 0
                ? 'No forms yet — build one under Forms, then attach it here.'
                : `Nothing to attach: all ${formsResponse?.unavailable.closed} of your forms are closed, and a closed form would be a dead link for parents.`}
            </p>
          )}

          {selectedForm?.status === 'ACTIVE' && (
            <p className="text-xs text-gray-500 mt-1">
              This form is already live, so this post is a reminder. Parents who have already
              responded will still see that they have.
            </p>
          )}

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
            <label htmlFor="isUrgent" className="text-sm text-gray-700">
              {formData.channel === 'ADMIN_NOTICE' ? 'Urgent — also send a notification' : 'Mark as urgent'}
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="requiresAcknowledgment" checked={formData.requiresAcknowledgment} onChange={(e) => onChange({ ...formData, requiresAcknowledgment: e.target.checked })} className="rounded" />
            <label htmlFor="requiresAcknowledgment" className="text-sm text-gray-700" title="Only tick this when you need to know each parent has seen it — if every post asks, the ask stops meaning anything.">Require acknowledgement</label>
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
