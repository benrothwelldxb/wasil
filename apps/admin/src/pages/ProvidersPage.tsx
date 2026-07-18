import { useEffect, useState, type FormEvent } from 'react'
import { api, useApi, useToast } from '@wasil/shared'
import type { ProviderSummary, ProviderDetail, ProviderInviteResult } from '@wasil/shared'
import { Building2, Copy, Plus, UserPlus, X } from 'lucide-react'

const TYPE_LABEL: Record<string, string> = { ECA: 'Extra-curricular', CATERING: 'Catering' }

export function ProvidersPage() {
  const { data: providers, isLoading, error, refetch } = useApi<ProviderSummary[]>(() => api.providers.list())
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-warm-text-primary">Providers</h1>
          <p className="text-warm-text-secondary mt-1">External clubs and catering that manage their own offerings.</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-warm-btn bg-brand text-white font-semibold px-4 py-2.5 text-sm">
          <Plus className="h-4 w-4" /> New provider
        </button>
      </div>

      {isLoading && <div className="text-warm-text-tertiary text-sm">Loading…</div>}
      {error && <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5">Failed to load providers.</div>}

      {providers && providers.length === 0 && !isLoading && (
        <div className="warm-card p-10 text-center">
          <Building2 className="h-8 w-8 text-warm-text-tertiary mx-auto mb-3" />
          <p className="text-warm-text-secondary text-sm">No providers yet. Add one to give an external club or caterer their own portal.</p>
        </div>
      )}

      <div className="space-y-3">
        {providers?.map(p => (
          <button
            key={p.id}
            onClick={() => setOpenId(p.id)}
            className="w-full text-left warm-card p-4 flex items-center justify-between gap-4 hover:border-brand/40 transition-colors"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-warm-text-primary">{p.name}</span>
                <span className="text-xs bg-slate-100 text-warm-text-secondary px-2 py-0.5 rounded-full">{TYPE_LABEL[p.type] || p.type}</span>
                {p.status === 'SUSPENDED' && <span className="text-xs bg-red-50 text-warm-error px-2 py-0.5 rounded-full">Suspended</span>}
              </div>
              <div className="text-sm text-warm-text-tertiary mt-1">
                {p.userCount} {p.userCount === 1 ? 'user' : 'users'} · {p.activityCount} {p.activityCount === 1 ? 'activity' : 'activities'}
                {p.contactEmail ? ` · ${p.contactEmail}` : ''}
              </div>
            </div>
            <span className="text-sm text-brand font-semibold">Manage →</span>
          </button>
        ))}
      </div>

      {creating && (
        <CreateProviderModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            toast.success('Provider created')
            refetch()
          }}
        />
      )}
      {openId && (
        <ProviderDetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => refetch()}
        />
      )}
    </div>
  )
}

function CreateProviderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'ECA' | 'CATERING'>('ECA')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.providers.create({
        name: name.trim(),
        type,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      })
      onCreated()
    } catch {
      toast.error('Failed to create provider')
      setSaving(false)
    }
  }

  const input = 'w-full rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30'

  return (
    <Modal title="New provider" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={input} required />
        </div>
        <div>
          <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Type</label>
          <select value={type} onChange={e => setType(e.target.value as 'ECA' | 'CATERING')} className={input}>
            <option value="ECA">Extra-curricular clubs</option>
            <option value="CATERING">Catering</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Contact email</label>
            <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Contact phone</label>
            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={input} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-warm-btn px-4 py-2 text-sm font-semibold text-warm-text-secondary hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-warm-btn bg-brand text-white font-semibold px-5 py-2 text-sm disabled:opacity-60">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ProviderDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<ProviderDetail | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [lastInvite, setLastInvite] = useState<ProviderInviteResult | null>(null)
  const toast = useToast()

  const load = () => api.providers.get(id).then(setData).catch(() => setLoadError(true))
  useEffect(() => { load() }, [id])

  const toggleStatus = async () => {
    if (!data) return
    const status = data.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    try {
      await api.providers.update(id, { status })
      await load()
      onChanged()
      toast.success(status === 'ACTIVE' ? 'Provider reactivated' : 'Provider suspended')
    } catch {
      toast.error('Failed to update')
    }
  }

  const toggleShare = async () => {
    if (!data) return
    try {
      await api.providers.update(id, { shareParentContact: !data.shareParentContact })
      await load()
    } catch {
      toast.error('Failed to update')
    }
  }

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const res = await api.providers.invite(id, inviteEmail.trim())
      setLastInvite(res)
      setInviteEmail('')
      await load()
    } catch {
      toast.error('Failed to create invitation')
    }
  }

  const inviteLink = lastInvite ? `${window.location.origin.replace(/admin/, 'provider')}/register?token=${lastInvite.token}` : ''

  return (
    <Modal title={data?.name || 'Provider'} onClose={onClose}>
      {loadError && <p className="text-sm text-warm-error">Failed to load provider.</p>}
      {data && (
        <div className="space-y-5">
          {/* Governance toggles */}
          <div className="space-y-2">
            <ToggleRow
              label="Account active"
              hint="Suspended providers cannot sign in."
              checked={data.status === 'ACTIVE'}
              onChange={toggleStatus}
            />
            <ToggleRow
              label="Share parent contact"
              hint="Let this provider see parent name, email and phone for their bookings."
              checked={data.shareParentContact}
              onChange={toggleShare}
            />
          </div>

          {/* Users */}
          <div>
            <div className="text-sm font-bold text-warm-text-primary mb-2">Portal users</div>
            {data.users.length === 0 && <p className="text-sm text-warm-text-tertiary">No users have signed up yet.</p>}
            <div className="space-y-1.5">
              {data.users.map(u => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <span className="text-warm-text-primary">{u.name} <span className="text-warm-text-tertiary">· {u.email}</span></span>
                  <span className="text-xs text-warm-text-tertiary">{u.hasPassword ? (u.lastLoginAt ? 'Active' : 'Set up') : 'Invited'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Invite */}
          <div>
            <div className="text-sm font-bold text-warm-text-primary mb-2 flex items-center gap-1.5"><UserPlus className="h-4 w-4" /> Invite a user</div>
            <form onSubmit={invite} className="flex gap-2">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="person@provider.com"
                className="flex-1 rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <button type="submit" className="rounded-warm-btn bg-brand text-white font-semibold px-4 py-2 text-sm">Invite</button>
            </form>

            {lastInvite && (
              <div className="mt-3 rounded-warm bg-warm-green/10 border border-warm-green/30 p-3">
                <div className="text-xs font-semibold text-warm-text-primary mb-1">Registration link — share with {lastInvite.email}:</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white rounded px-2 py-1.5 border border-warm-border break-all">{inviteLink}</code>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(inviteLink); toast.success('Copied') }}
                    className="p-2 rounded-warm hover:bg-white text-warm-text-secondary"
                    aria-label="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {data.pendingInvites.length > 0 && (
              <div className="mt-3 text-xs text-warm-text-tertiary">
                Pending: {data.pendingInvites.map(i => i.email).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-warm border border-warm-border px-3 py-2.5">
      <div>
        <div className="text-sm font-semibold text-warm-text-primary">{label}</div>
        <div className="text-xs text-warm-text-tertiary">{hint}</div>
      </div>
      <button
        onClick={onChange}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`w-11 h-6 rounded-full transition-colors flex-none relative ${checked ? 'bg-warm-green' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-warm w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-border">
          <h2 className="text-lg font-extrabold text-warm-text-primary">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-warm hover:bg-slate-50 text-warm-text-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
