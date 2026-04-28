import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, Upload, Shield, GraduationCap, UserCog, Send, Check, Clock, ShieldCheck, ShieldOff } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type { Class } from '@wasil/shared'
import type { StaffMember } from '@wasil/shared'

interface BulkStaffRow {
  name: string
  email: string
  role: 'STAFF' | 'ADMIN'
  classId: string
}

interface BulkImportResult {
  created: number
  skipped: number
  errors?: string[]
}

function parseBulkInput(text: string): BulkStaffRow[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',')
      const name = (parts[0] || '').trim()
      const email = (parts[1] || '').trim()
      if (!name || !email.includes('@')) return null
      const rolePart = (parts[2] || '').trim().toUpperCase()
      const role: 'STAFF' | 'ADMIN' = rolePart === 'ADMIN' ? 'ADMIN' : 'STAFF'
      return { name, email, role, classId: '' }
    })
    .filter((row): row is BulkStaffRow => row !== null)
}

export function StaffPage() {
  const theme = useTheme()
  const toast = useToast()
  const { data: staffList, refetch: refetchStaff } = useApi<StaffMember[]>(() => api.staff.list(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [sendingLoginTo, setSendingLoginTo] = useState<string | null>(null)
  const [resetting2faFor, setResetting2faFor] = useState<string | null>(null)

  const handleSendLogin = async (member: StaffMember) => {
    setSendingLoginTo(member.id)
    try {
      const result = await api.staff.sendLogin(member.id)
      toast.success(result.message || `Login email sent to ${member.email}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send login email')
    } finally {
      setSendingLoginTo(null)
    }
  }

  const handleReset2fa = async (member: StaffMember) => {
    if (!confirm(`Reset 2FA for ${member.name}? They will need to set it up again on next login.`)) return
    setResetting2faFor(member.id)
    try {
      await api.staff.reset2fa(member.id)
      refetchStaff()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset 2FA')
    } finally {
      setResetting2faFor(null)
    }
  }

  const formatLastLogin = (dateStr?: string | null) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Individual form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'STAFF' | 'ADMIN'>('STAFF')
  const [position, setPosition] = useState('')
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([])

  // Bulk import
  const [bulkText, setBulkText] = useState('')
  const [bulkRows, setBulkRows] = useState<BulkStaffRow[]>([])
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null)
  const [isBulkImporting, setIsBulkImporting] = useState(false)

  const resetForm = () => {
    setShowForm(false)
    setShowBulkImport(false)
    setEditingStaff(null)
    setName('')
    setEmail('')
    setRole('STAFF')
    setPosition('')
    setAssignedClassIds([])
    setBulkText('')
    setBulkRows([])
    setBulkResult(null)
  }

  const handleEdit = (member: StaffMember) => {
    setName(member.name)
    setEmail(member.email)
    setRole(member.role)
    setPosition(member.position || '')
    setAssignedClassIds(member.assignedClasses.map(c => c.id))
    setEditingStaff(member)
    setShowForm(true)
    setShowBulkImport(false)
  }

  const toggleClass = (id: string) => {
    setAssignedClassIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setIsSubmitting(true)
    try {
      const data = {
        name: name.trim(),
        email: email.trim(),
        role,
        position: position.trim() || undefined,
        assignedClassIds: role === 'STAFF' ? assignedClassIds : undefined,
      }
      if (editingStaff) {
        await api.staff.update(editingStaff.id, data)
      } else {
        await api.staff.create(data)
      }
      resetForm()
      refetchStaff()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save staff')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleParseBulk = () => {
    const parsed = parseBulkInput(bulkText)
    setBulkRows(parsed)
  }

  const removeBulkRow = (index: number) => {
    setBulkRows(prev => prev.filter((_, i) => i !== index))
  }

  const updateBulkRole = (index: number, newRole: 'STAFF' | 'ADMIN') => {
    setBulkRows(prev => prev.map((row, i) => i === index ? { ...row, role: newRole } : row))
  }

  const updateBulkClass = (index: number, classId: string) => {
    setBulkRows(prev => prev.map((row, i) => i === index ? { ...row, classId } : row))
  }

  const handleBulkImport = async () => {
    if (bulkRows.length === 0) return
    setIsBulkImporting(true)
    try {
      const result = await api.staff.bulkCreate(
        bulkRows.map(r => ({ name: r.name, email: r.email, role: r.role }))
      )
      // Assign classes to newly created staff
      if (result.staff) {
        for (const created of result.staff) {
          const row = bulkRows.find(r => r.email.toLowerCase() === created.email.toLowerCase())
          if (row?.classId) {
            try {
              await api.staff.update(created.id, { assignedClassIds: [row.classId] })
            } catch { /* ignore class assignment errors */ }
          }
        }
      }
      setBulkResult({ created: result.created, skipped: result.skipped, errors: result.errors })
      refetchStaff()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk import failed')
    } finally {
      setIsBulkImporting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await api.staff.delete(deleteConfirm.id)
      refetchStaff()
      setDeleteConfirm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Staff</h2>
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
            <span>{showForm ? 'Cancel' : 'Add Staff'}</span>
          </button>
        </div>
      </div>

      {showBulkImport && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6 space-y-4">
          <h3 className="font-medium text-gray-900">Bulk Import Staff</h3>
          <p className="text-sm text-gray-500">
            Paste tab or comma-separated data. Columns: <span className="font-medium text-slate-700">Name, Email</span> (required), <span className="font-medium text-slate-700">Role</span> (optional: staff or admin). You can assign classes after parsing.
          </p>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            placeholder={"John Smith, john@school.com, staff\nJane Doe, jane@school.com, admin\nSam Wilson, sam@school.com"}
          />
          <button
            type="button"
            onClick={handleParseBulk}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Parse Data
          </button>

          {bulkRows.length > 0 && (
            <div className="space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-gray-700">Name</th>
                    <th className="text-left py-2 font-medium text-gray-700">Email</th>
                    <th className="text-left py-2 font-medium text-gray-700">Role</th>
                    <th className="text-left py-2 font-medium text-gray-700">Class</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 text-gray-500">{row.email}</td>
                      <td className="py-2">
                        <select
                          value={row.role}
                          onChange={e => updateBulkRole(i, e.target.value as 'STAFF' | 'ADMIN')}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="STAFF">Staff</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </td>
                      <td className="py-2">
                        <select
                          value={row.classId}
                          onChange={e => updateBulkClass(i, e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="">No class</option>
                          {classes?.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        <button onClick={() => removeBulkRow(i)} className="p-1 text-gray-400 hover:text-red-600">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={handleBulkImport}
                disabled={isBulkImporting}
                className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isBulkImporting ? 'Importing...' : `Import ${bulkRows.length} Staff`}
              </button>
            </div>
          )}

          {bulkResult && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <p className="font-medium text-gray-900">Import Complete</p>
              <div className="flex items-center space-x-4 mt-2 text-sm">
                <span className="text-green-600">{bulkResult.created} created</span>
                {bulkResult.skipped > 0 && <span className="text-amber-600">{bulkResult.skipped} skipped</span>}
                {bulkResult.errors && bulkResult.errors.length > 0 && (
                  <span className="text-red-600">{bulkResult.errors.length} error{bulkResult.errors.length !== 1 ? 's' : ''}</span>
                )}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'STAFF' | 'ADMIN')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
              <select
                value={position}
                onChange={e => setPosition(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select position...</option>
                <option value="Class Teacher">Class Teacher</option>
                <option value="Teaching Assistant">Teaching Assistant</option>
                <option value="Specialist">Specialist</option>
                <option value="Leadership Team">Leadership Team</option>
                <option value="SEN Coordinator">SEN Coordinator</option>
                <option value="Admin Team">Admin Team</option>
                <option value="Support Staff">Support Staff</option>
              </select>
            </div>
          </div>

          {role === 'STAFF' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Classes</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {classes?.map(cls => (
                  <label key={cls.id} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignedClassIds.includes(cls.id)}
                      onChange={() => toggleClass(cls.id)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{cls.name}</span>
                  </label>
                ))}
                {(!classes || classes.length === 0) && (
                  <p className="text-sm text-gray-400">No classes available</p>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isSubmitting ? 'Saving...' : editingStaff ? 'Update Staff' : 'Add Staff'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {staffList?.map(member => (
          <div key={member.id} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: member.role === 'ADMIN' ? theme.colors.brandColor : '#6B7280' }}
                >
                  {getInitials(member.name)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">{member.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center space-x-1 ${member.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {member.role === 'ADMIN' ? <Shield className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
                      <span>{member.role === 'ADMIN' ? 'Admin' : 'Staff'}</span>
                    </span>
                    {member.twoFactorEnabled ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-0.5">
                        <ShieldCheck className="h-3 w-3" />
                        <span>2FA</span>
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 flex items-center gap-0.5">
                        <ShieldOff className="h-3 w-3" />
                        <span>No 2FA</span>
                      </span>
                    )}
                    {member.position && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {member.position}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{member.email}</span>
                    <span className="text-gray-300">&middot;</span>
                    {member.lastLoginAt ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <Check className="h-3 w-3" />
                        Last login: {formatLastLogin(member.lastLoginAt)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <Clock className="h-3 w-3" />
                        Never logged in
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 ml-4">
                  {member.assignedClasses.map(cls => (
                    <span key={cls.id} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {cls.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleSendLogin(member)}
                  disabled={sendingLoginTo === member.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                  style={{
                    backgroundColor: member.lastLoginAt ? '#F3F4F6' : '#EEF0FF',
                    color: member.lastLoginAt ? '#6B7280' : '#5B6EC4',
                    opacity: sendingLoginTo === member.id ? 0.5 : 1,
                  }}
                  title="Send login email"
                >
                  <Send className="h-3 w-3" />
                  {sendingLoginTo === member.id ? 'Sending...' : member.lastLoginAt ? 'Resend' : 'Send Invite'}
                </button>
                {member.twoFactorEnabled && (
                  <button
                    onClick={() => handleReset2fa(member)}
                    disabled={resetting2faFor === member.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                    title="Reset 2FA"
                  >
                    <ShieldOff className="h-3 w-3" />
                    {resetting2faFor === member.id ? 'Resetting...' : 'Reset 2FA'}
                  </button>
                )}
                <button onClick={() => handleEdit(member)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleteConfirm({ id: member.id, name: member.name })} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {(!staffList || staffList.length === 0) && (
          <div className="text-center py-12 text-gray-500">
            <UserCog className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No staff members yet. Add your first staff member above.</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title="Delete Staff Member?"
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
