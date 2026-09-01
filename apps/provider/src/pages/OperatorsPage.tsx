import { useEffect, useState, type FormEvent } from 'react'
import { Building2, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'
import { apiFetch, ApiError } from '../api'

/**
 * Club operators — the companies whose clubs this partner organises.
 *
 * A partner like Infinite Sports handles the bookings and the money, but the
 * clubs themselves are run by other companies, and it is that brand a parent
 * recognises on the card. An operator is a name and a logo, nothing more: no
 * login, no school link, no portal session of its own.
 *
 * Kept as its own record rather than fields on each club because activities are
 * per term — a club running three terms a year would otherwise mean uploading
 * the same logo three times and watching the versions drift.
 */

interface Operator {
  id: string
  name: string
  logoUrl: string | null
  clubCount: number
}

export function OperatorsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [operators, setOperators] = useState<Operator[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setError(null)
    try {
      setOperators(await apiFetch<Operator[]>('/api/provider-portal/operators'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load operators.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await apiFetch('/api/provider-portal/operators', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      })
      setNewName('')
      setAdding(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add operator.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (o: Operator) => {
    if (!window.confirm(`Remove "${o.name}"?`)) return
    setError(null)
    try {
      await apiFetch(`/api/provider-portal/operators/${o.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove operator.')
    }
  }

  const inputClass =
    'w-full rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-warm-text-tertiary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-extrabold text-warm-text-primary">Club operators</h1>
      <p className="text-sm text-warm-text-secondary mt-1 mb-6">
        The companies whose clubs you organise. Parents see the operator's name and logo on the
        club; you are credited underneath as the one they book through.
      </p>

      {error && (
        <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5 mb-4">
          {error}
        </div>
      )}

      {operators.length === 0 && !adding && (
        <div className="rounded-warm border border-dashed border-warm-border px-4 py-8 text-center">
          <Building2 className="h-6 w-6 mx-auto text-warm-text-tertiary mb-2" />
          <p className="text-sm text-warm-text-secondary">
            No operators yet. Add the companies that run your clubs.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {operators.map(o => (
          <OperatorRow key={o.id} operator={o} onChanged={load} onRemove={() => remove(o)} />
        ))}
      </div>

      {adding ? (
        <form onSubmit={create} className="mt-3 rounded-warm border border-warm-border p-3 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">
              Company name
            </label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className={inputClass}
              placeholder="e.g. 3-52 Football"
              required
              autoFocus
            />
            <p className="text-xs text-warm-text-tertiary mt-1">
              Add the logo once it exists — you can create the operator now and upload after.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="rounded-warm-btn bg-brand text-white font-semibold px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? 'Adding…' : 'Add operator'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setNewName('') }}
              className="rounded-warm-btn border border-warm-border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand"
        >
          <Plus className="h-4 w-4" /> Add an operator
        </button>
      )}
    </div>
  )
}

function OperatorRow({
  operator,
  onChanged,
  onRemove,
}: {
  operator: Operator
  onChanged: () => Promise<void>
  onRemove: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      const form = new FormData()
      form.append('logo', file)
      await apiFetch(`/api/provider-portal/operators/${operator.id}/logo`, {
        method: 'POST',
        body: form,
      })
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload logo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-warm border border-warm-border px-3 py-3">
      <div className="flex items-center gap-3">
        {operator.logoUrl ? (
          <img
            src={operator.logoUrl}
            alt=""
            className="h-11 w-11 rounded-warm-btn object-cover border border-warm-border flex-none"
          />
        ) : (
          <div className="h-11 w-11 rounded-warm-btn bg-slate-100 flex items-center justify-center flex-none">
            <Building2 className="h-5 w-5 text-warm-text-tertiary" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-warm-text-primary truncate">{operator.name}</div>
          <div className="text-xs text-warm-text-tertiary">
            {operator.clubCount === 0
              ? 'No clubs yet'
              : `${operator.clubCount} club${operator.clubCount === 1 ? '' : 's'}`}
            {!operator.logoUrl && ' · no logo yet'}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-none">
          <label
            className={`flex items-center gap-1.5 rounded-warm-btn border border-warm-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer hover:bg-slate-50 ${
              busy ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {operator.logoUrl ? 'Replace' : 'Add logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void upload(file)
                e.target.value = ''
              }}
            />
          </label>
          <button
            onClick={onRemove}
            aria-label={`Remove ${operator.name}`}
            className="p-2 rounded-warm text-warm-text-tertiary hover:text-warm-error hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-warm-error mt-2">{error}</p>}
    </div>
  )
}
