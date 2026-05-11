import React, { useState, useMemo } from 'react'
import { Plus, X, Pencil, Trash2, Calendar, Database, ChevronDown } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type { TermDate, TermDateType } from '@wasil/shared'

interface TermDateForm {
  term: number
  termName: string
  label: string
  sublabel: string
  date: string
  endDate: string
  type: TermDateType
  color: string
  academicYear: string
}

// Auto-assign color based on type
const typeConfig: Record<string, { label: string; color: string; badge: string }> = {
  'term-start': { label: 'Term Start', color: 'green', badge: 'bg-green-100 text-green-700' },
  'term-end': { label: 'Term End', color: 'red', badge: 'bg-red-100 text-red-700' },
  'half-term': { label: 'Half Term / Break', color: 'blue', badge: 'bg-blue-100 text-blue-700' },
  'public-holiday': { label: 'Public Holiday', color: 'amber', badge: 'bg-amber-100 text-amber-700' },
  'induction': { label: 'Induction / Orientation', color: 'purple', badge: 'bg-purple-100 text-purple-700' },
}

const colorDot: Record<string, string> = {
  green: 'bg-green-500', red: 'bg-red-500', blue: 'bg-blue-500',
  amber: 'bg-amber-500', purple: 'bg-purple-500', gray: 'bg-gray-500',
}

// Generate academic year options (current year ± 2)
function getAcademicYearOptions(): string[] {
  const now = new Date()
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return Array.from({ length: 5 }, (_, i) => {
    const y = year - 1 + i
    return `${y}-${String(y + 1).slice(2)}`
  })
}

function getCurrentAcademicYear(): string {
  const now = new Date()
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${String(year + 1).slice(2)}`
}

// Auto-generate term name from term number
function getDefaultTermName(term: number): string {
  return `Term ${term}`
}

const emptyForm: TermDateForm = {
  term: 1,
  termName: 'Term 1',
  label: '',
  sublabel: '',
  date: '',
  endDate: '',
  type: 'term-start',
  color: 'green',
  academicYear: getCurrentAcademicYear(),
}

export function TermDatesPage() {
  const theme = useTheme()
  const toast = useToast()
  const { data: termDates, refetch } = useApi<TermDate[]>(() => api.termDates.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<TermDateForm>(emptyForm)
  const [editingDate, setEditingDate] = useState<TermDate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TermDate | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [filterYear, setFilterYear] = useState<string>(getCurrentAcademicYear())

  const academicYears = getAcademicYearOptions()

  const handleSeed = async () => {
    if (!confirm('This will add UAE 2025-2026 demo term dates. Continue?')) return
    setIsSeeding(true)
    try {
      await api.termDates.seed()
      refetch()
      toast.success('Demo term dates added')
    } catch {
      toast.error('Failed to seed term dates')
    } finally {
      setIsSeeding(false)
    }
  }

  const updateType = (type: TermDateType) => {
    setForm(f => ({ ...f, type, color: typeConfig[type]?.color || 'gray' }))
  }

  const updateTerm = (term: number) => {
    setForm(f => ({ ...f, term, termName: getDefaultTermName(term) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.label || !form.date) {
      toast.warning('Please fill in the label and date')
      return
    }
    setIsSubmitting(true)
    try {
      const payload = {
        term: form.term,
        termName: form.termName,
        label: form.label,
        sublabel: form.sublabel || undefined,
        date: form.date,
        endDate: form.endDate || undefined,
        type: form.type,
        color: form.color,
        academicYear: form.academicYear || undefined,
      }
      if (editingDate) {
        await api.termDates.update(editingDate.id, payload)
        toast.success('Term date updated')
      } else {
        await api.termDates.create(payload)
        toast.success('Term date created')
      }
      setShowForm(false)
      setEditingDate(null)
      setForm({ ...emptyForm, academicYear: filterYear })
      refetch()
    } catch {
      toast.error('Failed to save term date')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (td: TermDate) => {
    setEditingDate(td)
    setForm({
      term: td.term,
      termName: td.termName,
      label: td.label,
      sublabel: td.sublabel || '',
      date: td.date.split('T')[0],
      endDate: td.endDate ? td.endDate.split('T')[0] : '',
      type: td.type as TermDateType,
      color: td.color,
      academicYear: (td as any).academicYear || getCurrentAcademicYear(),
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingDate(null)
    setForm({ ...emptyForm, academicYear: filterYear })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.termDates.delete(deleteTarget.id)
      setDeleteTarget(null)
      refetch()
      toast.success('Term date deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  // Filter by academic year and group by term
  const filteredDates = useMemo(() => {
    return (termDates || []).filter(td => {
      if (!filterYear) return true
      const ay = (td as any).academicYear
      if (ay) return ay === filterYear
      // For old dates without academicYear, show all
      return true
    })
  }, [termDates, filterYear])

  const grouped = filteredDates.reduce<Record<number, TermDate[]>>((acc, td) => {
    if (!acc[td.term]) acc[td.term] = []
    acc[td.term].push(td)
    return acc
  }, {})

  const sortedTerms = Object.keys(grouped).map(Number).sort((a, b) => a - b)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Term Dates</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage your school calendar</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Academic Year Filter */}
          <div className="relative">
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              className="appearance-none px-3 py-2 pr-8 border border-slate-300 rounded-lg text-sm font-medium bg-white"
            >
              <option value="">All Years</option>
              {academicYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            {isSeeding ? 'Seeding...' : 'Demo Data'}
          </button>
          <button
            onClick={() => { setShowForm(true); setEditingDate(null); setForm({ ...emptyForm, academicYear: filterYear || getCurrentAcademicYear() }) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-4 h-4" />
            Add Date
          </button>
        </div>
      </div>

      {/* Simplified Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingDate ? 'Edit Term Date' : 'New Term Date'}
            </h3>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: What type of date is this? */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">What type of date?</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(typeConfig).map(([value, config]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateType(value as TermDateType)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      form.type === value
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Label + Term + Academic Year */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={form.type === 'public-holiday' ? 'e.g., National Day' : 'e.g., First day of term'}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Term</label>
                <select
                  value={form.term}
                  onChange={e => updateTerm(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>Term 1</option>
                  <option value={2}>Term 2</option>
                  <option value={3}>Term 3</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Academic Year</label>
                <select
                  value={form.academicYear}
                  onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {academicYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 3: Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {form.type === 'half-term' || form.type === 'public-holiday' ? 'Start Date' : 'Date'}
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              {(form.type === 'half-term' || form.type === 'public-holiday') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Optional sublabel */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.sublabel}
                onChange={e => setForm(f => ({ ...f, sublabel: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Students return at 8:00am"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={handleCancel} className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isSubmitting ? 'Saving...' : editingDate ? 'Update' : 'Add Term Date'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grouped List */}
      <div className="space-y-6">
        {sortedTerms.map(termNum => (
          <div key={termNum}>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Term {termNum} — {grouped[termNum][0]?.termName}
            </h3>
            <div className="space-y-2">
              {grouped[termNum].map(td => (
                <div key={td.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${colorDot[td.color] || 'bg-gray-500'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{td.label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeConfig[td.type]?.badge || 'bg-gray-100 text-gray-700'}`}>
                            {typeConfig[td.type]?.label || td.type}
                          </span>
                        </div>
                        {td.sublabel && <p className="text-xs text-slate-500 mt-0.5">{td.sublabel}</p>}
                        <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(td.date)}{td.endDate && ` — ${formatDate(td.endDate)}`}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(td)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(td)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filteredDates.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No term dates for {filterYear || 'any year'}. Click "Add Date" to get started.</p>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Delete Term Date"
          message={`Are you sure you want to delete "${deleteTarget.label}"?`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
