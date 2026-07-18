import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Plus, Pencil, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { apiFetch, ApiError } from '../api'

interface MenuSummary {
  id: string
  weekOf: string
  title: string | null
  isPublished: boolean
  itemCount: number
  schoolId: string
  schoolName: string
}
interface MenuItem {
  dayOfWeek: number
  mealType: string
  name: string
  description: string | null
  price: number | null
  dietaryTags: string[]
  allergens: string[]
}
interface School { id: string; name: string; shortName: string | null }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MEALS = ['LUNCH', 'BREAKFAST', 'SNACK']

interface RowItem {
  dayOfWeek: number
  mealType: string
  name: string
  price: string
  dietaryTags: string
  allergens: string
}
const emptyRow = (): RowItem => ({ dayOfWeek: 1, mealType: 'LUNCH', name: '', price: '', dietaryTags: '', allergens: '' })

export function MenusPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menus, setMenus] = useState<MenuSummary[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [editorId, setEditorId] = useState<string | 'new' | null>(null)

  const load = async () => {
    setError(null)
    try {
      const [m, profile] = await Promise.all([
        apiFetch<MenuSummary[]>('/api/provider-portal/menus'),
        apiFetch<{ provider: { schools: School[] } }>('/api/provider-portal/profile'),
      ])
      setMenus(m)
      setSchools(profile.provider.schools)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load menus.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const remove = async (m: MenuSummary) => {
    if (!confirm(`Delete the menu for week of ${m.weekOf}?`)) return
    try {
      await apiFetch(`/api/provider-portal/menus/${m.id}`, { method: 'DELETE' })
      setMenus(prev => prev.filter(x => x.id !== m.id))
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete menu.')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-warm-text-tertiary" /></div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-warm-text-primary">Menus</h1>
          <p className="text-warm-text-secondary mt-1">Publish the weekly lunch menu for families.</p>
        </div>
        <button
          onClick={() => setEditorId('new')}
          disabled={schools.length === 0}
          className="flex items-center gap-2 rounded-warm-btn bg-brand text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New menu
        </button>
      </div>

      {error && <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5 mb-4">{error}</div>}

      {menus.length === 0 ? (
        <div className="warm-card p-10 text-center">
          <UtensilsCrossed className="h-8 w-8 text-warm-text-tertiary mx-auto mb-3" />
          <p className="text-warm-text-secondary text-sm">No menus yet. Create one for an upcoming week.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {menus.map(m => (
            <div key={m.id} className="warm-card p-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-warm-text-primary">{m.title || `Week of ${m.weekOf}`}</span>
                  {m.isPublished
                    ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Published</span>
                    : <span className="text-xs bg-slate-100 text-warm-text-tertiary px-2 py-0.5 rounded-full">Draft</span>}
                </div>
                <div className="text-sm text-warm-text-tertiary mt-1">Week of {m.weekOf} · {m.itemCount} item{m.itemCount === 1 ? '' : 's'} · {m.schoolName}</div>
              </div>
              <div className="flex items-center gap-1 flex-none">
                <button onClick={() => setEditorId(m.id)} aria-label="Edit" className="p-2 rounded-warm hover:bg-slate-50 text-warm-text-secondary"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(m)} aria-label="Delete" className="p-2 rounded-warm hover:bg-red-50 text-warm-error"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorId && (
        <MenuEditor
          menuId={editorId}
          schools={schools}
          onClose={() => setEditorId(null)}
          onSaved={() => { setEditorId(null); void load() }}
        />
      )}
    </div>
  )
}

function MenuEditor({ menuId, schools, onClose, onSaved }: { menuId: string | 'new'; schools: School[]; onClose: () => void; onSaved: () => void }) {
  const isNew = menuId === 'new'
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [schoolId, setSchoolId] = useState(schools[0]?.id || '')
  const [weekOf, setWeekOf] = useState('')
  const [title, setTitle] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [rows, setRows] = useState<RowItem[]>([emptyRow()])

  useEffect(() => {
    if (isNew) return
    apiFetch<{ weekOf: string; title: string | null; isPublished: boolean; items: MenuItem[] }>(`/api/provider-portal/menus/${menuId}`)
      .then(m => {
        setWeekOf(m.weekOf)
        setTitle(m.title || '')
        setIsPublished(m.isPublished)
        setRows(m.items.length ? m.items.map(it => ({
          dayOfWeek: it.dayOfWeek, mealType: it.mealType, name: it.name,
          price: it.price != null ? String(it.price) : '',
          dietaryTags: it.dietaryTags.join(', '), allergens: it.allergens.join(', '),
        })) : [emptyRow()])
      })
      .catch(() => setError('Failed to load menu.'))
      .finally(() => setLoading(false))
  }, [menuId, isNew])

  const setRow = (i: number, patch: Partial<RowItem>) => setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const toList = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const items = rows
      .filter(r => r.name.trim())
      .map(r => ({
        dayOfWeek: r.dayOfWeek,
        mealType: r.mealType,
        name: r.name.trim(),
        price: r.price ? Number(r.price) : null,
        dietaryTags: toList(r.dietaryTags),
        allergens: toList(r.allergens),
      }))
    try {
      if (isNew) {
        await apiFetch('/api/provider-portal/menus', {
          method: 'POST',
          body: JSON.stringify({ schoolId, weekOf, title: title.trim() || null, items }),
        })
      } else {
        await apiFetch(`/api/provider-portal/menus/${menuId}`, {
          method: 'PUT',
          body: JSON.stringify({ title: title.trim() || null, isPublished, items }),
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save menu.')
      setSaving(false)
    }
  }

  const input = 'w-full rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-warm w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-warm-text-tertiary" /></div>
        ) : (
          <form onSubmit={submit} className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-warm-text-primary">{isNew ? 'New menu' : 'Edit menu'}</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-warm hover:bg-slate-50 text-warm-text-secondary"><X className="h-5 w-5" /></button>
            </div>

            {error && <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              {isNew && schools.length > 1 && (
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">School</label>
                  <select value={schoolId} onChange={e => setSchoolId(e.target.value)} className={input}>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Week of (Monday)</label>
                <input type="date" value={weekOf} onChange={e => setWeekOf(e.target.value)} className={input} required disabled={!isNew} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-warm-text-primary mb-1.5">Title (optional)</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Week 3 Menu" className={input} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-warm-text-primary">Dishes</label>
                <button type="button" onClick={addRow} className="text-sm text-brand font-semibold flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add dish</button>
              </div>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-warm border border-warm-border p-3 space-y-2">
                    <div className="flex gap-2">
                      <select value={r.dayOfWeek} onChange={e => setRow(i, { dayOfWeek: Number(e.target.value) })} className={`${input} w-36`}>
                        {DAYS.map((d, di) => <option key={di} value={di}>{d}</option>)}
                      </select>
                      <select value={r.mealType} onChange={e => setRow(i, { mealType: e.target.value })} className={`${input} w-32`}>
                        {MEALS.map(m => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                      </select>
                      <input value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="Dish name" className={input} />
                      <input value={r.price} onChange={e => setRow(i, { price: e.target.value })} placeholder="AED" type="number" min="0" step="0.01" className={`${input} w-24`} />
                      <button type="button" onClick={() => removeRow(i)} aria-label="Remove" className="p-2 text-warm-error flex-none"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="flex gap-2">
                      <input value={r.dietaryTags} onChange={e => setRow(i, { dietaryTags: e.target.value })} placeholder="Dietary tags (halal, vegetarian…)" className={input} />
                      <input value={r.allergens} onChange={e => setRow(i, { allergens: e.target.value })} placeholder="Allergens (nuts, dairy…)" className={input} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!isNew && (
              <label className="flex items-center gap-2 text-sm font-semibold text-warm-text-primary">
                <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
                Published (visible to families)
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-warm-btn px-4 py-2.5 text-sm font-semibold text-warm-text-secondary hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-warm-btn bg-brand text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isNew ? 'Create menu' : 'Save menu'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
