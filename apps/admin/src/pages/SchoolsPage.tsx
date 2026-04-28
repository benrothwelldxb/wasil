import React, { useState, useEffect, useMemo } from 'react'
import {
  Building2,
  Users,
  Palette,
  Save,
  RefreshCw,
  Plus,
  Search,
  GraduationCap,
  MessageSquare,
  ClipboardList,
  UserCog,
  Layers,
  X,
  Trash2,
  ArrowLeft,
  Eye,
  Shield,
  Clock,
  ChevronRight,
  BarChart3,
  UserPlus,
  Settings,
  Archive,
  Copy,
  Check,
} from 'lucide-react'
import { useApi, api, ColorPicker, ConfirmModal, useToast } from '@wasil/shared'
import type {
  SchoolWithCount,
  SchoolStats,
  SystemStats,
  SchoolUser,
  CreateSchoolData,
  School,
} from '@wasil/shared'

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color = 'bg-warm-rose-light text-warm-rose' }: {
  icon: React.ElementType
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center space-x-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Create School Modal ─────────────────────────────────────────────────────

function CreateSchoolModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState<CreateSchoolData>({
    name: '',
    shortName: '',
    city: '',
    academicYear: '2025/26',
    brandColor: '#7f0029',
    accentColor: '#D4AF37',
    tagline: '',
    logoUrl: '',
    logoIconUrl: '',
    paymentUrl: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const updateField = (field: keyof CreateSchoolData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.warning('School name is required'); return }
    setIsSaving(true)
    try {
      await api.schools.create({
        ...form,
        shortName: form.shortName || undefined,
        city: form.city || undefined,
        tagline: form.tagline || undefined,
        logoUrl: form.logoUrl || undefined,
        logoIconUrl: form.logoIconUrl || undefined,
        paymentUrl: form.paymentUrl || undefined,
      })
      onCreated()
      onClose()
    } catch (err) {
      toast.error(`Failed to create school: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center space-x-2">
            <Plus className="h-5 w-5 text-warm-rose" />
            <span>Create New School</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">School Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="e.g. Victory Heights Primary School"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Short Name</label>
              <input
                type="text"
                value={form.shortName}
                onChange={e => updateField('shortName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="e.g. VHPS"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City / Location</label>
              <input
                type="text"
                value={form.city}
                onChange={e => updateField('city', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="e.g. Dubai"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Academic Year</label>
              <select
                value={form.academicYear}
                onChange={e => updateField('academicYear', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
              >
                <option value="2025/26">2025/26</option>
                <option value="2026/27">2026/27</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tagline</label>
              <input
                type="text"
                value={form.tagline}
                onChange={e => updateField('tagline', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="e.g. Learning Together"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Brand Colour</label>
              <ColorPicker value={form.brandColor || '#7f0029'} onChange={v => updateField('brandColor', v)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Accent Colour</label>
              <ColorPicker value={form.accentColor || '#D4AF37'} onChange={v => updateField('accentColor', v)} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL</label>
              <input
                type="text"
                value={form.logoUrl}
                onChange={e => updateField('logoUrl', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Logo Icon URL</label>
              <input
                type="text"
                value={form.logoIconUrl}
                onChange={e => updateField('logoIconUrl', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment URL</label>
              <input
                type="text"
                value={form.paymentUrl}
                onChange={e => updateField('paymentUrl', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="https://www.payhub360.com/login/"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !form.name.trim()}
            className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-warm-rose text-white hover:bg-warm-rose/90 disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>{isSaving ? 'Creating...' : 'Create School'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Admin Modal ─────────────────────────────────────────────────────────

function AddAdminModal({ schoolId, schoolName, onClose, onCreated }: {
  schoolId: string
  schoolName: string
  onClose: () => void
  onCreated: () => void
}) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'STAFF'>('ADMIN')
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ tempPassword: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSave = async () => {
    if (!email.trim() || !name.trim()) return
    setIsSaving(true)
    try {
      const res = await api.schools.createAdmin(schoolId, { email, name, role })
      setResult({ tempPassword: res.tempPassword })
      onCreated()
    } catch (err) {
      toast.error(`Failed to create user: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
          <div className="text-center mb-4">
            <div className="w-12 h-12 rounded-full bg-warm-green-light flex items-center justify-center mx-auto mb-3">
              <Check className="h-6 w-6 text-warm-green" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">User Created</h3>
            <p className="text-sm text-slate-500 mt-1">The user has been added to {schoolName}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <p className="text-xs text-slate-500 mb-1">Temporary Password</p>
            <div className="flex items-center space-x-2">
              <code className="text-sm font-mono text-slate-800 flex-1 break-all">{result.tempPassword}</code>
              <button onClick={handleCopy} className="shrink-0 text-slate-400 hover:text-slate-600">
                {copied ? <Check className="h-4 w-4 text-warm-green" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">The user can also use "Forgot Password" to set their own password.</p>
          </div>
          <button onClick={onClose} className="w-full px-4 py-2 rounded-lg bg-warm-rose text-white hover:bg-warm-rose/90">
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center space-x-2">
            <UserPlus className="h-5 w-5 text-warm-rose" />
            <span>Add User to {schoolName}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
              placeholder="user@school.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as 'ADMIN' | 'STAFF')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
            >
              <option value="ADMIN">Admin</option>
              <option value="STAFF">Staff</option>
            </select>
          </div>
        </div>
        <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !email.trim() || !name.trim()}
            className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-warm-rose text-white hover:bg-warm-rose/90 disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            <span>{isSaving ? 'Creating...' : 'Create User'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── School Detail View ──────────────────────────────────────────────────────

function SchoolDetailView({ school, onBack, onRefresh }: {
  school: SchoolWithCount
  onBack: () => void
  onRefresh: () => void
}) {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'overview' | 'branding' | 'users' | 'settings'>('overview')
  const { data: stats, refetch: refetchStats } = useApi<SchoolStats>(() => api.schools.getStats(school.id), [school.id])
  const { data: users, refetch: refetchUsers } = useApi<SchoolUser[]>(() => api.schools.getUsers(school.id), [school.id])
  const [showAddAdmin, setShowAddAdmin] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [userToRemove, setUserToRemove] = useState<SchoolUser | null>(null)

  // Branding state
  const [brandingForm, setBrandingForm] = useState({
    name: school.name,
    shortName: school.shortName,
    city: school.city || '',
    tagline: school.tagline || '',
    brandColor: school.brandColor,
    accentColor: school.accentColor,
    logoUrl: school.logoUrl || '',
    logoIconUrl: school.logoIconUrl || '',
    paymentUrl: school.paymentUrl || '',
    academicYear: school.academicYear || '2025/26',
  })
  const [isSavingBranding, setIsSavingBranding] = useState(false)

  const handleSaveBranding = async () => {
    setIsSavingBranding(true)
    try {
      await api.schools.updateBranding(school.id, {
        name: brandingForm.name,
        shortName: brandingForm.shortName,
        city: brandingForm.city || undefined,
        tagline: brandingForm.tagline || undefined,
        brandColor: brandingForm.brandColor,
        accentColor: brandingForm.accentColor,
        logoUrl: brandingForm.logoUrl || undefined,
        logoIconUrl: brandingForm.logoIconUrl || undefined,
        paymentUrl: brandingForm.paymentUrl || undefined,
      } as Partial<School>)
      onRefresh()
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSavingBranding(false)
    }
  }

  const handleArchive = async () => {
    try {
      await api.schools.archive(school.id)
      onRefresh()
      onBack()
    } catch (err) {
      toast.error(`Failed to archive: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleRemoveUser = async () => {
    if (!userToRemove) return
    try {
      await api.schools.removeUser(school.id, userToRemove.id)
      refetchUsers()
      refetchStats()
      setUserToRemove(null)
    } catch (err) {
      toast.error(`Failed to remove user: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'branding' as const, label: 'Branding', icon: Palette },
    { id: 'users' as const, label: 'Users', icon: Users },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ]

  const groupedUsers = useMemo(() => {
    if (!users) return { ADMIN: [], STAFF: [], PARENT: [] }
    const groups: Record<string, SchoolUser[]> = { ADMIN: [], STAFF: [], PARENT: [] }
    users.forEach(u => {
      if (groups[u.role]) groups[u.role].push(u)
      else groups[u.role] = [u]
    })
    return groups
  }, [users])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center space-x-4 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center space-x-3 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: school.brandColor }}>
            {school.logoIconUrl ? (
              <img src={school.logoIconUrl} alt="" className="h-6 w-6 object-contain" />
            ) : (
              school.shortName?.substring(0, 2) || school.name.substring(0, 2)
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{school.name}</h2>
            <p className="text-sm text-slate-500">{school.city} {school.archived ? <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600 font-medium">Archived</span> : ''}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-warm-rose text-warm-rose'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <StatCard icon={Users} label="Parents" value={stats.parentCount} color="bg-warm-blue-light text-warm-blue" />
            <StatCard icon={GraduationCap} label="Students" value={stats.studentCount} color="bg-warm-green-light text-warm-green" />
            <StatCard icon={UserCog} label="Staff" value={stats.staffCount + stats.adminCount} color="bg-warm-amber-light text-warm-amber" />
            <StatCard icon={Layers} label="Classes" value={stats.classCount} color="bg-purple-50 text-purple-500" />
            <StatCard icon={MessageSquare} label="Messages" value={stats.messageCount} color="bg-warm-rose-light text-warm-rose" />
            <StatCard icon={ClipboardList} label="Forms" value={stats.formCount} color="bg-warm-blue-light text-warm-blue" />
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>Recent Activity</span>
            </h3>
            {stats.recentAuditLogs.length > 0 ? (
              <div className="space-y-3">
                {stats.recentAuditLogs.map(log => (
                  <div key={log.id} className="flex items-start space-x-3 text-sm">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      log.action === 'CREATE' ? 'bg-warm-green' : log.action === 'DELETE' ? 'bg-red-400' : 'bg-warm-amber'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700">
                        <span className="font-medium">{log.userName}</span>
                        {' '}{log.action.toLowerCase()}d a {log.resourceType.toLowerCase().replace('_', ' ')}
                      </p>
                      <p className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No recent activity</p>
            )}
          </div>
        </div>
      )}

      {/* Branding Tab */}
      {activeTab === 'branding' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">School Details</h3>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">School Name</label>
              <input
                type="text"
                value={brandingForm.name}
                onChange={e => setBrandingForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Short Name</label>
                <input
                  type="text"
                  value={brandingForm.shortName}
                  onChange={e => setBrandingForm(p => ({ ...p, shortName: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">City</label>
                <input
                  type="text"
                  value={brandingForm.city}
                  onChange={e => setBrandingForm(p => ({ ...p, city: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Tagline</label>
              <input
                type="text"
                value={brandingForm.tagline}
                onChange={e => setBrandingForm(p => ({ ...p, tagline: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="e.g. Learning Together"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Brand Colour</label>
                <ColorPicker value={brandingForm.brandColor} onChange={v => setBrandingForm(p => ({ ...p, brandColor: v }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Accent Colour</label>
                <ColorPicker value={brandingForm.accentColor} onChange={v => setBrandingForm(p => ({ ...p, accentColor: v }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Logo URL</label>
              <input
                type="text"
                value={brandingForm.logoUrl}
                onChange={e => setBrandingForm(p => ({ ...p, logoUrl: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Logo Icon URL</label>
              <input
                type="text"
                value={brandingForm.logoIconUrl}
                onChange={e => setBrandingForm(p => ({ ...p, logoIconUrl: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Payment URL</label>
              <input
                type="text"
                value={brandingForm.paymentUrl}
                onChange={e => setBrandingForm(p => ({ ...p, paymentUrl: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
                placeholder="https://www.payhub360.com/login/"
              />
            </div>
            <button
              onClick={handleSaveBranding}
              disabled={isSavingBranding}
              className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-warm-rose text-white hover:bg-warm-rose/90 disabled:opacity-50"
            >
              {isSavingBranding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{isSavingBranding ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>

          {/* Live Preview */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Live Preview</h3>
            <div className="mx-auto max-w-[280px]">
              <div className="rounded-[28px] border-[6px] border-slate-800 overflow-hidden shadow-xl">
                {/* Phone status bar */}
                <div className="bg-slate-800 h-6 flex items-center justify-center">
                  <div className="w-16 h-3 bg-slate-700 rounded-full" />
                </div>
                {/* App header */}
                <div className="h-20 flex items-center justify-center px-4" style={{ backgroundColor: brandingForm.brandColor }}>
                  {brandingForm.logoUrl ? (
                    <img src={brandingForm.logoUrl} alt={brandingForm.name} className="h-10 object-contain" />
                  ) : (
                    <span className="text-white text-base font-bold">{brandingForm.shortName || brandingForm.name}</span>
                  )}
                </div>
                {/* Content preview */}
                <div className="bg-slate-50 p-4 min-h-[200px]">
                  <h4 className="font-semibold text-slate-800 text-sm">{brandingForm.name}</h4>
                  {brandingForm.tagline && <p className="text-xs text-slate-500 mt-1">{brandingForm.tagline}</p>}
                  <div className="flex items-center space-x-2 mt-3">
                    <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: brandingForm.brandColor }} title="Brand" />
                    <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: brandingForm.accentColor }} title="Accent" />
                  </div>
                  {/* Fake content cards */}
                  <div className="mt-4 space-y-2">
                    <div className="bg-white rounded-lg p-3 border border-slate-100">
                      <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: brandingForm.brandColor, opacity: 0.3 }} />
                      <div className="h-2 w-1/2 bg-slate-200 rounded-full mt-2" />
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-slate-100">
                      <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: brandingForm.accentColor, opacity: 0.3 }} />
                      <div className="h-2 w-3/5 bg-slate-200 rounded-full mt-2" />
                    </div>
                  </div>
                </div>
                {/* Phone bottom bar */}
                <div className="bg-white h-5 flex items-center justify-center border-t border-slate-100">
                  <div className="w-20 h-1 bg-slate-300 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">School Users</h3>
            <button
              onClick={() => setShowAddAdmin(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-warm-rose text-white hover:bg-warm-rose/90 text-sm"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Admin</span>
            </button>
          </div>

          {(['ADMIN', 'STAFF', 'PARENT'] as const).map(role => {
            const roleUsers = groupedUsers[role] || []
            if (roleUsers.length === 0) return null
            return (
              <div key={role} className="mb-6">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <span>{role === 'ADMIN' ? 'Admins' : role === 'STAFF' ? 'Staff' : 'Parents'}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">{roleUsers.length}</span>
                </h4>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {roleUsers.map(user => (
                    <div key={user.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <span className="text-xs font-semibold text-slate-500">{user.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{user.name}</p>
                          <p className="text-xs text-slate-400 truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          role === 'ADMIN' ? 'bg-warm-rose-light text-warm-rose' :
                          role === 'STAFF' ? 'bg-warm-amber-light text-warm-amber' :
                          'bg-warm-blue-light text-warm-blue'
                        }`}>{role}</span>
                        {role !== 'PARENT' && (
                          <button
                            onClick={() => setUserToRemove(user)}
                            className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                            title="Remove user"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {users && users.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No users in this school yet</p>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Academic Year</h3>
            <select
              value={brandingForm.academicYear}
              onChange={e => setBrandingForm(p => ({ ...p, academicYear: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose"
            >
              <option value="2025/26">2025/26</option>
              <option value="2026/27">2026/27</option>
            </select>
          </div>

          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center space-x-2">
              <Archive className="h-4 w-4" />
              <span>Danger Zone</span>
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Archiving this school will hide it from all users. This action can be reversed by a super admin.
            </p>
            <button
              onClick={() => setShowArchiveConfirm(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm"
            >
              <Archive className="h-4 w-4" />
              <span>Archive School</span>
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddAdmin && (
        <AddAdminModal
          schoolId={school.id}
          schoolName={school.name}
          onClose={() => setShowAddAdmin(false)}
          onCreated={() => { refetchUsers(); refetchStats() }}
        />
      )}

      {showArchiveConfirm && (
        <ConfirmModal
          title="Archive School"
          message={`Are you sure you want to archive "${school.name}"? This will hide the school from all users.`}
          confirmLabel="Archive"
          onConfirm={handleArchive}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      )}

      {userToRemove && (
        <ConfirmModal
          title="Remove User"
          message={`Are you sure you want to remove "${userToRemove.name}" (${userToRemove.email}) from this school? This action cannot be undone.`}
          confirmLabel="Remove"
          onConfirm={handleRemoveUser}
          onCancel={() => setUserToRemove(null)}
        />
      )}
    </div>
  )
}

// ─── School Card ─────────────────────────────────────────────────────────────

function SchoolCard({ school, onManage }: { school: SchoolWithCount; onManage: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-16 flex items-center justify-center px-4 relative" style={{ backgroundColor: school.brandColor }}>
        {school.logoUrl ? (
          <img src={school.logoUrl} alt={school.name} className="h-8 object-contain" />
        ) : (
          <span className="text-white text-sm font-bold">{school.shortName || school.name}</span>
        )}
        {school.archived && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/30 text-white">ARCHIVED</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-800 text-sm truncate">{school.name}</h3>
            {school.city && <p className="text-xs text-slate-400 mt-0.5">{school.city}</p>}
          </div>
          <div className="flex items-center space-x-1 shrink-0 ml-2">
            <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: school.brandColor }} />
            <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: school.accentColor }} />
          </div>
        </div>
        <div className="flex items-center space-x-3 mt-3 text-xs text-slate-500">
          <span className="flex items-center space-x-1">
            <Users className="h-3 w-3" />
            <span>{school.parentCount ?? 0} parents</span>
          </span>
          <span className="flex items-center space-x-1">
            <GraduationCap className="h-3 w-3" />
            <span>{school._count?.students ?? 0} students</span>
          </span>
          <span className="flex items-center space-x-1">
            <UserCog className="h-3 w-3" />
            <span>{school.staffCount ?? 0} staff</span>
          </span>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            school.archived ? 'bg-red-50 text-red-500' : 'bg-warm-green-light text-warm-green'
          }`}>
            {school.archived ? 'Archived' : 'Active'}
          </span>
          <button
            onClick={onManage}
            className="flex items-center space-x-1 text-sm text-warm-rose hover:text-warm-rose/80 font-medium"
          >
            <span>Manage</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function SchoolsPage() {
  const { data: schools, refetch: refetchSchools } = useApi<SchoolWithCount[]>(() => api.schools.list(true), [])
  const { data: systemStats } = useApi<SystemStats>(() => api.schools.getSystemStats(), [])
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<SchoolWithCount | null>(null)

  const filteredSchools = useMemo(() => {
    if (!schools) return []
    if (!searchQuery.trim()) return schools
    const q = searchQuery.toLowerCase()
    return schools.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.shortName.toLowerCase().includes(q) ||
      (s.city && s.city.toLowerCase().includes(q))
    )
  }, [schools, searchQuery])

  if (selectedSchool) {
    return (
      <SchoolDetailView
        school={selectedSchool}
        onBack={() => setSelectedSchool(null)}
        onRefresh={() => {
          refetchSchools()
          // Refresh the selected school data
          const refreshed = schools?.find(s => s.id === selectedSchool.id)
          if (refreshed) setSelectedSchool(refreshed)
        }}
      />
    )
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
          <Building2 className="h-6 w-6 text-warm-rose" />
          <span>Schools</span>
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-warm-rose text-white hover:bg-warm-rose/90 shadow-sm text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          <span>Create New School</span>
        </button>
      </div>

      {/* System Stats */}
      {systemStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Building2} label="Total Schools" value={systemStats.totalSchools} color="bg-warm-rose-light text-warm-rose" />
          <StatCard icon={Users} label="Total Parents" value={systemStats.totalParents} color="bg-warm-blue-light text-warm-blue" />
          <StatCard icon={GraduationCap} label="Total Students" value={systemStats.totalStudents} color="bg-warm-green-light text-warm-green" />
          <StatCard icon={MessageSquare} label="Messages This Month" value={systemStats.messagesThisMonth} color="bg-warm-amber-light text-warm-amber" />
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search schools by name, short name, or city..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-warm-rose/30 focus:border-warm-rose text-sm"
          />
        </div>
      </div>

      {/* Schools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSchools.map(school => (
          <SchoolCard
            key={school.id}
            school={school}
            onManage={() => setSelectedSchool(school)}
          />
        ))}
      </div>

      {filteredSchools.length === 0 && schools && schools.length > 0 && (
        <div className="text-center py-12 text-slate-400">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No schools match your search</p>
        </div>
      )}

      {(!schools || schools.length === 0) && (
        <div className="text-center py-12 text-slate-400">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No schools found</p>
          <p className="text-sm mt-1">Create your first school to get started</p>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateSchoolModal
          onClose={() => setShowCreateModal(false)}
          onCreated={refetchSchools}
        />
      )}
    </div>
  )
}
