import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { apiFetch, ApiError } from '../api'
import { useProviderAuth } from '../auth'

interface ProfileResponse {
  provider: {
    id: string
    name: string
    type: string
    status: string
    logoUrl: string | null
    contactEmail: string | null
    contactPhone: string | null
    schools: Array<{ id: string; name: string; shortName: string | null }>
  }
  me: { id: string; name: string; email: string; lastLoginAt: string | null }
}

export function ProfilePage() {
  const { refreshMe } = useProviderAuth()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<ProfileResponse | null>(null)

  const [providerName, setProviderName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    let active = true
    apiFetch<ProfileResponse>('/api/provider-portal/profile')
      .then(res => {
        if (!active) return
        setData(res)
        setProviderName(res.provider.name)
        setDisplayName(res.me.name)
        setContactEmail(res.provider.contactEmail || '')
        setContactPhone(res.provider.contactPhone || '')
      })
      .catch(err => {
        if (active) setLoadError(err instanceof ApiError ? err.message : 'Failed to load your profile.')
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus(null)
    setSaving(true)
    try {
      await apiFetch('/api/provider-portal/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          providerName: providerName.trim(),
          displayName: displayName.trim(),
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
        }),
      })
      setStatus({ kind: 'ok', msg: 'Profile saved.' })
      await refreshMe()
    } catch (err) {
      setStatus({ kind: 'error', msg: err instanceof ApiError ? err.message : 'Failed to save. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-warm-text-tertiary" />
      </div>
    )
  }

  if (loadError || !data) {
    return (
      <div className="warm-card p-6">
        <p className="text-sm text-warm-error">{loadError || 'Profile unavailable.'}</p>
      </div>
    )
  }

  const inputClass =
    'w-full rounded-warm-btn border border-warm-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-extrabold text-warm-text-primary">Profile</h1>
      <p className="text-warm-text-secondary mt-1">Your provider details and how you appear to the school.</p>

      <form onSubmit={handleSubmit} className="warm-card p-6 mt-6 space-y-4">
        {status && (
          <div
            className={`rounded-warm text-sm px-3 py-2.5 border ${
              status.kind === 'ok'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}
          >
            {status.msg}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Provider name</label>
          <input value={providerName} onChange={e => setProviderName(e.target.value)} className={inputClass} required />
        </div>

        <div>
          <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Your name</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputClass} required />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Contact email</label>
            <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Contact phone</label>
            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <div className="text-xs text-warm-text-tertiary">
            {data.provider.schools.length > 0 && <>School: {data.provider.schools.map(s => s.name).join(', ')}</>}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-warm-btn bg-brand text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-60 transition-opacity"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
