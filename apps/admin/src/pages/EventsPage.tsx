import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, Calendar, Clock, MapPin, CheckCircle, Copy, Repeat, Link2 } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { Event, Class, YearGroup } from '@wasil/shared'

type RecurrenceType = 'none' | 'weekly' | 'fortnightly' | 'monthly' | 'custom'

interface EventForm {
  title: string
  description: string
  date: string
  time: string
  location: string
  targetClassIds: string[]
  targetYearGroupIds: string[]
  requiresRsvp: boolean
  recurrence: RecurrenceType
  recurrenceEnd: string
  customIntervalDays: string
}

const emptyForm: EventForm = {
  title: '',
  description: '',
  date: '',
  time: '',
  location: '',
  targetClassIds: [],
  targetYearGroupIds: [],
  requiresRsvp: false,
  recurrence: 'none',
  recurrenceEnd: '',
  customIntervalDays: '14',
}

function generateRecurringDates(startDate: string, recurrence: RecurrenceType, endDate: string, customDays: number): string[] {
  if (recurrence === 'none' || !endDate) return [startDate]

  const dates: string[] = []
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const current = new Date(start)

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])

    if (recurrence === 'weekly') {
      current.setDate(current.getDate() + 7)
    } else if (recurrence === 'fortnightly') {
      current.setDate(current.getDate() + 14)
    } else if (recurrence === 'monthly') {
      current.setMonth(current.getMonth() + 1)
    } else if (recurrence === 'custom') {
      current.setDate(current.getDate() + customDays)
    }
  }

  return dates
}

// A Hub-synced event is read-only in Connect — it must be edited in Wasil Hub.
function isFromHub(event: Event): boolean {
  return event.source === 'hub' || !!event.hubCalendarEventId
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
  const [showSeriesDeleteChoice, setShowSeriesDeleteChoice] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const classNameById = (id: string) => classes?.find((c) => c.id === id)?.name || id
  const yearGroupNameById = (id: string) => yearGroups?.find((yg) => yg.id === id)?.name || id

  // Compact "1A, Year 3" style label for an event, from its multi-target list
  // (falling back to the legacy single targetClass string for older events).
  const eventAudienceLabel = (event: Event) => {
    if (event.targets && event.targets.length > 0) {
      const names = event.targets
        .map((t) => (t.classId ? classNameById(t.classId) : t.yearGroupId ? yearGroupNameById(t.yearGroupId) : null))
        .filter((n): n is string => !!n)
      if (names.length > 0) return names.join(', ')
    }
    if (event.targetClass === 'all' || event.targetClass === 'Whole School') return 'Whole School'
    return event.targetClass
  }

  const toggleClassTarget = (id: string) => {
    setForm((f) => ({
      ...f,
      targetClassIds: f.targetClassIds.includes(id)
        ? f.targetClassIds.filter((c) => c !== id)
        : [...f.targetClassIds, id],
    }))
  }

  const toggleYearGroupTarget = (id: string) => {
    setForm((f) => ({
      ...f,
      targetYearGroupIds: f.targetYearGroupIds.includes(id)
        ? f.targetYearGroupIds.filter((y) => y !== id)
        : [...f.targetYearGroupIds, id],
    }))
  }

  const buildTargetsPayload = () => {
    const targets = [
      ...form.targetYearGroupIds.map((yearGroupId) => ({ yearGroupId })),
      ...form.targetClassIds.map((classId) => ({ classId })),
    ]
    const targetClass =
      targets.length === 0
        ? 'Whole School'
        : [
            ...form.targetYearGroupIds.map(yearGroupNameById),
            ...form.targetClassIds.map(classNameById),
          ].join(', ')
    return { targets: targets.length > 0 ? targets : undefined, targetClass }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const { targets, targetClass } = buildTargetsPayload()
      const basePayload = {
        title: form.title,
        description: form.description || undefined,
        time: form.time || undefined,
        location: form.location || undefined,
        targetClass,
        targets,
        requiresRsvp: form.requiresRsvp,
      }

      if (editingEvent) {
        await api.events.update(editingEvent.id, { ...basePayload, date: form.date })
      } else {
        await api.events.create({
          ...basePayload,
          date: form.date,
          recurrence: form.recurrence !== 'none' ? form.recurrence : undefined,
          recurrenceEnd: form.recurrence !== 'none' ? form.recurrenceEnd || undefined : undefined,
          customIntervalDays: form.recurrence === 'custom' ? parseInt(form.customIntervalDays) || 14 : undefined,
        })
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

  // Derive the multi-select state for a form from an existing event, falling
  // back to the legacy singular classId/yearGroupId if targets isn't set.
  const targetIdsFromEvent = (event: Event) => {
    let targetClassIds = (event.targets || []).filter((t) => t.classId).map((t) => t.classId as string)
    let targetYearGroupIds = (event.targets || []).filter((t) => t.yearGroupId).map((t) => t.yearGroupId as string)
    if (targetClassIds.length === 0 && targetYearGroupIds.length === 0) {
      if (event.classId) targetClassIds = [event.classId]
      if (event.yearGroupId) targetYearGroupIds = [event.yearGroupId]
    }
    return { targetClassIds, targetYearGroupIds }
  }

  const handleEdit = (event: Event) => {
    if (isFromHub(event)) return // read-only, managed in Hub
    setEditingEvent(event)
    const { targetClassIds, targetYearGroupIds } = targetIdsFromEvent(event)
    setForm({
      title: event.title,
      description: event.description || '',
      date: event.date.split('T')[0],
      time: event.time || '',
      location: event.location || '',
      targetClassIds,
      targetYearGroupIds,
      requiresRsvp: event.requiresRsvp,
      recurrence: 'none',
      recurrenceEnd: '',
      customIntervalDays: '14',
    })
    setShowForm(true)
  }

  const handleDuplicate = (event: Event) => {
    setEditingEvent(null)
    const { targetClassIds, targetYearGroupIds } = targetIdsFromEvent(event)
    setForm({
      title: event.title,
      description: event.description || '',
      date: '', // leave blank so they pick a new date
      time: event.time || '',
      location: event.location || '',
      targetClassIds,
      targetYearGroupIds,
      requiresRsvp: event.requiresRsvp,
      recurrence: 'none',
      recurrenceEnd: '',
      customIntervalDays: '14',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingEvent(null)
    setForm(emptyForm)
  }

  const handleDeleteClick = (event: Event) => {
    if (isFromHub(event)) return // read-only, managed in Hub
    setDeleteTarget(event)
    if (event.recurrenceType) {
      setShowSeriesDeleteChoice(true)
    }
  }

  const handleDelete = async (series?: boolean) => {
    if (!deleteTarget) return
    try {
      await api.events.delete(deleteTarget.id, series)
      setDeleteTarget(null)
      setShowSeriesDeleteChoice(false)
      refetchEvents()
    } catch (err) {
      console.error('Failed to delete event:', err)
    }
  }

  const noAudienceSelected = form.targetClassIds.length === 0 && form.targetYearGroupIds.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Events</h2>
        <div className="flex items-center gap-2">
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
              <p className="text-xs text-slate-500 mb-2">
                Select one or more year groups / classes. Leave everything unchecked for Whole School.
              </p>
              <div className="grid grid-cols-2 gap-4 border border-slate-200 rounded-lg p-3 max-h-56 overflow-y-auto">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Year Groups</p>
                  <div className="space-y-1.5">
                    {(yearGroups || []).map((yg) => (
                      <label key={yg.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.targetYearGroupIds.includes(yg.id)}
                          onChange={() => toggleYearGroupTarget(yg.id)}
                          className="rounded border-slate-300"
                        />
                        {yg.name}
                      </label>
                    ))}
                    {yearGroups && yearGroups.length === 0 && (
                      <p className="text-xs text-slate-400">No year groups</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Classes</p>
                  <div className="space-y-1.5">
                    {(classes || []).map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.targetClassIds.includes(c.id)}
                          onChange={() => toggleClassTarget(c.id)}
                          className="rounded border-slate-300"
                        />
                        {c.name}
                      </label>
                    ))}
                    {classes && classes.length === 0 && (
                      <p className="text-xs text-slate-400">No classes</p>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                {noAudienceSelected
                  ? 'Audience: Whole School'
                  : `Audience: ${[...form.targetYearGroupIds.map(yearGroupNameById), ...form.targetClassIds.map(classNameById)].join(', ')}`}
              </p>
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

            {/* Recurrence (only for new events) */}
            {!editingEvent && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Repeat className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-medium text-slate-700">Repeat</label>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {([
                    ['none', 'No repeat'],
                    ['weekly', 'Weekly'],
                    ['fortnightly', 'Fortnightly'],
                    ['monthly', 'Monthly'],
                    ['custom', 'Custom'],
                  ] as [RecurrenceType, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, recurrence: value }))}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-center transition-colors"
                      style={
                        form.recurrence === value
                          ? { backgroundColor: theme.colors.brandColor, color: '#FFFFFF' }
                          : { backgroundColor: '#F1F5F9', color: '#64748B' }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {form.recurrence !== 'none' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Repeat until</label>
                      <input
                        type="date"
                        value={form.recurrenceEnd}
                        onChange={(e) => setForm(f => ({ ...f, recurrenceEnd: e.target.value }))}
                        min={form.date}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    {form.recurrence === 'custom' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Every X days</label>
                        <input
                          type="number"
                          value={form.customIntervalDays}
                          onChange={(e) => setForm(f => ({ ...f, customIntervalDays: e.target.value }))}
                          min="1"
                          max="365"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                    )}
                  </div>
                )}

                {form.recurrence !== 'none' && form.date && form.recurrenceEnd && (
                  <p className="text-xs text-slate-500">
                    This will create{' '}
                    <span className="font-semibold text-slate-700">
                      {generateRecurringDates(form.date, form.recurrence, form.recurrenceEnd, parseInt(form.customIntervalDays) || 14).length}
                    </span>{' '}
                    events
                  </p>
                )}
              </div>
            )}

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
                {isSubmitting ? 'Saving...' : editingEvent ? 'Update Event' : form.recurrence !== 'none' && form.recurrenceEnd ? `Create ${generateRecurringDates(form.date, form.recurrence, form.recurrenceEnd, parseInt(form.customIntervalDays) || 14).length} Events` : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Event List */}
      <div className="space-y-3">
        {(events || []).map((event) => {
          const fromHub = isFromHub(event)
          return (
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
                      {eventAudienceLabel(event)}
                    </span>
                    {event.requiresRsvp && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        RSVP
                      </span>
                    )}
                    {event.recurrenceType && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 rounded-full text-xs font-medium text-indigo-600">
                        <Repeat className="w-3 h-3" />
                        {event.recurrenceType.charAt(0).toUpperCase() + event.recurrenceType.slice(1)}
                      </span>
                    )}
                    {fromHub && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded-full text-xs font-medium text-blue-600">
                        <Link2 className="w-3 h-3" />
                        From Hub
                      </span>
                    )}
                  </div>
                  {fromHub && (
                    <p className="text-xs text-slate-400 italic mt-1.5">
                      Managed in Wasil Hub — edit or delete this event there.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => handleDuplicate(event)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                    title="Duplicate event"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {!fromHub && (
                    <>
                      <button
                        onClick={() => handleEdit(event)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit event"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(event)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {events && events.length === 0 && (
          <p className="text-center text-slate-400 py-8">No events yet.</p>
        )}
      </div>

      {/* Delete Confirmation — series choice */}
      {deleteTarget && showSeriesDeleteChoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full shadow-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Delete Recurring Event</h3>
            <p className="text-sm text-slate-600">
              "{deleteTarget.title}" is part of a recurring series. What would you like to delete?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDelete(false)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Delete this event only
              </button>
              <button
                onClick={() => handleDelete(true)}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                Delete entire series
              </button>
              <button
                onClick={() => { setDeleteTarget(null); setShowSeriesDeleteChoice(false) }}
                className="w-full px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation — single event */}
      {deleteTarget && !showSeriesDeleteChoice && (
        <ConfirmModal
          title="Delete Event"
          message={`Are you sure you want to delete "${deleteTarget.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => handleDelete(false)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
