import React, { useState } from 'react'
import { Plus, X, Trash2, Upload, Users, RefreshCw, Mail, Copy, QrCode, CheckCircle, XCircle, Clock, Eye } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { Class, ParentInvitation, InvitationStatus } from '@wasil/shared'

interface ChildEntry {
  childName: string
  classId: string
}

interface BulkImportResult {
  created: number
  skipped: number
  errors?: string[]
}

export function ParentsPage() {
  const theme = useTheme()
  const [statusFilter, setStatusFilter] = useState<InvitationStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

  const { data: invitationsData, refetch: refetchInvitations } = useApi(
    () => api.parentInvitations.list({ status: statusFilter, search: searchQuery, page, limit: 20 }),
    [statusFilter, searchQuery, page]
  )
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showDetails, setShowDetails] = useState<ParentInvitation | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; code: string } | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  // Individual form
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [includeMagicLink, setIncludeMagicLink] = useState(true)
  const [children, setChildren] = useState<ChildEntry[]>([{ childName: '', classId: '' }])
  const [expiresInDays, setExpiresInDays] = useState(90)

  // Bulk import
  const [bulkText, setBulkText] = useState('')
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null)
  const [isBulkImporting, setIsBulkImporting] = useState(false)

  const resetForm = () => {
    setShowForm(false)
    setShowBulkImport(false)
    setShowDetails(null)
    setParentName('')
    setParentEmail('')
    setIncludeMagicLink(true)
    setChildren([{ childName: '', classId: '' }])
    setExpiresInDays(90)
    setBulkText('')
    setBulkResult(null)
  }

  const addChild = () => {
    setChildren([...children, { childName: '', classId: '' }])
  }

  const removeChild = (index: number) => {
    if (children.length > 1) {
      setChildren(children.filter((_, i) => i !== index))
    }
  }

  const updateChild = (index: number, field: keyof ChildEntry, value: string) => {
    setChildren(children.map((c, i) => i === index ? { ...c, [field]: value } : c))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validChildren = children.filter(c => c.childName.trim() && c.classId)
    if (validChildren.length === 0) {
      alert('Please add at least one child with a name and class')
      return
    }
    setIsSubmitting(true)
    try {
      await api.parentInvitations.create({
        parentName: parentName.trim() || undefined,
        parentEmail: parentEmail.trim() || undefined,
        children: validChildren,
        includeMagicLink,
        expiresInDays,
      })
      resetForm()
      refetchInvitations()
    } catch (error) {
      alert(`Failed to create invitation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return
    setIsBulkImporting(true)
    try {
      const result = await api.parentInvitations.bulkImport(bulkText, expiresInDays)
      setBulkResult({ created: result.created, skipped: result.skipped, errors: result.errors })
      refetchInvitations()
    } catch (error) {
      alert(`Bulk import failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsBulkImporting(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokeConfirm) return
    setIsRevoking(true)
    try {
      await api.parentInvitations.revoke(revokeConfirm.id)
      refetchInvitations()
      setRevokeConfirm(null)
    } catch (error) {
      alert(`Failed to revoke: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsRevoking(false)
    }
  }

  const handleRegenerate = async (id: string) => {
    try {
      await api.parentInvitations.regenerate(id)
      refetchInvitations()
      if (showDetails?.id === id) {
        const updated = await api.parentInvitations.get(id)
        setShowDetails(updated)
      }
    } catch (error) {
      alert(`Failed to regenerate: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleResend = async (id: string) => {
    try {
      await api.parentInvitations.resend(id)
      alert('Email sent successfully')
    } catch (error) {
      alert(`Failed to resend: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getStatusBadge = (status: InvitationStatus) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</span>
      case 'REDEEMED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Redeemed</span>
      case 'EXPIRED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><Clock className="h-3 w-3 mr-1" />Expired</span>
      case 'REVOKED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Revoked</span>
    }
  }

  const invitations = invitationsData?.invitations || []
  const pagination = invitationsData?.pagination

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Parent Invitations</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setShowBulkImport(!showBulkImport); setShowForm(false) }}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" />
            <span>Bulk Import</span>
          </button>
          <button
            onClick={() => showForm ? resetForm() : (setShowForm(true), setShowBulkImport(false))}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>{showForm ? 'Cancel' : 'Create Invitation'}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4 mb-6">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value as InvitationStatus | 'all'); setPage(1) }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="REDEEMED">Redeemed</option>
          <option value="EXPIRED">Expired</option>
          <option value="REVOKED">Revoked</option>
        </select>
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
          placeholder="Search by email, name, or code..."
          className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {showBulkImport && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6 space-y-4">
          <h3 className="font-medium text-gray-900">Bulk Import Invitations</h3>
          <p className="text-sm text-gray-500">
            Paste CSV data with headers: Parent Email, Parent Name, Child Name, Class Name
          </p>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            placeholder={"Parent Email,Parent Name,Child Name,Class Name\njohn@example.com,John Smith,Emma Smith,Y1 Blue\njohn@example.com,John Smith,James Smith,Y3 Red"}
          />
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires In (days)</label>
              <input
                type="number"
                value={expiresInDays}
                onChange={e => setExpiresInDays(parseInt(e.target.value) || 90)}
                min={1}
                max={365}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex-1" />
            <button
              onClick={handleBulkImport}
              disabled={isBulkImporting || !bulkText.trim()}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {isBulkImporting ? 'Importing...' : 'Import Invitations'}
            </button>
          </div>

          {bulkResult && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <p className="font-medium text-gray-900">Import Complete</p>
              <div className="flex items-center space-x-4 mt-2 text-sm">
                <span className="text-green-600">{bulkResult.created} created</span>
                {bulkResult.skipped > 0 && <span className="text-amber-600">{bulkResult.skipped} skipped</span>}
              </div>
              {bulkResult.errors && bulkResult.errors.length > 0 && (
                <ul className="mt-2 text-sm text-red-600 space-y-1">
                  {bulkResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name (optional)</label>
              <input
                type="text"
                value={parentName}
                onChange={e => setParentName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Email (optional)</label>
              <input
                type="email"
                value={parentEmail}
                onChange={e => setParentEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Children</label>
            <div className="space-y-2">
              {children.map((child, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={child.childName}
                    onChange={e => updateChild(index, 'childName', e.target.value)}
                    placeholder="Child's name"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={child.classId}
                    onChange={e => updateChild(index, 'classId', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select class...</option>
                    {classes?.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                  {children.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChild(index)}
                      className="p-2 text-gray-400 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addChild}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800"
            >
              + Add another child
            </button>
          </div>

          <div className="flex items-center space-x-6">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMagicLink}
                onChange={e => setIncludeMagicLink(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Include magic link for email</span>
            </label>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Expires in</span>
              <input
                type="number"
                value={expiresInDays}
                onChange={e => setExpiresInDays(parseInt(e.target.value) || 90)}
                min={1}
                max={365}
                className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm"
              />
              <span className="text-sm text-gray-600">days</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isSubmitting ? 'Creating...' : 'Create Invitation'}
          </button>
        </form>
      )}

      {/* Invitations Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Access Code</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Parent</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Children</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Created</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map(inv => (
              <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <code className="text-sm font-mono bg-slate-100 px-2 py-0.5 rounded">{inv.accessCode}</code>
                    <button
                      onClick={() => copyToClipboard(inv.accessCode)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title="Copy code"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div>
                    {inv.parentName && <div className="text-sm font-medium text-gray-900">{inv.parentName}</div>}
                    {inv.parentEmail && <div className="text-sm text-gray-500">{inv.parentEmail}</div>}
                    {!inv.parentName && !inv.parentEmail && <span className="text-sm text-gray-400">-</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {inv.children.map((child, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {child.childName} ({child.className})
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(inv.status)}
                  {inv.status === 'REDEEMED' && inv.redeemedByUser && (
                    <div className="text-xs text-gray-500 mt-1">
                      by {inv.redeemedByUser.email}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(inv.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end space-x-1">
                    <button
                      onClick={() => setShowDetails(inv)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {inv.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleRegenerate(inv.id)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Regenerate codes"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        {inv.parentEmail && (
                          <button
                            onClick={() => handleResend(inv.id)}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                            title="Resend email"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setRevokeConfirm({ id: inv.id, code: inv.accessCode })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Revoke invitation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {invitations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No invitations found. Create your first invitation above.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-gray-600">
              Showing {(page - 1) * pagination.limit + 1} to {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Invitation Details</h3>
                <button onClick={() => setShowDetails(null)} className="p-2 text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Code</label>
                <div className="flex items-center space-x-2">
                  <code className="text-lg font-mono bg-slate-100 px-3 py-2 rounded">{showDetails.accessCode}</code>
                  <button
                    onClick={() => copyToClipboard(showDetails.accessCode)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {showDetails.registrationUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registration URL</label>
                  <div className="flex items-center space-x-2">
                    <code className="text-xs bg-slate-100 px-2 py-1 rounded break-all">{showDetails.registrationUrl}</code>
                    <button
                      onClick={() => copyToClipboard(showDetails.registrationUrl!)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded flex-shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {showDetails.qrCodeUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">QR Code</label>
                  <img src={showDetails.qrCodeUrl} alt="QR Code" className="w-40 h-40 border rounded" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <div>{getStatusBadge(showDetails.status)}</div>
              </div>

              {showDetails.parentName && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name</label>
                  <p className="text-gray-900">{showDetails.parentName}</p>
                </div>
              )}

              {showDetails.parentEmail && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Email</label>
                  <p className="text-gray-900">{showDetails.parentEmail}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Children</label>
                <div className="space-y-1">
                  {showDetails.children.map((child, i) => (
                    <div key={i} className="text-sm text-gray-900">
                      {child.childName} - {child.className}
                    </div>
                  ))}
                </div>
              </div>

              {showDetails.expiresAt && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expires</label>
                  <p className="text-gray-900">{new Date(showDetails.expiresAt).toLocaleDateString()}</p>
                </div>
              )}

              {showDetails.redeemedAt && showDetails.redeemedByUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Redeemed</label>
                  <p className="text-gray-900">
                    {new Date(showDetails.redeemedAt).toLocaleDateString()} by {showDetails.redeemedByUser.name} ({showDetails.redeemedByUser.email})
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {revokeConfirm && (
        <ConfirmModal
          title="Revoke Invitation?"
          message={`Are you sure you want to revoke invitation ${revokeConfirm.code}? The access code will no longer work.`}
          confirmLabel="Revoke"
          variant="danger"
          isLoading={isRevoking}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeConfirm(null)}
        />
      )}
    </div>
  )
}
