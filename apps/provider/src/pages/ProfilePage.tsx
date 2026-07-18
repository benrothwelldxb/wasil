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

      <LogoCard current={data.provider.logoUrl} onChanged={refreshMe} />
      <TwoFactorCard />
    </div>
  )
}

function LogoCard({ current, onChanged }: { current: string | null; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      const form = new FormData()
      form.append('logo', file)
      await apiFetch('/api/provider-portal/logo', { method: 'POST', body: form })
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="warm-card p-6 mt-6">
      <div className="font-bold text-warm-text-primary mb-3">Logo</div>
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-warm bg-slate-50 border border-warm-border flex items-center justify-center overflow-hidden flex-none">
          {current ? <img src={current} alt="Logo" className="h-full w-full object-cover" /> : <span className="text-xs text-warm-text-tertiary">None</span>}
        </div>
        <div>
          <label className="inline-flex items-center gap-2 rounded-warm-btn border border-warm-border px-4 py-2 text-sm font-semibold text-warm-text-primary cursor-pointer hover:bg-slate-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Uploading…' : current ? 'Change logo' : 'Upload logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }}
            />
          </label>
          <p className="text-xs text-warm-text-tertiary mt-1.5">PNG, JPG or WebP, up to 3&nbsp;MB.</p>
          {error && <p className="text-xs text-warm-error mt-1">{error}</p>}
        </div>
      </div>
    </div>
  )
}

interface Status2FA { enabled: boolean; setupAt: string | null }
interface Setup2FA { qrCode: string; secret: string; recoveryCodes: string[] }

function TwoFactorCard() {
  const [status, setStatus] = useState<Status2FA | null>(null)
  const [setup, setSetup] = useState<Setup2FA | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disabling, setDisabling] = useState(false)

  const load = () => apiFetch<Status2FA>('/provider/auth/2fa/status').then(setStatus).catch(() => setStatus(null))
  useEffect(() => { void load() }, [])

  const startSetup = async () => {
    setError(null); setBusy(true)
    try { setSetup(await apiFetch<Setup2FA>('/provider/auth/2fa/setup', { method: 'POST' })) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Failed to start setup.') }
    finally { setBusy(false) }
  }

  const confirm = async () => {
    setError(null); setBusy(true)
    try {
      await apiFetch('/provider/auth/2fa/confirm-setup', { method: 'POST', body: JSON.stringify({ code: code.trim() }) })
      setSetup(null); setCode(''); await load()
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Invalid code.') }
    finally { setBusy(false) }
  }

  const disable = async () => {
    setError(null); setBusy(true)
    try {
      await apiFetch('/provider/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code: code.trim() }) })
      setDisabling(false); setCode(''); await load()
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Invalid code.') }
    finally { setBusy(false) }
  }

  if (!status) return null

  return (
    <div className="warm-card p-6 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-warm-text-primary">Two-factor authentication</div>
          <p className="text-sm text-warm-text-secondary mt-0.5">
            {status.enabled ? 'Enabled — required at every sign-in.' : 'Add a second step to protect your account.'}
          </p>
        </div>
        {!status.enabled && !setup && (
          <button onClick={startSetup} disabled={busy} className="rounded-warm-btn bg-brand text-white font-semibold px-4 py-2 text-sm disabled:opacity-60">Enable</button>
        )}
        {status.enabled && !disabling && (
          <button onClick={() => setDisabling(true)} className="rounded-warm-btn border border-warm-border px-4 py-2 text-sm font-semibold text-warm-text-secondary hover:bg-slate-50">Disable</button>
        )}
      </div>

      {error && <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5 mt-3">{error}</div>}

      {setup && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-warm-text-secondary">Scan this with your authenticator app, then enter the 6-digit code to confirm.</p>
          <img src={setup.qrCode} alt="2FA QR code" className="h-40 w-40 border border-warm-border rounded-warm" />
          <div className="text-xs text-warm-text-tertiary">Or enter this key manually: <code className="bg-slate-50 px-1.5 py-0.5 rounded">{setup.secret}</code></div>
          <div className="rounded-warm bg-warm-amber/10 border border-warm-amber/30 p-3">
            <div className="text-xs font-bold text-warm-text-primary mb-1">Save your recovery codes</div>
            <div className="grid grid-cols-2 gap-1 text-xs font-mono text-warm-text-secondary">
              {setup.recoveryCodes.map(c => <span key={c}>{c}</span>)}
            </div>
          </div>
          <div className="flex gap-2">
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" inputMode="numeric" className="flex-1 rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
            <button onClick={confirm} disabled={busy} className="rounded-warm-btn bg-brand text-white font-semibold px-4 py-2 text-sm disabled:opacity-60">Confirm</button>
          </div>
        </div>
      )}

      {disabling && (
        <div className="mt-4 flex gap-2">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Enter a current code to disable" inputMode="numeric" className="flex-1 rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
          <button onClick={disable} disabled={busy} className="rounded-warm-btn bg-warm-error text-white font-semibold px-4 py-2 text-sm disabled:opacity-60">Disable</button>
          <button onClick={() => { setDisabling(false); setCode(''); setError(null) }} className="rounded-warm-btn px-3 py-2 text-sm text-warm-text-secondary">Cancel</button>
        </div>
      )}
    </div>
  )
}
