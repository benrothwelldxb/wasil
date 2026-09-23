import React, { useState } from 'react'
import { X, Pencil, Shield, GraduationCap, UserCog } from 'lucide-react'
import { useTheme, useApi, api, useToast, hasLeft } from '@wasil/shared'
import type { Class } from '@wasil/shared'
import type { StaffMember } from '@wasil/shared'
import { HubSyncBanner } from '../components/HubSyncBanner'
import { HubChip } from '../components/HubChip'

export function StaffPage() {
  const theme = useTheme()
  const toast = useToast()
  const { data: staffList, refetch: refetchStaff } = useApi<StaffMember[]>(() => api.staff.list(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])

  // Editing here only ever manages Connect-owned role/permissions (and, for
  // staff not linked to Hub, the remaining identity fields). There is no
  // "Add Staff" — staff identity comes from Hub.
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Staff Hub has archived. They stay on this page — an admin needs to see who
  // has gone, and their posts and parent threads are still there to read — but
  // they are folded away by default and no picker anywhere offers them.
  const current = (staffList ?? []).filter(m => !hasLeft(m.leftAt))
  const leavers = (staffList ?? []).filter(m => hasLeft(m.leftAt))
  const [showLeavers, setShowLeavers] = useState(false)

  // Edit form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'STAFF' | 'ADMIN'>('STAFF')
  const [position, setPosition] = useState('')
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([])

  const resetForm = () => {
    setEditingStaff(null)
    setName('')
    setEmail('')
    setRole('STAFF')
    setPosition('')
    setAssignedClassIds([])
  }

  const handleEdit = (member: StaffMember) => {
    setName(member.name)
    setEmail(member.email)
    setRole(member.role)
    setPosition(member.position || '')
    setAssignedClassIds(member.assignedClasses.map(c => c.id))
    setEditingStaff(member)
  }

  const toggleClass = (id: string) => {
    setAssignedClassIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStaff) return
    setIsSubmitting(true)
    try {
      const isHubSourced = !!editingStaff.fromHub
      await api.staff.update(editingStaff.id, {
        // Identity fields are Hub-owned once linked — only send changes for
        // staff that aren't Hub-sourced.
        ...(isHubSourced ? {} : { name: name.trim(), email: email.trim(), position: position.trim() || undefined }),
        role,
        // Class-teacher assignments are authoritatively reconciled from Hub's
        // class.teachers[] on sync for any Hub-synced class, so only editable
        // here for staff Connect still owns end-to-end.
        assignedClassIds: !isHubSourced && role === 'STAFF' ? assignedClassIds : undefined,
      })
      resetForm()
      refetchStaff()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save staff')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  // Hub sends a real leaving date when it holds one; when it doesn't, the sync
  // stamps the moment it noticed, which is close enough to show as a date and
  // misleading to show as a time. The same value reads as "Leaving" ahead of
  // the day and "Left" after it.
  const formatLeftAt = (iso?: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div>
      <HubSyncBanner noun="Staff" onSynced={refetchStaff} />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Staff</h2>
      </div>

      {editingStaff && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Edit Staff Access — {editingStaff.name}</h3>
            <button type="button" onClick={resetForm} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          {editingStaff.fromHub && (
            <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
              Name, email, position and class assignments for this staff member are managed in Wasil Hub. Only their
              Connect role can be changed here.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={editingStaff.fromHub}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={editingStaff.fromHub}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
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
              {editingStaff.fromHub ? (
                <p className="px-3 py-2 text-sm text-slate-500 bg-slate-50 border border-gray-200 rounded-lg">
                  {position || '—'}
                </p>
              ) : (
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
              )}
            </div>
          </div>

          {role === 'STAFF' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Classes</label>
              {editingStaff.fromHub ? (
                <div className="flex flex-wrap gap-1">
                  {editingStaff.assignedClasses.length > 0 ? (
                    editingStaff.assignedClasses.map(cls => (
                      <span key={cls.id} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {cls.name}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400">No classes assigned in Hub</p>
                  )}
                </div>
              ) : (
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
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {current.map(member => (
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
                    {member.fromHub && <HubChip />}
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center space-x-1 ${member.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {member.role === 'ADMIN' ? <Shield className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
                      <span>{member.role === 'ADMIN' ? 'Admin' : 'Staff'}</span>
                    </span>
                    {member.position && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {member.position}
                      </span>
                    )}
                    {/* Notice given, last day still ahead. They stay in every
                        picker until that date — this is the only place the
                        school would otherwise learn it is coming. */}
                    {member.leftAt && !hasLeft(member.leftAt) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Leaving {formatLeftAt(member.leftAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{member.email}</span>
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
                <button onClick={() => handleEdit(member)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Edit access">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {(!staffList || staffList.length === 0) && (
          <div className="text-center py-12 text-gray-500">
            <UserCog className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No staff members yet.</p>
          </div>
        )}

        {leavers.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowLeavers(v => !v)}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium"
            >
              {showLeavers ? 'Hide' : 'Show'} {leavers.length} who {leavers.length === 1 ? 'has' : 'have'} left
            </button>
            {showLeavers && (
              <div className="space-y-2 mt-3">
                <p className="text-xs text-slate-400">
                  Their last day has passed, per Wasil Hub. Posts and message threads stay
                  readable, and they no longer appear when you pick staff for a consultation, a
                  group or a tag. Anyone leaving on a future date is still in the list above,
                  marked with the date.
                </p>
                {leavers.map(member => (
                  <div key={member.id} className="bg-slate-50 rounded-lg border border-slate-200 p-3 opacity-80">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-white text-xs font-medium">
                        {getInitials(member.name)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-600">{member.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                            Left {formatLeftAt(member.leftAt)}
                          </span>
                        </div>
                        <span className="text-sm text-slate-400">{member.email}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
