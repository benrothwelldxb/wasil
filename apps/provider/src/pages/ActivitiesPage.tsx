import { useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { apiFetch, ApiError } from '../api'

interface Term {
  id: string
  name: string
  academicYear: string
  status: string
  schoolId: string
  schoolName: string
}
interface Activity {
  id: string
  name: string
  description: string | null
  dayOfWeek: number
  timeSlot: 'BEFORE_SCHOOL' | 'AFTER_SCHOOL'
  location: string | null
  maxCapacity: number | null
  cost: number | null
  costDescription: string | null
  paymentUrl: string | null
  isActive: boolean
  isCancelled: boolean
  ecaTermId: string
  termName?: string
  schoolName?: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SLOTS: Record<Activity['timeSlot'], string> = { BEFORE_SCHOOL: 'Before school', AFTER_SCHOOL: 'After school' }

interface FormState {
  id?: string
  ecaTermId: string
  name: string
  description: string
  dayOfWeek: number
  timeSlot: Activity['timeSlot']
  location: string
  maxCapacity: string
  cost: string
  costDescription: string
  paymentUrl: string
  eligibleGender: 'MIXED' | 'BOYS_ONLY' | 'GIRLS_ONLY'
}

const emptyForm = (ecaTermId = ''): FormState => ({
  ecaTermId,
  name: '',
  description: '',
  dayOfWeek: 1,
  timeSlot: 'AFTER_SCHOOL',
  location: '',
  maxCapacity: '',
  cost: '',
  costDescription: '',
  paymentUrl: '',
  eligibleGender: 'MIXED',
})

export function ActivitiesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [form, setForm] = useState<FormState | null>(null)

  const load = async () => {
    setError(null)
    try {
      const [acts, trms] = await Promise.all([
        apiFetch<Activity[]>('/api/provider-portal/activities'),
        apiFetch<Term[]>('/api/provider-portal/terms'),
      ])
      setActivities(acts)
      setTerms(trms)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load activities.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => setForm(emptyForm(terms[0]?.id || ''))
  const openEdit = (a: Activity) =>
    setForm({
      id: a.id,
      ecaTermId: a.ecaTermId,
      name: a.name,
      description: a.description || '',
      dayOfWeek: a.dayOfWeek,
      timeSlot: a.timeSlot,
      location: a.location || '',
      maxCapacity: a.maxCapacity != null ? String(a.maxCapacity) : '',
      cost: a.cost != null ? String(a.cost) : '',
      costDescription: a.costDescription || '',
      paymentUrl: a.paymentUrl || '',
      eligibleGender: 'MIXED',
    })

  const remove = async (a: Activity) => {
    if (!confirm(`Delete "${a.name}"? This cannot be undone.`)) return
    try {
      await apiFetch(`/api/provider-portal/activities/${a.id}`, { method: 'DELETE' })
      setActivities(prev => prev.filter(x => x.id !== a.id))
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete activity.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-warm-text-tertiary" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-warm-text-primary">Activities</h1>
          <p className="text-warm-text-secondary mt-1">Create and manage your clubs.</p>
        </div>
        <button
          onClick={openCreate}
          disabled={terms.length === 0}
          title={terms.length === 0 ? 'No term is open for activities yet' : undefined}
          className="flex items-center gap-2 rounded-warm-btn bg-brand text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New activity
        </button>
      </div>

      {error && <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5 mb-4">{error}</div>}

      {terms.length === 0 && (
        <div className="warm-card p-4 text-sm text-warm-text-secondary mb-4">
          No school term is currently open for new activities. Your school opens terms for enrolment — you'll be able to add clubs then.
        </div>
      )}

      {activities.length === 0 ? (
        <div className="warm-card p-10 text-center">
          <CalendarDays className="h-8 w-8 text-warm-text-tertiary mx-auto mb-3" />
          <p className="text-warm-text-secondary text-sm">No activities yet. Create your first club to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map(a => (
            <div key={a.id} className="warm-card p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-warm-text-primary">{a.name}</span>
                  {a.cost != null && a.cost > 0 && (
                    <span className="text-xs font-semibold bg-warm-amber/15 text-warm-amber px-2 py-0.5 rounded-full">
                      {a.costDescription || `${a.cost} AED`}
                    </span>
                  )}
                  {!a.isActive && <span className="text-xs bg-slate-100 text-warm-text-tertiary px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="text-sm text-warm-text-secondary mt-1">
                  {DAYS[a.dayOfWeek]} · {SLOTS[a.timeSlot]}
                  {a.location ? ` · ${a.location}` : ''}
                  {a.maxCapacity ? ` · ${a.maxCapacity} places` : ''}
                </div>
                <div className="text-xs text-warm-text-tertiary mt-1">
                  {a.termName}{a.schoolName ? ` · ${a.schoolName}` : ''}
                  {a.paymentUrl ? ' · payment link set' : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-none">
                <button onClick={() => openEdit(a)} aria-label="Edit" className="p-2 rounded-warm hover:bg-slate-50 text-warm-text-secondary">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(a)} aria-label="Delete" className="p-2 rounded-warm hover:bg-red-50 text-warm-error">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <ActivityForm
          form={form}
          terms={terms}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function ActivityForm({
  form,
  terms,
  onClose,
  onSaved,
}: {
  form: FormState
  terms: Term[]
  onClose: () => void
  onSaved: () => void
}) {
  const [state, setState] = useState<FormState>(form)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!state.id

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState(prev => ({ ...prev, [key]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const payload = {
      name: state.name.trim(),
      description: state.description.trim() || null,
      dayOfWeek: state.dayOfWeek,
      timeSlot: state.timeSlot,
      location: state.location.trim() || null,
      maxCapacity: state.maxCapacity ? Number(state.maxCapacity) : null,
      cost: state.cost ? Number(state.cost) : null,
      costDescription: state.costDescription.trim() || null,
      paymentUrl: state.paymentUrl.trim() || null,
      eligibleGender: state.eligibleGender,
    }
    try {
      if (isEdit) {
        await apiFetch(`/api/provider-portal/activities/${state.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      } else {
        await apiFetch('/api/provider-portal/activities', {
          method: 'POST',
          body: JSON.stringify({ ...payload, ecaTermId: state.ecaTermId }),
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save activity.')
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-warm w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <form onSubmit={submit} className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold text-warm-text-primary">{isEdit ? 'Edit activity' : 'New activity'}</h2>

          {error && <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5">{error}</div>}

          {!isEdit && (
            <div>
              <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Term</label>
              <select value={state.ecaTermId} onChange={e => set('ecaTermId', e.target.value)} className={inputClass} required>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>{t.schoolName} — {t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Name</label>
            <input value={state.name} onChange={e => set('name', e.target.value)} className={inputClass} required />
          </div>

          <div>
            <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Description</label>
            <textarea value={state.description} onChange={e => set('description', e.target.value)} className={inputClass} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Day</label>
              <select value={state.dayOfWeek} onChange={e => set('dayOfWeek', Number(e.target.value))} className={inputClass}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Time</label>
              <select value={state.timeSlot} onChange={e => set('timeSlot', e.target.value as FormState['timeSlot'])} className={inputClass}>
                <option value="BEFORE_SCHOOL">Before school</option>
                <option value="AFTER_SCHOOL">After school</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Location</label>
              <input value={state.location} onChange={e => set('location', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Capacity</label>
              <input type="number" min="1" value={state.maxCapacity} onChange={e => set('maxCapacity', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Cost (AED)</label>
              <input type="number" min="0" step="0.01" value={state.cost} onChange={e => set('cost', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Eligibility</label>
              <select value={state.eligibleGender} onChange={e => set('eligibleGender', e.target.value as FormState['eligibleGender'])} className={inputClass}>
                <option value="MIXED">Mixed</option>
                <option value="BOYS_ONLY">Boys only</option>
                <option value="GIRLS_ONLY">Girls only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Payment link</label>
            <input type="url" placeholder="https://…" value={state.paymentUrl} onChange={e => set('paymentUrl', e.target.value)} className={inputClass} />
            <p className="text-xs text-warm-text-tertiary mt-1">Where parents pay for this club. Wasil tracks the booking; payment happens on your link.</p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-warm-btn px-4 py-2.5 text-sm font-semibold text-warm-text-secondary hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-warm-btn bg-brand text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
