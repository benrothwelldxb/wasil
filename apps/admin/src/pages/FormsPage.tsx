import React, { useState, useEffect } from 'react'
import { Plus, X, Pencil, Trash2, XCircle, Eye, FileText, Download, Link2, Copy, RefreshCw, AlertTriangle, Check } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, FORM_TEMPLATES, createFieldsFromTemplate } from '@wasil/shared'
import type { Class, YearGroup, FormWithResponses, FormType, FormField, FormStatus } from '@wasil/shared'
import { FormForm } from '../components/forms'
import type { FormFormData, AudienceOption } from '../components/forms'

const TEMPLATE_LIST = Object.values(FORM_TEMPLATES)

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-200 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-red-100 text-red-700',
}

export function FormsPage() {
  const theme = useTheme()
  const { data: forms, refetch } = useApi<FormWithResponses[]>(() => api.forms.listAll(), [])
  const { data: yearGroups } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [editing, setEditing] = useState<FormWithResponses | null>(null)
  const [viewing, setViewing] = useState<FormWithResponses | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)
  const [exportLinkForm, setExportLinkForm] = useState<FormWithResponses | null>(null)
  const [exportToken, setExportToken] = useState<string | null>(null)
  const [isLoadingToken, setIsLoadingToken] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formData, setFormData] = useState<FormFormData>({
    title: '',
    description: '',
    type: 'general-info',
    status: 'DRAFT',
    fields: [],
    targetClass: 'Whole School',
    classIds: [],
    yearGroupIds: [],
  })

  const audienceOptions: AudienceOption[] = [
    { value: 'Whole School', type: 'school' },
    ...(yearGroups || []).flatMap(yg => {
      const ygClasses = (classes || []).filter(c => c.yearGroupId === yg.id)
      return [
        { value: yg.name, type: 'yearGroup' as const, id: yg.id },
        ...ygClasses.map(c => ({ value: c.name, type: 'class' as const, id: c.id })),
      ]
    }),
    ...(classes || []).filter(c => !c.yearGroupId).map(c => ({ value: c.name, type: 'class' as const, id: c.id })),
  ]

  const handleSelectTemplate = (type: FormType) => {
    const template = FORM_TEMPLATES[type]
    const fields = createFieldsFromTemplate(type)
    setFormData({
      title: template.defaultTitle,
      description: template.description,
      type,
      status: 'DRAFT',
      fields,
      targetClass: 'Whole School',
      classIds: [],
      yearGroupIds: [],
    })
    setShowTemplatePicker(false)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        title: formData.title,
        description: formData.description || undefined,
        type: formData.type as FormType,
        status: formData.status,
        fields: formData.fields,
        targetClass: formData.targetClass,
        classIds: formData.classIds,
        yearGroupIds: formData.yearGroupIds,
        expiresAt: formData.expiresAt || undefined,
      }
      if (editing) {
        await api.forms.update(editing.id, data)
        setEditing(null)
      } else {
        await api.forms.create(data as any)
      }
      resetForm()
      refetch()
    } catch {
      alert('Failed to save form')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (form: FormWithResponses) => {
    setFormData({
      title: form.title,
      description: form.description || '',
      type: form.type as FormType,
      status: form.status as FormStatus,
      fields: form.fields as FormField[],
      targetClass: form.targetClass,
      classIds: form.classIds || [],
      yearGroupIds: form.yearGroupIds || [],
      expiresAt: form.expiresAt || undefined,
    })
    setEditing(form)
    setShowForm(true)
    setShowTemplatePicker(false)
  }

  const resetForm = () => {
    setShowForm(false)
    setShowTemplatePicker(false)
    setEditing(null)
    setFormData({
      title: '',
      description: '',
      type: 'general-info',
      status: 'DRAFT',
      fields: [],
      targetClass: 'Whole School',
      classIds: [],
      yearGroupIds: [],
    })
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await api.forms.delete(deleteConfirm.id)
      refetch()
      setDeleteConfirm(null)
    } catch {
      alert('Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = async (id: string) => {
    try {
      await api.forms.close(id)
      refetch()
    } catch {
      alert('Failed to close form')
    }
  }

  const openExportLinkModal = async (form: FormWithResponses) => {
    setExportLinkForm(form)
    setIsLoadingToken(true)
    setCopied(false)
    try {
      const result = await api.forms.getExportToken(form.id)
      setExportToken(result.exportToken)
    } catch {
      setExportToken(null)
    } finally {
      setIsLoadingToken(false)
    }
  }

  const handleGenerateToken = async () => {
    if (!exportLinkForm) return
    setIsLoadingToken(true)
    setCopied(false)
    try {
      const result = await api.forms.generateExportToken(exportLinkForm.id)
      setExportToken(result.exportToken)
    } catch {
      alert('Failed to generate export link')
    } finally {
      setIsLoadingToken(false)
    }
  }

  const handleDeleteToken = async () => {
    if (!exportLinkForm) return
    setIsLoadingToken(true)
    try {
      await api.forms.deleteExportToken(exportLinkForm.id)
      setExportToken(null)
    } catch {
      alert('Failed to disable export link')
    } finally {
      setIsLoadingToken(false)
    }
  }

  const getPublicExportUrl = (token: string) => {
    const baseUrl = window.location.origin.replace(/:\d+$/, ':3000') // Use API port
    return `${baseUrl}/api/forms/public-export/${token}`
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Forms</h2>
        <button
          onClick={() => {
            if (showForm || showTemplatePicker) {
              resetForm()
            } else {
              setShowTemplatePicker(true)
            }
          }}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          {showForm || showTemplatePicker ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showForm || showTemplatePicker ? 'Cancel' : 'New Form'}</span>
        </button>
      </div>

      {/* Template Picker */}
      {showTemplatePicker && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Choose a template</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TEMPLATE_LIST.map(template => (
              <button
                key={template.key}
                onClick={() => handleSelectTemplate(template.key)}
                className="text-left p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
              >
                <p className="font-medium text-sm text-gray-900">{template.name}</p>
                <p className="text-xs text-gray-500 mt-1">{template.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form Builder */}
      {showForm && (
        <FormForm
          formData={formData}
          onChange={setFormData}
          onSubmit={handleSubmit}
          audienceOptions={audienceOptions}
          isSubmitting={isSubmitting}
          submitLabel={editing ? 'Update Form' : 'Create Form'}
        />
      )}

      {/* Response Viewer */}
      {viewing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold">{viewing.title} — Responses</h3>
                <div className="flex items-center gap-2">
                  {viewing.responses.length > 0 && (
                    <button
                      onClick={() => api.forms.exportCSV(viewing.id, viewing.title)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </button>
                  )}
                  <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              {viewing.responses.length === 0 ? (
                <p className="text-gray-500 text-sm">No responses yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-3 font-medium text-gray-700">Name</th>
                        <th className="text-left py-2 pr-3 font-medium text-gray-700">Email</th>
                        {(viewing.fields as FormField[]).map(f => (
                          <th key={f.id} className="text-left py-2 pr-3 font-medium text-gray-700">{f.label}</th>
                        ))}
                        <th className="text-left py-2 font-medium text-gray-700">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.responses.map(r => (
                        <tr key={r.id} className="border-b border-gray-100">
                          <td className="py-2 pr-3">{r.userName}</td>
                          <td className="py-2 pr-3 text-gray-500">{r.userEmail}</td>
                          {(viewing.fields as FormField[]).map(f => {
                            const val = (r.answers as Record<string, unknown>)[f.id]
                            return (
                              <td key={f.id} className="py-2 pr-3">
                                {f.type === 'checkbox' ? (val ? 'Yes' : 'No') : String(val ?? '—')}
                              </td>
                            )
                          })}
                          <td className="py-2 text-gray-500">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Link Modal */}
      {exportLinkForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Public Export Link</h3>
                  <p className="text-sm text-gray-500 mt-1">{exportLinkForm.title}</p>
                </div>
                <button onClick={() => setExportLinkForm(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Warning Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">Data Privacy Warning</p>
                    <p className="text-amber-700 mt-1">
                      This link allows <strong>anyone</strong> with access to view all form responses, including parent names and emails.
                      Only share with trusted parties.
                    </p>
                  </div>
                </div>
              </div>

              {isLoadingToken ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : exportToken ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Public CSV URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={getPublicExportUrl(exportToken)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono"
                      />
                      <button
                        onClick={() => copyToClipboard(getPublicExportUrl(exportToken))}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                      >
                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-800 mb-1">Google Sheets Formula</p>
                    <code className="block text-xs text-blue-700 bg-blue-100 p-2 rounded font-mono break-all">
                      =IMPORTDATA("{getPublicExportUrl(exportToken)}")
                    </code>
                    <button
                      onClick={() => copyToClipboard(`=IMPORTDATA("${getPublicExportUrl(exportToken)}")`)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Copy formula
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleGenerateToken}
                      disabled={isLoadingToken}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Regenerate Link
                    </button>
                    <button
                      onClick={handleDeleteToken}
                      disabled={isLoadingToken}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Disable Link
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Link2 className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm mb-4">No public link enabled for this form.</p>
                  <button
                    onClick={handleGenerateToken}
                    disabled={isLoadingToken}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    <Link2 className="h-4 w-4" />
                    Enable Public Export Link
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forms List */}
      <div className="space-y-3">
        {forms?.map(form => (
          <div key={form.id} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="text-xs px-2 py-1 rounded-full text-white" style={{ backgroundColor: theme.colors.brandColor }}>
                    {form.targetClass}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[form.status] || ''}`}>
                    {form.status}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                    {FORM_TEMPLATES[form.type as FormType]?.name || form.type}
                  </span>
                </div>
                <h4 className="font-medium mt-2">{form.title}</h4>
                {form.description && <p className="text-sm text-gray-500 mt-1">{form.description}</p>}
                <p className="text-xs text-gray-500 mt-2">{form.responseCount} responses</p>
              </div>
              <div className="flex items-center space-x-1 ml-4">
                <button onClick={() => setViewing(form)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="View responses">
                  <Eye className="h-4 w-4" />
                </button>
                {form.responseCount > 0 && (
                  <>
                    <button onClick={() => api.forms.exportCSV(form.id, form.title)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Export CSV">
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => openExportLinkModal(form)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Public Export Link (Google Sheets)">
                      <Link2 className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button onClick={() => handleEdit(form)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                {form.status === 'ACTIVE' && (
                  <button onClick={() => handleClose(form.id)} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title="Close form">
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setDeleteConfirm({ id: form.id, title: form.title })} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {forms && forms.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No forms yet. Click "New Form" to get started.</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title="Delete Form?"
          message={`Are you sure you want to delete "${deleteConfirm.title}"?`}
          confirmLabel="Delete"
          variant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
