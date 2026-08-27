import React, { useEffect, useRef, useState } from 'react'
import { X, Trash2, Users, RefreshCw, Mail, Copy, CheckCircle, XCircle, Clock, Eye, Search, Send, KeyRound, Printer, Ticket } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type { ParentInvitation, InvitationStatus, Class, ClassSignInCodes, ClassSignInCode } from '@wasil/shared'
import QRCode from 'qrcode'
import { HubSyncBanner } from '../components/HubSyncBanner'

// Where the slip's QR points. Same resolution the admin app uses to hand a
// staff-parent over to the parent app.
const PARENT_APP_URL =
  import.meta.env.VITE_PARENT_URL ||
  (window.location.hostname.includes('localhost') ? 'http://localhost:3000' : 'https://app.wasilconnect.com')

type Tab = 'invitations' | 'parents' | 'signInCodes'

export function ParentsPage() {
  const theme = useTheme()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('invitations')

  // === Invitations state (read-only — legacy access-code invites; new parent
  // + child links now come from Hub guardian sync) ===
  const [statusFilter, setStatusFilter] = useState<InvitationStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

  const { data: invitationsData, refetch: refetchInvitations } = useApi(
    () => api.parentInvitations.list({ status: statusFilter, search: searchQuery, page, limit: 20 }),
    [statusFilter, searchQuery, page]
  )

  const [showDetails, setShowDetails] = useState<ParentInvitation | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; code: string } | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  // === Registered Parents state ===
  const [parentsSearch, setParentsSearch] = useState('')
  const [parentsPage, setParentsPage] = useState(1)
  const [inviteAllConfirm, setInviteAllConfirm] = useState(false)
  const [sendingInvites, setSendingInvites] = useState(false)
  const [sendingInviteFor, setSendingInviteFor] = useState<string | null>(null)
  // Admin-issued one-time sign-in code (for parents whose email can't receive codes)
  const [signInCodeFor, setSignInCodeFor] = useState<{ id: string; name: string; email: string } | null>(null)
  const [signInCode, setSignInCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  const { data: parentsData, refetch: refetchParents } = useApi(
    () => api.parentInvitations.listParents({ search: parentsSearch, page: parentsPage, limit: 50 }),
    [parentsSearch, parentsPage]
  )

  const handleRevoke = async () => {
    if (!revokeConfirm) return
    setIsRevoking(true)
    try {
      await api.parentInvitations.revoke(revokeConfirm.id)
      refetchInvitations()
      setRevokeConfirm(null)
    } catch (error) {
      toast.error(`Failed to revoke: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
      toast.error(`Failed to regenerate: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleResend = async (id: string) => {
    try {
      await api.parentInvitations.resend(id)
      toast.success('Email sent successfully')
    } catch (error) {
      toast.error(`Failed to resend: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Passwordless "invite parents" — emails Hub-provisioned (or any) parents a
  // welcome telling them to sign in with their email + a 6-digit code. Omitting
  // ids invites every parent in the school with an email (re-sendable, so it's
  // safe to re-run for parents who were already invited).
  const handleSendAllInvites = async () => {
    setSendingInvites(true)
    try {
      const result = await api.parentInvitations.sendInvites()
      toast.success(`Invited ${result.sent} parent${result.sent !== 1 ? 's' : ''} (${result.skipped} skipped — no email)`)
      refetchParents()
      setInviteAllConfirm(false)
    } catch (error) {
      toast.error(`Failed to send invites: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSendingInvites(false)
    }
  }

  const handleSendInviteOne = async (id: string) => {
    setSendingInviteFor(id)
    try {
      const result = await api.parentInvitations.sendInvites([id])
      if (result.sent > 0) {
        toast.success('Sign-in invite sent')
      } else {
        toast.error('Could not send invite — no email on file')
      }
      refetchParents()
    } catch (error) {
      toast.error(`Failed to send invite: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSendingInviteFor(null)
    }
  }

  // Mint a one-time sign-in code for a parent whose email blocks the emailed
  // code. The admin reads it out; the parent uses "I already have a code" on the
  // sign-in screen. The code is display-only — never emailed.
  const handleGenerateSignInCode = async (parent: { id: string; name: string | null; email: string }) => {
    setSignInCodeFor({ id: parent.id, name: parent.name || 'Unknown', email: parent.email })
    setSignInCode(null)
    setCodeCopied(false)
    setIsGeneratingCode(true)
    try {
      const result = await api.parentInvitations.generateSignInCode(parent.id)
      setSignInCode(result)
    } catch (error) {
      toast.error(`Failed to generate sign-in code: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setSignInCodeFor(null)
    } finally {
      setIsGeneratingCode(false)
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
  const registeredParents = parentsData?.parents || []
  const parentsPagination = parentsData?.pagination

  return (
    <div>
      <HubSyncBanner noun="Parents" onSynced={() => { refetchParents(); refetchInvitations() }} />

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('invitations')}
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'invitations'
              ? 'border-current text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          style={activeTab === 'invitations' ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
        >
          Invitations
          {pagination && <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{pagination.total}</span>}
        </button>
        <button
          onClick={() => setActiveTab('parents')}
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'parents'
              ? 'border-current text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          style={activeTab === 'parents' ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
        >
          Registered Parents
          {parentsPagination && <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{parentsPagination.total}</span>}
        </button>
        <button
          onClick={() => setActiveTab('signInCodes')}
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'signInCodes'
              ? 'border-current text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          style={activeTab === 'signInCodes' ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
        >
          Print sign-in codes
        </button>
      </div>

      {activeTab === 'signInCodes' && <SignInCodesTab />}

      {activeTab === 'invitations' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Parent Invitations</h2>
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
                          <span key={`child-${i}`} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            {child.childName} ({child.className})
                          </span>
                        ))}
                        {inv.students?.map((student, i) => (
                          <span key={`student-${i}`} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                            {student.studentName} ({student.className})
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
                      <p>No invitations found.</p>
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
        </>
      )}

      {activeTab === 'parents' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Registered Parents</h2>
            <button
              onClick={() => setInviteAllConfirm(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              <Mail className="h-4 w-4" />
              <span>Send sign-in invites</span>
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={parentsSearch}
                onChange={e => { setParentsSearch(e.target.value); setParentsPage(1) }}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Parents Table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Email</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Children</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Last Login</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Invite Status</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {registeredParents.map(parent => (
                  <tr key={parent.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-3">
                        {parent.avatarUrl ? (
                          <img src={parent.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center">
                            <span className="text-sm font-medium text-slate-600">
                              {parent.name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900">{parent.name || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{parent.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {parent.children.length > 0 ? (
                          parent.children.map((child, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                              {child.name} ({child.className})
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">No children linked</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {parent.lastLoginAt
                        ? new Date(parent.lastLoginAt).toLocaleDateString()
                        : <span className="text-gray-400">Never</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {parent.welcomeSentAt ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Invited {new Date(parent.welcomeSentAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Not invited</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleSendInviteOne(parent.id)}
                          disabled={sendingInviteFor === parent.id}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                          title={parent.welcomeSentAt ? 'Resend sign-in invite' : 'Send sign-in invite'}
                        >
                          <Mail className="h-3 w-3" />
                          <span>{sendingInviteFor === parent.id ? 'Sending...' : parent.welcomeSentAt ? 'Resend' : 'Send'}</span>
                        </button>
                        <button
                          onClick={() => handleGenerateSignInCode(parent)}
                          disabled={isGeneratingCode && signInCodeFor?.id === parent.id}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                          title="Generate a one-time sign-in code (for parents whose email can't receive codes)"
                        >
                          <KeyRound className="h-3 w-3" />
                          <span>{isGeneratingCode && signInCodeFor?.id === parent.id ? 'Generating...' : 'Sign-in Code'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {registeredParents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No registered parents found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {parentsPagination && parentsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
                <p className="text-sm text-gray-600">
                  Showing {(parentsPage - 1) * parentsPagination.limit + 1} to {Math.min(parentsPage * parentsPagination.limit, parentsPagination.total)} of {parentsPagination.total}
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setParentsPage(p => Math.max(1, p - 1))}
                    disabled={parentsPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setParentsPage(p => Math.min(parentsPagination.totalPages, p + 1))}
                    disabled={parentsPage === parentsPagination.totalPages}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

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

              {showDetails.children.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Children (Manual Entry)</label>
                  <div className="space-y-1">
                    {showDetails.children.map((child, i) => (
                      <div key={i} className="text-sm text-gray-900">
                        {child.childName} - {child.className}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showDetails.students && showDetails.students.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Students</label>
                  <div className="space-y-1">
                    {showDetails.students.map((student, i) => (
                      <div key={i} className="text-sm text-gray-900">
                        {student.studentName} - {student.className}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

      {inviteAllConfirm && (
        <ConfirmModal
          title="Send sign-in invites?"
          message="This emails sign-in instructions to every registered parent in your school who has an email on file — parents open the app and sign in with their email + a 6-digit code. Already-invited parents get a re-send too. Parents with no email are skipped."
          confirmLabel={sendingInvites ? 'Sending...' : 'Send invites'}
          isLoading={sendingInvites}
          onConfirm={handleSendAllInvites}
          onCancel={() => setInviteAllConfirm(false)}
        />
      )}

      {signInCodeFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-gray-900">One-Time Sign-In Code</h3>
              <button
                onClick={() => { setSignInCodeFor(null); setSignInCode(null); setCodeCopied(false) }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{signInCodeFor.name} ({signInCodeFor.email})</p>

            {isGeneratingCode || !signInCode ? (
              <p className="text-center text-sm text-gray-500 py-8">Generating code...</p>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3 mb-2">
                  <code className="text-3xl font-mono font-bold tracking-[0.3em] text-gray-900 bg-slate-100 px-4 py-3 rounded-lg">
                    {signInCode.code}
                  </code>
                  <button
                    onClick={() => { copyToClipboard(signInCode.code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000) }}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    title="Copy code"
                  >
                    {codeCopied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{codeCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-center text-xs text-gray-500 mb-4">
                  Valid until {new Date(signInCode.expiresAt).toLocaleString()} · single use
                </p>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-gray-600">
                  <p className="font-medium text-gray-700 mb-1">Read this to the parent:</p>
                  <p>
                    Ask the parent to open the sign-in screen, enter their email, tap
                    {' '}<span className="font-medium text-gray-800">"I already have a code"</span>, and type this code.
                  </p>
                  <p className="mt-2 text-xs text-gray-400">
                    This code is shown here only — it is never emailed. Use it for parents whose email can't receive the emailed code.
                  </p>
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => { setSignInCodeFor(null); setSignInCode(null); setCodeCopied(false) }}
                    className="px-4 py-2 text-sm font-medium text-white rounded-lg"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Print sign-in codes ─────────────────────────────────────────────────────
// For a mass sign-up event: hand a parent their slip and they're in, without
// waiting on an email. These are the app's OWN 6-digit sign-in codes, printed
// ahead of time rather than emailed on demand, so there's one mechanism to
// explain and nothing new for a parent to learn.
//
// Slips are individual cards, not one class list — a sheet left on a table is a
// key to every account on it; a slip is a key to one, for a few hours.

const EXPIRY_OPTIONS = [
  { hours: 6, label: '6 hours', hint: 'Same session' },
  { hours: 24, label: '1 day', hint: 'Event day' },
  { hours: 72, label: '3 days', hint: 'Stragglers welcome' },
  { hours: 120, label: '5 days', hint: 'Print ahead of the day' },
]

function SignInCodesTab() {
  const toast = useToast()
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])
  const [classId, setClassId] = useState('')
  const [hours, setHours] = useState(120)
  const [batch, setBatch] = useState<ClassSignInCodes | null>(null)
  const [isMinting, setIsMinting] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const mint = async () => {
    if (!classId) return
    setIsMinting(true)
    try {
      const result = await api.parentInvitations.signInCodesByClass(classId, hours)
      setBatch(result)
      toast.success(`${result.codes.length} code${result.codes.length === 1 ? '' : 's'} ready to print`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create codes')
    } finally {
      setIsMinting(false)
    }
  }

  // The other half of handing out paper: after the event every unused slip is
  // still a live key until it expires.
  const revoke = async () => {
    if (!batch) return
    setConfirmRevoke(false)
    try {
      const { revoked } = await api.parentInvitations.revokeSignInCodes(batch.codes.map(c => c.email))
      toast.success(revoked === 0 ? 'Nothing left to revoke' : `Revoked ${revoked} code${revoked === 1 ? '' : 's'}`)
      setBatch(null)
    } catch {
      toast.error('Failed to revoke')
    }
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 print:hidden">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Ticket className="h-5 w-5" /> Print sign-in codes
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            One slip per parent for a sign-up event. Each carries their email and a 6-digit code —
            the same code the app would normally email them.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Class</label>
            <select
              value={classId}
              onChange={e => { setClassId(e.target.value); setBatch(null) }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">Choose a class…</option>
              {/* One run for a school-wide event, rather than sixteen and a
                  collation job. Slips come back ordered by class. */}
              <option value="all">All classes (whole school)</option>
              {(classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Codes stop working after</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY_OPTIONS.map(o => (
                <button
                  key={o.hours}
                  onClick={() => setHours(o.hours)}
                  title={o.hint}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold border ${
                    hours === o.hours ? 'bg-slate-900 text-white border-transparent' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={mint}
            disabled={!classId || isMinting}
            className="flex items-center gap-2 rounded-lg bg-slate-900 text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-60"
          >
            <Ticket className="h-4 w-4" />
            {isMinting ? 'Creating…' : batch ? 'Create fresh codes' : 'Create codes'}
          </button>
          {batch && (
            <>
              <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Printer className="h-4 w-4" /> Print slips
              </button>
              <button onClick={() => setConfirmRevoke(true)} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                <XCircle className="h-4 w-4" /> Revoke these codes
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-slate-500">
          A code is single-use and replaces any earlier one for that parent. If a parent asks the app to
          email them a code afterwards, the printed one stops working — and vice versa. Creating codes again
          for the same class issues NEW ones and invalidates slips already printed.
        </p>
      </div>

      {batch && (
        <div className="mt-6 space-y-6">
          <div className="print:hidden flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">
              {batch.wholeSchool ? 'Whole school' : batch.className} · {batch.codes.length} slip{batch.codes.length === 1 ? '' : 's'}
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3">
            {batch.codes.map(c => <Slip key={c.email} entry={c} />)}
          </div>

          {batch.pupilsWithoutAccount.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 print:hidden">
              <p className="text-sm font-bold text-amber-900 mb-1">
                {batch.pupilsWithoutAccount.length} pupil{batch.pupilsWithoutAccount.length === 1 ? '' : 's'} with no parent account
              </p>
              <p className="text-xs text-amber-800 mb-2">
                There's nothing for these families to sign in to yet — they need an account first (Invitations tab).
                No slip was printed for them.
              </p>
              <p className="text-xs text-amber-900">
                {batch.pupilsWithoutAccount
                  .map(p => (p.className ? `${p.name} (${p.className})` : p.name))
                  .join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {confirmRevoke && (
        <ConfirmModal
          title="Revoke these codes"
          message="Every printed code from this batch stops working immediately. Parents can still request a new code by email as usual."
          confirmLabel="Revoke"
          variant="danger"
          onConfirm={revoke}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
    </div>
  )
}

// One parent's slip. The QR opens the login page with their email already
// filled — the fiddly half — and they type the six digits, which is the half
// that's quick. Deliberately NOT carrying the code itself into a URL.
function Slip({ entry }: { entry: ClassSignInCode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loginUrl = `${PARENT_APP_URL}/login?email=${encodeURIComponent(entry.email)}`

  useEffect(() => {
    if (!canvasRef.current) return
    // Rendered locally, not via a third-party QR service.
    QRCode.toCanvas(canvasRef.current, loginUrl, { width: 120, margin: 0 }).catch(() => {})
  }, [loginUrl])

  // The class(es) this slip belongs to — what a teacher sorts the stack by.
  const classes = [...new Set(entry.children.map(c => c.className).filter(Boolean))].join(' · ')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 break-inside-avoid print:border-slate-400">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{classes || 'School'}</p>
      <p className="text-base font-extrabold text-slate-900 mt-0.5">{entry.parentName}</p>
      <p className="text-xs text-slate-500">{entry.children.map(c => c.name).join(' & ')}</p>

      <div className="flex items-start gap-4 mt-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-600">Sign in with</p>
          <p className="text-sm font-semibold text-slate-900 break-all">{entry.email}</p>
          <p className="text-[11px] font-semibold text-slate-600 mt-2">Your code</p>
          <p className="text-[26px] font-extrabold tracking-[0.2em] text-slate-900 leading-tight">{entry.code}</p>
          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
            Works once. Scan to open the app with your email filled in.
          </p>
        </div>
        <canvas ref={canvasRef} className="shrink-0" />
      </div>
    </div>
  )
}
