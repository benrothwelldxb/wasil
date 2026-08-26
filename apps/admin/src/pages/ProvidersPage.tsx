import { useEffect, useState, type FormEvent } from 'react'
import { api, useApi, useToast } from '@wasil/shared'
import type {
  ProviderSummary, ProviderDetail, ProviderInviteResult,
  ProviderPortalActivity, ProviderPortalMenu, ProviderPortalTerm,
} from '@wasil/shared'
import { Building2, Copy, Plus, Trash2, UserPlus, X } from 'lucide-react'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

type TabKey = 'access' | 'details' | 'clubs' | 'menus'

function ProviderDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<ProviderDetail | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [tab, setTab] = useState<TabKey>('access')
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

  // Prefer the server-built registration link (from PROVIDER_APP_URL); fall back
  // to deriving it from the admin origin only if the server didn't supply one.
  const inviteLink = lastInvite
    ? (lastInvite.registrationUrl || `${window.location.origin.replace(/admin/, 'provider')}/register?token=${lastInvite.token}`)
    : ''

  // Which tabs make sense for this provider. A school can set up and edit
  // everything a provider would manage themselves — the same records, through
  // the same routes — so a provider is presentable to parents before they've
  // ever signed in, and fixable afterwards without waiting on them.
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'access', label: 'Access' },
    { key: 'details', label: 'Details' },
    ...(data?.type !== 'CATERING' ? [{ key: 'clubs' as TabKey, label: 'Clubs' }] : []),
    ...(data?.type !== 'ECA' ? [{ key: 'menus' as TabKey, label: 'Menus' }] : []),
  ]

  return (
    <Modal title={data?.name || 'Provider'} onClose={onClose}>
      {loadError && <p className="text-sm text-warm-error">Failed to load provider.</p>}
      {data && (
        <div className="space-y-5">
          <div className="flex gap-1 border-b border-warm-border -mt-1">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-brand text-brand'
                    : 'border-transparent text-warm-text-tertiary hover:text-warm-text-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'details' && <ProviderDetailsTab providerId={id} onSaved={onChanged} />}
          {tab === 'clubs' && <ProviderClubsTab providerId={id} />}
          {tab === 'menus' && <ProviderMenusTab providerId={id} />}
        </div>
      )}
      {data && tab === 'access' && (
        <div className="space-y-5 mt-5">
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
                <div className="text-xs font-semibold text-warm-text-primary mb-1">We've emailed {lastInvite.email} their registration link. You can also copy it:</div>
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

// ─── Details: the provider's own profile, edited by the school ───────────────
function ProviderDetailsTab({ providerId, onSaved }: { providerId: string; onSaved: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ providerName: '', contactEmail: '', contactPhone: '' })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.providerPortalAdmin.profile(providerId)
      .then(p => {
        setForm({
          providerName: p.provider.name,
          contactEmail: p.provider.contactEmail || '',
          contactPhone: p.provider.contactPhone || '',
        })
        setLoaded(true)
      })
      .catch(() => toast.error('Failed to load provider details'))
  }, [providerId])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.providerPortalAdmin.updateProfile(providerId, {
        providerName: form.providerName.trim(),
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
      })
      onSaved()
      toast.success('Details saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <p className="text-sm text-warm-text-tertiary">Loading…</p>

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Provider name" value={form.providerName} onChange={v => setForm({ ...form, providerName: v })} required />
      <Field label="Contact email" type="email" value={form.contactEmail} onChange={v => setForm({ ...form, contactEmail: v })} />
      <Field label="Contact phone" value={form.contactPhone} onChange={v => setForm({ ...form, contactPhone: v })} />
      <p className="text-xs text-warm-text-tertiary">
        These are the provider's own details, shown to parents. When the provider signs in they see and can edit exactly this.
      </p>
      <button type="submit" disabled={saving} className="rounded-warm-btn bg-brand text-white font-semibold px-4 py-2 text-sm disabled:opacity-60">
        {saving ? 'Saving…' : 'Save details'}
      </button>
    </form>
  )
}

// ─── Clubs: the activities this provider runs ────────────────────────────────
function ProviderClubsTab({ providerId }: { providerId: string }) {
  const toast = useToast()
  const [activities, setActivities] = useState<ProviderPortalActivity[] | null>(null)
  const [terms, setTerms] = useState<ProviderPortalTerm[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ ecaTermId: '', name: '', dayOfWeek: 1, timeSlot: 'AFTER_SCHOOL', location: '', cost: '', maxCapacity: '' })

  const load = () =>
    Promise.all([api.providerPortalAdmin.activities(providerId), api.providerPortalAdmin.terms(providerId)])
      .then(([a, t]) => {
        setActivities(a)
        setTerms(t)
        setForm(f => ({ ...f, ecaTermId: f.ecaTermId || t[0]?.id || '' }))
      })
      .catch(() => toast.error('Failed to load clubs'))
  useEffect(() => { load() }, [providerId])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.providerPortalAdmin.createActivity(providerId, {
        ecaTermId: form.ecaTermId,
        name: form.name.trim(),
        dayOfWeek: form.dayOfWeek,
        timeSlot: form.timeSlot,
        location: form.location.trim() || null,
        cost: form.cost ? Number(form.cost) : null,
        maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
      })
      setForm({ ...form, name: '', location: '', cost: '', maxCapacity: '' })
      setAdding(false)
      await load()
      toast.success('Club added — publish it when you\u2019re ready')
    } catch {
      toast.error('Failed to add club')
    }
  }

  const togglePublish = async (a: ProviderPortalActivity) => {
    try {
      await api.providerPortalAdmin.updateActivity(providerId, a.id, { isPublished: !a.isPublished })
      await load()
    } catch {
      toast.error('Failed to update')
    }
  }

  const remove = async (a: ProviderPortalActivity) => {
    if (!window.confirm(`Delete "${a.name}"? This cannot be undone.`)) return
    try {
      await api.providerPortalAdmin.deleteActivity(providerId, a.id)
      await load()
    } catch {
      toast.error('Failed to delete — a club with bookings cannot be removed')
    }
  }

  if (!activities) return <p className="text-sm text-warm-text-tertiary">Loading…</p>

  return (
    <div className="space-y-3">
      {activities.length === 0 && !adding && (
        <p className="text-sm text-warm-text-tertiary">No clubs yet. Add the first one below.</p>
      )}

      <div className="space-y-1.5">
        {activities.map(a => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-warm border border-warm-border px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-warm-text-primary truncate">{a.name}</div>
              <div className="text-xs text-warm-text-tertiary truncate">
                {DAYS[a.dayOfWeek]} · {a.timeSlot === 'AFTER_SCHOOL' ? 'After school' : 'Before school'}
                {a.location ? ` · ${a.location}` : ''}
                {a.cost != null ? ` · ${a.cost}` : ''}
                {a.termName ? ` · ${a.termName}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => togglePublish(a)}
                className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                  a.isPublished ? 'bg-warm-green/15 text-warm-green' : 'bg-warm-border/60 text-warm-text-secondary'
                }`}
              >
                {a.isPublished ? 'Visible to parents' : 'Draft'}
              </button>
              <button onClick={() => remove(a)} className="p-1.5 rounded-warm text-warm-text-tertiary hover:text-warm-error" aria-label="Delete club">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <form onSubmit={create} className="space-y-3 rounded-warm border border-warm-border p-3">
          <Select label="Term" value={form.ecaTermId} onChange={v => setForm({ ...form, ecaTermId: v })}
            options={terms.map(t => ({ value: t.id, label: t.schoolName ? `${t.name} · ${t.schoolName}` : t.name }))} />
          <Field label="Club name" value={form.name} onChange={v => setForm({ ...form, name: v })} required />
          <div className="grid grid-cols-2 gap-2">
            <Select label="Day" value={String(form.dayOfWeek)} onChange={v => setForm({ ...form, dayOfWeek: Number(v) })}
              options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
            <Select label="When" value={form.timeSlot} onChange={v => setForm({ ...form, timeSlot: v })}
              options={[{ value: 'AFTER_SCHOOL', label: 'After school' }, { value: 'BEFORE_SCHOOL', label: 'Before school' }]} />
          </div>
          <Field label="Location" value={form.location} onChange={v => setForm({ ...form, location: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cost" type="number" value={form.cost} onChange={v => setForm({ ...form, cost: v })} />
            <Field label="Capacity" type="number" value={form.maxCapacity} onChange={v => setForm({ ...form, maxCapacity: v })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!form.ecaTermId} className="rounded-warm-btn bg-brand text-white font-semibold px-4 py-2 text-sm disabled:opacity-60">Add club</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-warm-btn border border-warm-border px-4 py-2 text-sm">Cancel</button>
          </div>
          {terms.length === 0 && (
            <p className="text-xs text-warm-error">No open ECA term for this provider's schools — create one first under ECA.</p>
          )}
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-semibold text-brand">
          <Plus className="h-4 w-4" /> Add a club
        </button>
      )}
    </div>
  )
}

// ─── Menus: weekly catering menus ────────────────────────────────────────────
function ProviderMenusTab({ providerId }: { providerId: string }) {
  const toast = useToast()
  const [menus, setMenus] = useState<ProviderPortalMenu[] | null>(null)
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ schoolId: '', weekOf: '', title: '' })

  const load = () =>
    Promise.all([api.providerPortalAdmin.menus(providerId), api.providerPortalAdmin.profile(providerId)])
      .then(([m, p]) => {
        setMenus(m)
        setSchools(p.provider.schools.map(s => ({ id: s.id, name: s.name })))
        setForm(f => ({ ...f, schoolId: f.schoolId || p.provider.schools[0]?.id || '' }))
      })
      .catch(() => toast.error('Failed to load menus'))
  useEffect(() => { load() }, [providerId])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.providerPortalAdmin.createMenu(providerId, {
        schoolId: form.schoolId,
        weekOf: form.weekOf,
        title: form.title.trim() || null,
      })
      setForm({ ...form, weekOf: '', title: '' })
      setAdding(false)
      await load()
      toast.success('Menu created')
    } catch {
      toast.error('Failed to create menu')
    }
  }

  const togglePublish = async (m: ProviderPortalMenu) => {
    try {
      await api.providerPortalAdmin.updateMenu(providerId, m.id, { isPublished: !m.isPublished })
      await load()
    } catch {
      toast.error('Failed to update')
    }
  }

  const remove = async (m: ProviderPortalMenu) => {
    if (!window.confirm('Delete this menu? This cannot be undone.')) return
    try {
      await api.providerPortalAdmin.deleteMenu(providerId, m.id)
      await load()
    } catch {
      toast.error('Failed to delete')
    }
  }

  if (!menus) return <p className="text-sm text-warm-text-tertiary">Loading…</p>

  return (
    <div className="space-y-3">
      {menus.length === 0 && !adding && (
        <p className="text-sm text-warm-text-tertiary">No menus yet. Add a week below.</p>
      )}

      <div className="space-y-1.5">
        {menus.map(m => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-warm border border-warm-border px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-warm-text-primary truncate">{m.title || `Week of ${m.weekOf}`}</div>
              <div className="text-xs text-warm-text-tertiary">
                Week of {m.weekOf}{m.items?.length ? ` · ${m.items.length} items` : ' · no items yet'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => togglePublish(m)}
                className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                  m.isPublished ? 'bg-warm-green/15 text-warm-green' : 'bg-warm-border/60 text-warm-text-secondary'
                }`}
              >
                {m.isPublished ? 'Visible to parents' : 'Draft'}
              </button>
              <button onClick={() => remove(m)} className="p-1.5 rounded-warm text-warm-text-tertiary hover:text-warm-error" aria-label="Delete menu">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <form onSubmit={create} className="space-y-3 rounded-warm border border-warm-border p-3">
          <Select label="School" value={form.schoolId} onChange={v => setForm({ ...form, schoolId: v })}
            options={schools.map(s => ({ value: s.id, label: s.name }))} />
          <Field label="Week beginning (Monday)" type="date" value={form.weekOf} onChange={v => setForm({ ...form, weekOf: v })} required />
          <Field label="Title (optional)" value={form.title} onChange={v => setForm({ ...form, title: v })} />
          <div className="flex gap-2">
            <button type="submit" disabled={!form.schoolId} className="rounded-warm-btn bg-brand text-white font-semibold px-4 py-2 text-sm disabled:opacity-60">Create menu</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-warm-btn border border-warm-border px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-semibold text-brand">
          <Plus className="h-4 w-4" /> Add a menu week
        </button>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-warm-text-secondary">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </label>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-warm-text-secondary">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-warm-btn border border-warm-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
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
