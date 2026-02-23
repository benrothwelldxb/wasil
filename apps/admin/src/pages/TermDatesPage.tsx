import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, Calendar, Database } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
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
}

const emptyForm: TermDateForm = {
  term: 1,
  termName: '',
  label: '',
  sublabel: '',
  date: '',
  endDate: '',
  type: 'term-start',
  color: 'green',
}

const typeOptions: { value: TermDateType; label: string }[] = [
  { value: 'term-start', label: 'Term Start' },
  { value: 'term-end', label: 'Term End' },
  { value: 'half-term', label: 'Half Term' },
  { value: 'public-holiday', label: 'Public Holiday' },
  { value: 'induction', label: 'Induction' },
]

const colorOptions = ['green', 'red', 'blue', 'amber', 'purple', 'gray']

const colorClasses: Record<string, string> = {
  green: 'bg-green-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  purple: 'bg-purple-500',
  gray: 'bg-gray-500',
}

const typeBadgeClasses: Record<string, string> = {
  'term-start': 'bg-green-100 text-green-700',
  'term-end': 'bg-red-100 text-red-700',
  'half-term': 'bg-blue-100 text-blue-700',
  'public-holiday': 'bg-amber-100 text-amber-700',
  'induction': 'bg-purple-100 text-purple-700',
}

export function TermDatesPage() {
  const theme = useTheme()
  const { data: termDates, refetch } = useApi<TermDate[]>(() => api.termDates.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<TermDateForm>(emptyForm)
  const [editingDate, setEditingDate] = useState<TermDate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TermDate | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)

  const handleSeed = async () => {
    if (!confirm('This will replace all existing term dates with UAE 2025-2026 demo data. Continue?')) return
    setIsSeeding(true)
    try {
      await api.termDates.seed()
      refetch()
    } catch (err) {
      console.error('Failed to seed term dates:', err)
      alert('Failed to seed term dates')
    } finally {
      setIsSeeding(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      }
      if (editingDate) {
        await api.termDates.update(editingDate.id, payload)
      } else {
        await api.termDates.create(payload)
      }
      setShowForm(false)
      setEditingDate(null)
      setForm(emptyForm)
      refetch()
    } catch (err) {
      console.error('Failed to save term date:', err)
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
      type: td.type,
      color: td.color,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingDate(null)
    setForm(emptyForm)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.termDates.delete(deleteTarget.id)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      console.error('Failed to delete term date:', err)
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  // Group by term
  const grouped = (termDates || []).reduce<Record<number, TermDate[]>>((acc, td) => {
    if (!acc[td.term]) acc[td.term] = []
    acc[td.term].push(td)
    return acc
  }, {})

  const sortedTerms = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Term Dates</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            {isSeeding ? 'Seeding...' : 'Seed Demo Data'}
          </button>
          <button
            onClick={() => { setShowForm(true); setEditingDate(null); setForm(emptyForm) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-4 h-4" />
            New Term Date
          </button>
        </div>
      </div>

      {/* Form */}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Term</label>
                <select
                  value={form.term}
                  onChange={(e) => setForm((f) => ({ ...f, term: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>Term 1</option>
                  <option value={2}>Term 2</option>
                  <option value={3}>Term 3</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Term Name</label>
                <input
                  type="text"
                  value={form.termName}
                  onChange={(e) => setForm((f) => ({ ...f, termName: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sublabel</label>
              <input
                type="text"
                value={form.sublabel}
                onChange={(e) => setForm((f) => ({ ...f, sublabel: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TermDateType }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {typeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                <div className="flex items-center gap-2 mt-1">
                  {colorOptions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-full ${colorClasses[c]} ${
                        form.color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isSubmitting ? 'Saving...' : editingDate ? 'Update Term Date' : 'Create Term Date'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grouped List */}
      <div className="space-y-6">
        {sortedTerms.map((termNum) => (
          <div key={termNum}>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Term {termNum} — {grouped[termNum][0]?.termName}
            </h3>
            <div className="space-y-2">
              {grouped[termNum].map((td) => (
                <div
                  key={td.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${colorClasses[td.color] || 'bg-gray-500'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{td.label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeBadgeClasses[td.type] || 'bg-gray-100 text-gray-700'}`}>
                            {typeOptions.find((o) => o.value === td.type)?.label || td.type}
                          </span>
                        </div>
                        {td.sublabel && (
                          <p className="text-xs text-slate-500 mt-0.5">{td.sublabel}</p>
                        )}
                        <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {formatDate(td.date)}
                            {td.endDate && ` - ${formatDate(td.endDate)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(td)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(td)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {termDates && termDates.length === 0 && (
          <p className="text-center text-slate-400 py-8">No term dates yet.</p>
        )}
      </div>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Term Date"
          message={`Are you sure you want to delete "${deleteTarget.label}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
