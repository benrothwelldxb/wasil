import React, { useState, useRef } from 'react'
import { Plus, X, Pencil, Trash2, FileText } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { Policy } from '@wasil/shared'

export function PoliciesPage() {
  const theme = useTheme()
  const { data: policiesList, refetch: refetchPolicies } = useApi<Policy[]>(() => api.policies.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)

  const [policyName, setPolicyName] = useState('')
  const [policyDescription, setPolicyDescription] = useState('')
  const [policyFile, setPolicyFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setShowForm(false)
    setEditingPolicy(null)
    setPolicyName('')
    setPolicyDescription('')
    setPolicyFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleEdit = (policy: Policy) => {
    setPolicyName(policy.name)
    setPolicyDescription(policy.description || '')
    setPolicyFile(null)
    setEditingPolicy(policy)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!policyName.trim()) return
    if (!editingPolicy && !policyFile) return
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('name', policyName.trim())
      formData.append('description', policyDescription.trim())
      if (policyFile) {
        formData.append('file', policyFile)
      }
      if (editingPolicy) {
        await api.policies.update(editingPolicy.id, formData)
      } else {
        await api.policies.create(formData)
      }
      resetForm()
      refetchPolicies()
    } catch (error) {
      alert(`Failed to save policy: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await api.policies.delete(deleteConfirm.id)
      refetchPolicies()
      setDeleteConfirm(null)
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return ''
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Policies</h2>
        <button
          onClick={() => showForm ? resetForm() : setShowForm(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showForm ? 'Cancel' : 'New Policy'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy Name</label>
            <input
              type="text"
              value={policyName}
              onChange={e => setPolicyName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Safeguarding Policy"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={policyDescription}
              onChange={e => setPolicyDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description of the policy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PDF File {editingPolicy && '(optional when editing)'}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={e => setPolicyFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required={!editingPolicy}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isSubmitting ? 'Saving...' : editingPolicy ? 'Update Policy' : 'Create Policy'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {policiesList?.map(policy => (
          <div key={policy.id} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <FileText className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{policy.name}</h4>
                  {policy.description && (
                    <p className="text-sm text-gray-500">{policy.description}</p>
                  )}
                  <div className="flex items-center space-x-3 mt-1 text-xs text-gray-400">
                    {policy.fileSize && <span>{formatFileSize(policy.fileSize)}</span>}
                    <span>Updated {new Date(policy.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={() => handleEdit(policy)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleteConfirm({ id: policy.id, name: policy.name })} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {(!policiesList || policiesList.length === 0) && (
          <div className="text-center py-12 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No policies yet. Upload your first policy above.</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title="Delete Policy?"
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
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
