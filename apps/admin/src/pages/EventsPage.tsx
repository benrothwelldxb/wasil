import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, Calendar, Clock, MapPin, Upload, CheckCircle } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { Event, Class, YearGroup } from '@wasil/shared'

interface EventForm {
  title: string
  description: string
  date: string
  time: string
  location: string
  targetClass: string
  classId: string
  yearGroupId: string
  requiresRsvp: boolean
}

const emptyForm: EventForm = {
  title: '',
  description: '',
  date: '',
  time: '',
  location: '',
  targetClass: 'all',
  classId: '',
  yearGroupId: '',
  requiresRsvp: false,
}

interface CsvRow {
  title: string
  description: string
  date: string
  time: string
  location: string
  targetClass: string
  requiresRsvp: boolean
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }
  result.push(current.trim())
  return result
}

export function EventsPage() {
  const theme = useTheme()
  const { data: events, refetch: refetchEvents } = useApi<Event[]>(() => api.events.listAll(), [])
  const { data: yearGroups } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<EventForm>(emptyForm)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // CSV state
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [csvData, setCsvData] = useState<CsvRow[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvImportResult, setCsvImportResult] = useState<{ success: number; failed: number } | null>(null)

  const audienceOptions = [
    { value: 'all', label: 'All Parents', classId: '', yearGroupId: '' },
    ...(yearGroups || []).map((yg) => ({
      value: `year-${yg.id}`,
      label: yg.name,
      classId: '',
      yearGroupId: yg.id,
    })),
    ...(classes || []).map((c) => ({
      value: `class-${c.id}`,
      label: c.name,
      classId: c.id,
      yearGroupId: '',
    })),
  ]

  const handleAudienceChange = (value: string) => {
    const option = audienceOptions.find((o) => o.value === value)
    if (option) {
      setForm((f) => ({
        ...f,
        targetClass: value === 'all' ? 'all' : option.label,
        classId: option.classId,
        yearGroupId: option.yearGroupId,
      }))
    }
  }

  const getAudienceValue = () => {
    if (form.targetClass === 'all') return 'all'
    if (form.classId) return `class-${form.classId}`
    if (form.yearGroupId) return `year-${form.yearGroupId}`
    return 'all'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        date: form.date,
        time: form.time || undefined,
        location: form.location || undefined,
        targetClass: form.targetClass,
        classId: form.classId || undefined,
        yearGroupId: form.yearGroupId || undefined,
        requiresRsvp: form.requiresRsvp,
      }
      if (editingEvent) {
        await api.events.update(editingEvent.id, payload)
      } else {
        await api.events.create(payload)
      }
      setShowForm(false)
      setEditingEvent(null)
      setForm(emptyForm)
      refetchEvents()
    } catch (err) {
      console.error('Failed to save event:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (event: Event) => {
    setEditingEvent(event)
    setForm({
      title: event.title,
      description: event.description || '',
      date: event.date.split('T')[0],
      time: event.time || '',
      location: event.location || '',
      targetClass: event.targetClass,
      classId: event.classId || '',
      yearGroupId: event.yearGroupId || '',
      requiresRsvp: event.requiresRsvp,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingEvent(null)
    setForm(emptyForm)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.events.delete(deleteTarget.id)
      setDeleteTarget(null)
      refetchEvents()
    } catch (err) {
      console.error('Failed to delete event:', err)
    }
  }

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvFileName(file.name)
    setCsvImportResult(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      const lines = text.split('\n').filter((l) => l.trim())
      if (lines.length < 2) return

      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim())
      const rows: CsvRow[] = []

      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i])
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => {
          row[h] = values[idx] || ''
        })
        rows.push({
          title: row['title'] || '',
          description: row['description'] || '',
          date: row['date'] || '',
          time: row['time'] || '',
          location: row['location'] || '',
          targetClass: row['targetclass'] || row['target_class'] || row['audience'] || 'all',
          requiresRsvp: ['true', 'yes', '1'].includes((row['requiresrsvp'] || row['requires_rsvp'] || row['rsvp'] || '').toLowerCase()),
        })
      }

      setCsvData(rows)
      setShowCsvModal(true)
    }
    reader.readAsText(file)

    // Reset input
    e.target.value = ''
  }

  const handleCsvImport = async () => {
    setCsvImporting(true)
    let success = 0
    let failed = 0

    for (const row of csvData) {
      try {
        await api.events.create({
          title: row.title,
          description: row.description || undefined,
          date: row.date,
          time: row.time || undefined,
          location: row.location || undefined,
          targetClass: row.targetClass,
          requiresRsvp: row.requiresRsvp,
        })
        success++
      } catch {
        failed++
      }
    }

    setCsvImporting(false)
    setCsvImportResult({ success, failed })
    refetchEvents()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Events</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer text-sm font-medium">
            <Upload className="w-4 h-4" />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
          </label>
          <button
            onClick={() => { setShowForm(true); setEditingEvent(null); setForm(emptyForm) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-4 h-4" />
            New Event
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingEvent ? 'Edit Event' : 'New Event'}
            </h3>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Audience</label>
              <select
                value={getAudienceValue()}
                onChange={(e) => handleAudienceChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {audienceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requiresRsvp"
                checked={form.requiresRsvp}
                onChange={(e) => setForm((f) => ({ ...f, requiresRsvp: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <label htmlFor="requiresRsvp" className="text-sm text-slate-700">
                Requires RSVP
              </label>
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
                {isSubmitting ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Event List */}
      <div className="space-y-3">
        {(events || []).map((event) => (
          <div
            key={event.id}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">{event.title}</h3>
                {event.description && (
                  <p className="text-sm text-slate-600 mt-1">{event.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(event.date).toLocaleDateString()}
                  </span>
                  {event.time && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {event.time}
                    </span>
                  )}
                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {event.location}
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
                    {event.targetClass === 'all' ? 'All Parents' : event.targetClass}
                  </span>
                  {event.requiresRsvp && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3.5 h-3.5" />
                      RSVP
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => handleEdit(event)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(event)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {events && events.length === 0 && (
          <p className="text-center text-slate-400 py-8">No events yet.</p>
        )}
      </div>

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full shadow-xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Import Events from CSV</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {csvFileName} - {csvData.length} event{csvData.length !== 1 ? 's' : ''} found
                </p>
              </div>
              <button
                onClick={() => { setShowCsvModal(false); setCsvData([]); setCsvImportResult(null) }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {csvImportResult ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-slate-900">Import Complete</p>
                  <p className="text-sm text-slate-600 mt-2">
                    {csvImportResult.success} imported successfully
                    {csvImportResult.failed > 0 && `, ${csvImportResult.failed} failed`}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Title</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Date</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Time</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Location</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Audience</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">RSVP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="py-2 px-3 text-slate-900">{row.title}</td>
                          <td className="py-2 px-3 text-slate-600">{row.date}</td>
                          <td className="py-2 px-3 text-slate-600">{row.time || '-'}</td>
                          <td className="py-2 px-3 text-slate-600">{row.location || '-'}</td>
                          <td className="py-2 px-3 text-slate-600">{row.targetClass}</td>
                          <td className="py-2 px-3 text-slate-600">{row.requiresRsvp ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
              {csvImportResult ? (
                <button
                  onClick={() => { setShowCsvModal(false); setCsvData([]); setCsvImportResult(null) }}
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setShowCsvModal(false); setCsvData([]) }}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCsvImport}
                    disabled={csvImporting || csvData.length === 0}
                    className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {csvImporting ? 'Importing...' : `Import ${csvData.length} Event${csvData.length !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Event"
          message={`Are you sure you want to delete "${deleteTarget.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
