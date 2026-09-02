import { useEffect, useRef, useState } from 'react'
import {
  Plus, Edit2, Trash2, Users, Check, Clock, RefreshCw, MoreHorizontal,
} from 'lucide-react'
import { useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type {
  SchoolService, SchoolServiceWithStats,
  ServiceStatus, RegistrationStatus, PaymentStatus, Class, YearGroup,
} from '@wasil/shared'

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const STATUS_LABELS: Record<ServiceStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  REGISTRATION_OPEN: 'Registration Open',
  REGISTRATION_CLOSED: 'Registration Closed',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
}

// Tinted pills (soft background + coloured text) like EcaPage's term badges —
// solid badges with white text shouted over everything else on the page.
const STATUS_PILL: Record<ServiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-warm-text-secondary',
  PUBLISHED: 'bg-blue-100 text-blue-700',
  REGISTRATION_OPEN: 'bg-green-100 text-green-700',
  REGISTRATION_CLOSED: 'bg-yellow-100 text-yellow-700',
  ACTIVE: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-slate-100 text-warm-text-tertiary',
}

// The lifecycle's forward move gets a filled button; reversals get an outline,
// so the natural next step always reads first.
const STATUS_TRANSITIONS: Record<ServiceStatus, { next: ServiceStatus; label: string; cls: string }[]> = {
  DRAFT: [{ next: 'PUBLISHED', label: 'Publish', cls: 'bg-warm-blue text-white' }],
  PUBLISHED: [
    { next: 'REGISTRATION_OPEN', label: 'Open Registration', cls: 'bg-warm-green text-white' },
    { next: 'DRAFT', label: 'Revert to Draft', cls: 'border border-warm-border text-warm-text-secondary hover:bg-slate-50' },
  ],
  REGISTRATION_OPEN: [{ next: 'REGISTRATION_CLOSED', label: 'Close Registration', cls: 'bg-yellow-600 text-white' }],
  REGISTRATION_CLOSED: [
    { next: 'ACTIVE', label: 'Mark Active', cls: 'bg-warm-green text-white' },
    { next: 'REGISTRATION_OPEN', label: 'Reopen Registration', cls: 'border border-warm-border text-warm-text-secondary hover:bg-slate-50' },
  ],
  ACTIVE: [{ next: 'ARCHIVED', label: 'Archive', cls: 'border border-warm-border text-warm-text-secondary hover:bg-slate-50' }],
  ARCHIVED: [],
}

const transitionBtn = (cls: string) =>
  `px-3 py-1.5 text-xs font-bold rounded-warm-btn whitespace-nowrap transition-colors ${cls}`

// Inline selects keep their coloured text so state still scans in the table.
const REG_STATUS_TEXT: Record<RegistrationStatus, string> = {
  PENDING: 'text-warm-text-secondary',
  CONFIRMED: 'text-green-700',
  WAITLISTED: 'text-yellow-700',
  CANCELLED: 'text-warm-error',
}
const PAYMENT_TEXT: Record<PaymentStatus, string> = {
  UNPAID: 'text-yellow-700',
  PAID: 'text-green-700',
  PARTIAL: 'text-yellow-700',
  WAIVED: 'text-warm-text-tertiary',
}

// Shared field recipe — same as ProvidersPage forms.
const inputCls = 'w-full rounded-warm-btn border border-warm-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30'
const labelCls = 'block text-sm font-semibold text-warm-text-primary mb-1.5'
const subLabelCls = 'block text-xs font-semibold text-warm-text-secondary mb-1'
const chipCls = (selected: boolean) =>
  `px-3 py-1.5 rounded-warm-btn text-xs font-semibold border transition-colors ${
    selected ? 'bg-brand text-white border-transparent' : 'border-warm-border text-warm-text-secondary hover:bg-slate-50'
  }`
const outlineBtn = 'flex items-center gap-2 rounded-warm-btn border border-warm-border px-3 py-2 text-sm font-semibold text-warm-text-secondary hover:bg-slate-50'
const thCls = 'text-left px-4 py-3 font-semibold text-warm-text-secondary'

function StatusPill({ status }: { status: ServiceStatus }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${STATUS_PILL[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function DayPills({ days }: { days?: string[] | null }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(days || []).map((d) => (
        <span key={d} className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-warm-text-secondary">
          {d.slice(0, 3)}
        </span>
      ))}
    </div>
  )
}

// Count plus a slim capacity bar so fullness reads at a glance —
// green while there's room, amber once full. No bar when unlimited.
function CapacityCell({ registered, capacity }: { registered: number; capacity?: number | null }) {
  return (
    <div className="inline-flex flex-col items-center">
      <div>
        <span className="font-bold text-warm-text-primary">{registered}</span>
        {capacity ? <span className="text-xs text-warm-text-tertiary"> / {capacity}</span> : null}
      </div>
      {capacity ? (
        <div className="mt-1 h-1 w-16 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full ${registered >= capacity ? 'bg-warm-amber' : 'bg-warm-green'}`}
            style={{ width: `${Math.min(100, Math.round((registered / capacity) * 100))}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

type ViewMode = 'list' | 'detail' | 'form'

interface FormState {
  name: string
  description: string
  details: string
  days: string[]
  startTime: string
  endTime: string
  costPerSession: string
  costPerWeek: string
  costPerTerm: string
  costDescription: string
  costIsFrom: boolean
  currency: string
  paymentMethod: string
  paymentUrl: string
  capacity: string
  eligibleClasses: string[]
  eligibleYears: string[]
  location: string
  collectionLocation: string
  staffName: string
  serviceStarts: string
  serviceEnds: string
  featuredOnDashboard: boolean
  /** YYYY-MM-DD, or '' for "until I switch it off". */
  featuredUntil: string
}

const emptyForm: FormState = {
  name: '', description: '', details: '', days: [],
  startTime: '07:00', endTime: '08:00',
  costPerSession: '', costPerWeek: '', costPerTerm: '', costDescription: '',
  costIsFrom: false, currency: 'AED', paymentMethod: '', paymentUrl: '',
  capacity: '', eligibleClasses: [], eligibleYears: [],
  location: '', collectionLocation: '', staffName: '', serviceStarts: '', serviceEnds: '',
  featuredOnDashboard: false, featuredUntil: '',
}

export function SchoolServicesPage() {
  const toast = useToast()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ ...emptyForm })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isConfirmingAll, setIsConfirmingAll] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Dismiss the row menu on any click outside it — otherwise it survives a
  // click meant for the row underneath.
  useEffect(() => {
    if (!openMenuId) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openMenuId])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const { data: services, refetch, isLoading } = useApi<SchoolService[]>(() => api.schoolServices.list(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])
  const { data: yearGroups } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])
  const [detail, setDetail] = useState<SchoolServiceWithStats | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const data = await api.schoolServices.get(id)
      setDetail(data)
    } catch (e) {
      console.error(e)
    } finally {
      setDetailLoading(false)
    }
  }

  const openDetail = (id: string) => {
    setSelectedId(id)
    setViewMode('detail')
    loadDetail(id)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setViewMode('form')
  }

  const openEdit = (service: SchoolService) => {
    setEditingId(service.id)
    setForm({
      name: service.name,
      description: service.description || '',
      details: service.details || '',
      days: service.days || [],
      startTime: service.startTime,
      endTime: service.endTime,
      costPerSession: service.costPerSession?.toString() || '',
      costPerWeek: service.costPerWeek?.toString() || '',
      costPerTerm: service.costPerTerm?.toString() || '',
      costDescription: service.costDescription || '',
      costIsFrom: service.costIsFrom || false,
      currency: service.currency || 'AED',
      paymentMethod: service.paymentMethod || '',
      paymentUrl: service.paymentUrl || '',
      capacity: service.capacity?.toString() || '',
      eligibleClasses: service.eligibleClasses || [],
      eligibleYears: service.eligibleYears || [],
      location: service.location || '',
      collectionLocation: service.collectionLocation || '',
      staffName: service.staffName || '',
      serviceStarts: service.serviceStarts || '',
      serviceEnds: service.serviceEnds || '',
      featuredOnDashboard: service.featuredOnDashboard === true,
      featuredUntil: service.featuredUntil ? service.featuredUntil.slice(0, 10) : '',
    })
    setViewMode('form')
  }

  const handleSave = async () => {
    if (!form.name || !form.startTime || !form.endTime || form.days.length === 0) return
    setIsSubmitting(true)
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        details: form.details || undefined,
        days: form.days,
        startTime: form.startTime,
        endTime: form.endTime,
        costPerSession: form.costPerSession ? parseFloat(form.costPerSession) : null,
        costPerWeek: form.costPerWeek ? parseFloat(form.costPerWeek) : null,
        costPerTerm: form.costPerTerm ? parseFloat(form.costPerTerm) : null,
        costDescription: form.costDescription || undefined,
        costIsFrom: form.costIsFrom,
        currency: form.currency,
        paymentMethod: form.paymentMethod || undefined,
        paymentUrl: form.paymentUrl || undefined,
        capacity: form.capacity ? parseInt(form.capacity) : null,
        eligibleClasses: form.eligibleClasses.length > 0 ? form.eligibleClasses : null,
        eligibleYears: form.eligibleYears.length > 0 ? form.eligibleYears : null,
        location: form.location || undefined,
        collectionLocation: form.collectionLocation || undefined,
        staffName: form.staffName || undefined,
        serviceStarts: form.serviceStarts || undefined,
        serviceEnds: form.serviceEnds || undefined,
        featuredOnDashboard: form.featuredOnDashboard,
        // Empty means "no end date" — send null, not undefined, so clearing it
        // actually clears it.
        featuredUntil: form.featuredUntil || null,
      }

      if (editingId) {
        await api.schoolServices.update(editingId, payload as any)
      } else {
        await api.schoolServices.create(payload as any)
      }
      refetch()
      setViewMode('list')
    } catch (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.schoolServices.delete(id)
      setShowDeleteConfirm(null)
      refetch()
    } catch (error) {
      toast.error(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleStatusChange = async (id: string, status: ServiceStatus) => {
    try {
      await api.schoolServices.updateStatus(id, status)
      refetch()
      if (selectedId === id) loadDetail(id)
      // Confirm what it became — a silent transition left you re-reading the
      // pill to check whether the click had registered.
      toast.success(`Now ${STATUS_LABELS[status].toLowerCase()}`)
    } catch (error) {
      toast.error(`Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRegStatusChange = async (regId: string, status: RegistrationStatus) => {
    try {
      await api.schoolServices.updateRegistrationStatus(regId, status)
      if (selectedId) loadDetail(selectedId)
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handlePaymentChange = async (regId: string, paymentStatus: PaymentStatus) => {
    try {
      await api.schoolServices.updatePaymentStatus(regId, paymentStatus)
      if (selectedId) loadDetail(selectedId)
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Confirming a full list is one action to the user, so it reports as one:
  // all requests go at once, partial failure is counted rather than swallowed,
  // and the button shows it's working. Previously these were awaited one by one
  // with no feedback — a long silent pause that could half-fail unnoticed.
  const confirmAllPending = async () => {
    if (!detail?.registrations || isConfirmingAll) return
    const pending = detail.registrations.filter((r) => r.status === 'PENDING')
    if (pending.length === 0) return

    setIsConfirmingAll(true)
    try {
      const results = await Promise.allSettled(
        pending.map((reg) => api.schoolServices.updateRegistrationStatus(reg.id, 'CONFIRMED')),
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed === 0) {
        toast.success(`Confirmed ${pending.length} registration${pending.length === 1 ? '' : 's'}`)
      } else if (failed === pending.length) {
        toast.error('Could not confirm any registrations — please try again')
      } else {
        // Say exactly how many stuck: the reloaded list shows which.
        toast.error(`Confirmed ${pending.length - failed} of ${pending.length} — ${failed} failed`)
      }
    } finally {
      // Reload either way: on partial failure the list must show what actually
      // changed, not what we hoped would.
      if (selectedId) await loadDetail(selectedId)
      setIsConfirmingAll(false)
    }
  }

  // What still stands between this form and a save. Drives both the disabled
  // state and the message beside the button, so the two can't disagree.
  const missingFields = [
    ...(form.name.trim() ? [] : ['a name']),
    ...(form.days.length > 0 ? [] : ['at least one day']),
    ...(form.startTime && form.endTime ? [] : ['a start and end time']),
  ]

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }))
  }

  const toggleClass = (className: string) => {
    setForm((f) => ({
      ...f,
      eligibleClasses: f.eligibleClasses.includes(className)
        ? f.eligibleClasses.filter((c) => c !== className)
        : [...f.eligibleClasses, className],
    }))
  }

  const toggleYear = (yearName: string) => {
    setForm((f) => ({
      ...f,
      eligibleYears: f.eligibleYears.includes(yearName)
        ? f.eligibleYears.filter((y) => y !== yearName)
        : [...f.eligibleYears, yearName],
    }))
  }

  // ─── List ──────────────────────────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-warm-text-primary">School Services</h1>
            <p className="text-warm-text-secondary mt-1">Manage wraparound care and clubs</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-warm-btn bg-brand text-white font-semibold px-4 py-2.5 text-sm"
          >
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>

        {isLoading ? (
          <div className="text-warm-text-tertiary text-sm">Loading…</div>
        ) : !services || services.length === 0 ? (
          <div className="warm-card p-10 text-center">
            <Clock className="h-8 w-8 text-warm-text-tertiary mx-auto mb-3" />
            <p className="text-warm-text-secondary text-sm">No school services yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="warm-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-warm-border">
                <tr>
                  <th className={thCls}>Service</th>
                  <th className={thCls}>Schedule</th>
                  <th className={thCls}>Status</th>
                  <th className={`${thCls} text-center`}>Registered</th>
                  <th className={`${thCls} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => openDetail(s.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-warm-text-primary">{s.name}</p>
                        {/* Visible at a glance: what parents are being shown. */}
                        {s.featuredOnDashboard && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand/10 text-brand shrink-0">
                            Featured
                          </span>
                        )}
                      </div>
                      {s.description && <p className="text-xs text-warm-text-tertiary truncate max-w-xs">{s.description}</p>}
                    </td>
                    {/* Days + time share a column — they answer one question: when does it run? */}
                    <td className="px-4 py-3">
                      <DayPills days={s.days} />
                      <p className="text-xs text-warm-text-tertiary mt-1">{s.startTime} – {s.endTime}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CapacityCell registered={s.registeredCount || 0} capacity={s.capacity} />
                    </td>
                    {/* One target, not four. The row itself opens the service, so
                        stacking a transition button, an edit pencil and a delete
                        bin beside it made every row a small minefield — and only
                        the FIRST transition was offered, quietly stranding a
                        second legitimate next state (e.g. "Revert to Draft").
                        Everything available now lives in one menu. */}
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                          className="p-1.5 rounded-warm-btn hover:bg-slate-100 text-warm-text-tertiary hover:text-warm-text-secondary"
                          aria-label={`Actions for ${s.name}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === s.id}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {openMenuId === s.id && (
                          <div
                            ref={menuRef}
                            role="menu"
                            className="absolute right-0 top-9 z-20 min-w-[200px] warm-card py-1.5 shadow-lg text-left"
                          >
                            {(STATUS_TRANSITIONS[s.status] || []).map((t) => (
                              <button
                                key={t.next}
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); handleStatusChange(s.id, t.next) }}
                                className="w-full text-left px-3.5 py-2 text-sm font-semibold text-warm-text-primary hover:bg-slate-50"
                              >
                                {t.label}
                              </button>
                            ))}
                            {(STATUS_TRANSITIONS[s.status] || []).length > 0 && (
                              <div className="my-1 border-t border-warm-border" />
                            )}
                            <button
                              role="menuitem"
                              onClick={() => { setOpenMenuId(null); openEdit(s) }}
                              className="w-full text-left px-3.5 py-2 text-sm text-warm-text-secondary hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Edit details
                            </button>
                            {s.status === 'DRAFT' && (
                              <button
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); setShowDeleteConfirm(s.id) }}
                                className="w-full text-left px-3.5 py-2 text-sm text-warm-error hover:bg-red-50 flex items-center gap-2"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete draft
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showDeleteConfirm && (
          <ConfirmModal
            title="Delete Service"
            message="Are you sure you want to delete this draft service?"
            confirmLabel="Delete"
            variant="danger"
            onConfirm={() => handleDelete(showDeleteConfirm)}
            onCancel={() => setShowDeleteConfirm(null)}
          />
        )}
      </div>
    )
  }

  // ─── Detail ────────────────────────────────────────────────────────────────
  if (viewMode === 'detail' && selectedId) {
    const registrations = detail?.registrations || []
    const nonCancelled = registrations.filter((r) => r.status !== 'CANCELLED')
    const nextStatuses = detail ? STATUS_TRANSITIONS[detail.status] || [] : []

    return (
      <div className="max-w-5xl">
        <button
          onClick={() => { setViewMode('list'); setDetail(null) }}
          className="text-sm font-semibold text-brand mb-3"
        >
          ← All services
        </button>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-warm-text-primary">{detail?.name || 'Loading…'}</h1>
              {detail && <StatusPill status={detail.status} />}
            </div>
            {detail && (
              <p className="text-sm text-warm-text-secondary mt-1">
                {(detail.days || []).map((d) => d.slice(0, 3)).join(', ')} · {detail.startTime} – {detail.endTime}
                {detail.location ? ` · ${detail.location}` : ''}
                {detail.staffName ? ` · ${detail.staffName}` : ''}
              </p>
            )}
          </div>
          {detail && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => openEdit(detail)} className={outlineBtn}>
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => loadDetail(selectedId)} className={outlineBtn}>
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          )}
        </div>

        {detailLoading ? (
          <div className="text-warm-text-tertiary text-sm">Loading…</div>
        ) : detail ? (
          <div className="space-y-6">
            {/* Stats — Registered folds in capacity so fullness reads without hunting */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Registered', value: detail.capacity ? `${detail.registeredCount} / ${detail.capacity}` : detail.registeredCount, cls: 'text-warm-blue' },
                { label: 'Confirmed', value: detail.confirmedCount || 0, cls: 'text-warm-green' },
                { label: 'Pending', value: detail.pendingCount || 0, cls: 'text-warm-text-secondary' },
                { label: 'Paid', value: detail.paidCount || 0, cls: 'text-warm-green' },
                { label: 'Unpaid', value: detail.unpaidCount || 0, cls: 'text-yellow-600' },
              ].map((stat) => (
                <div key={stat.label} className="warm-card p-4 text-center">
                  <p className={`text-2xl font-extrabold ${stat.cls}`}>{stat.value}</p>
                  <p className="text-xs text-warm-text-tertiary mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Status controls */}
            {nextStatuses.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-warm-text-tertiary">Move to:</span>
                {nextStatuses.map((t) => (
                  <button
                    key={t.next}
                    onClick={() => handleStatusChange(detail.id, t.next)}
                    className={transitionBtn(t.cls)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* Registrations — confirm-all lives with the list it acts on */}
            <div className="warm-card overflow-hidden">
              <div className="px-4 py-3 border-b border-warm-border bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-warm-text-primary">Registrations · {nonCancelled.length}</h3>
                {(detail.pendingCount || 0) > 0 && (
                  <button
                    onClick={confirmAllPending}
                    disabled={isConfirmingAll}
                    className="flex items-center gap-1.5 rounded-warm-btn bg-warm-green text-white text-xs font-bold px-3 py-1.5 disabled:opacity-60"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {isConfirmingAll ? 'Confirming…' : `Confirm All Pending (${detail.pendingCount})`}
                  </button>
                )}
              </div>
              {nonCancelled.length === 0 ? (
                <div className="p-10 text-center">
                  <Users className="h-8 w-8 text-warm-text-tertiary mx-auto mb-3" />
                  <p className="text-warm-text-secondary text-sm">No registrations yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-warm-border">
                      <tr>
                        <th className={thCls}>Student</th>
                        <th className={thCls}>Class</th>
                        <th className={thCls}>Parent</th>
                        <th className={thCls}>Days</th>
                        <th className={thCls}>Status</th>
                        <th className={thCls}>Payment</th>
                        <th className={thCls}>Notes</th>
                        <th className={thCls}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonCancelled.map((reg) => (
                        <tr key={reg.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-semibold text-warm-text-primary">{reg.studentName}</td>
                          <td className="px-4 py-2.5 text-warm-text-secondary">{reg.className}</td>
                          <td className="px-4 py-2.5">
                            <p className="text-warm-text-primary">{reg.parentName}</p>
                            <p className="text-xs text-warm-text-tertiary">{reg.parentEmail}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <DayPills days={reg.days} />
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={reg.status}
                              onChange={(e) => handleRegStatusChange(reg.id, e.target.value as RegistrationStatus)}
                              className={`text-xs px-2 py-1 rounded-warm-btn border border-warm-border bg-white font-semibold ${REG_STATUS_TEXT[reg.status]}`}
                            >
                              <option value="PENDING">Pending</option>
                              <option value="CONFIRMED">Confirmed</option>
                              <option value="WAITLISTED">Waitlisted</option>
                              <option value="CANCELLED">Cancelled</option>
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={reg.paymentStatus}
                              onChange={(e) => handlePaymentChange(reg.id, e.target.value as PaymentStatus)}
                              className={`text-xs px-2 py-1 rounded-warm-btn border border-warm-border bg-white font-semibold ${PAYMENT_TEXT[reg.paymentStatus]}`}
                            >
                              <option value="UNPAID">Unpaid</option>
                              <option value="PAID">Paid</option>
                              <option value="PARTIAL">Partial</option>
                              <option value="WAIVED">Waived</option>
                            </select>
                          </td>
                          <td className="px-4 py-2.5 text-warm-text-tertiary text-xs max-w-[150px] truncate" title={reg.notes || ''}>
                            {reg.notes || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-warm-text-tertiary text-xs">
                            {new Date(reg.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // ─── Form (create / edit) ──────────────────────────────────────────────────
  // One card per topic instead of one long wall of fields, so the admin can
  // see at a glance what the form covers and where they are in it.
  return (
    <div className="max-w-3xl">
      <button onClick={() => setViewMode('list')} className="text-sm font-semibold text-brand mb-3">
        ← All services
      </button>
      <h1 className="text-2xl font-extrabold text-warm-text-primary mb-6">
        {editingId ? 'Edit Service' : 'Create Service'}
      </h1>

      <div className="space-y-4">
        {/* Basics */}
        <div className="warm-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-warm-text-primary">Basics</h2>
          <div>
            <label className={labelCls}>Service Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Early Bird Club"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Short Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Supervised morning care before school starts"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Details</label>
            <textarea
              value={form.details}
              onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
              placeholder="Longer description of what's included..."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Promotion. A service behind a tab nobody opens might as well not
              exist — this lifts it onto the parent dashboard. The end date is
              the important half: a promo nobody remembers to switch off stops
              being news, so it can expire on its own. */}
          <div className="rounded-warm border border-warm-border p-3.5 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.featuredOnDashboard}
                onChange={(e) => setForm((f) => ({ ...f, featuredOnDashboard: e.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                <span className="block text-sm font-semibold text-warm-text-primary">Feature on the parent dashboard</span>
                <span className="block text-xs text-warm-text-tertiary mt-0.5">
                  Shown as a card to parents whose children are eligible. Draft and archived services are never shown.
                </span>
              </span>
            </label>
            {form.featuredOnDashboard && (
              <div>
                <label className={labelCls}>
                  Stop featuring on <span className="text-warm-text-tertiary font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.featuredUntil}
                  onChange={(e) => setForm((f) => ({ ...f, featuredUntil: e.target.value }))}
                  className={inputCls}
                />
                <p className="text-xs text-warm-text-tertiary mt-1">
                  Leave empty to keep it up until you switch it off.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Schedule & logistics */}
        <div className="warm-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-warm-text-primary">Schedule &amp; Logistics</h2>
          <div>
            <label className={labelCls}>Days *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((day) => (
                <button key={day} onClick={() => toggleDay(day)} className={chipCls(form.days.includes(day))}>
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start Time *</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>End Time *</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Service Starts</label>
              <input
                type="date"
                value={form.serviceStarts}
                onChange={(e) => setForm((f) => ({ ...f, serviceStarts: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Service Ends</label>
              <input
                type="date"
                value={form.serviceEnds}
                onChange={(e) => setForm((f) => ({ ...f, serviceEnds: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Location</label>
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Main Hall"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Collection point</label>
              <input
                value={form.collectionLocation}
                onChange={(e) => setForm((f) => ({ ...f, collectionLocation: e.target.value }))}
                placeholder="Side gate"
                className={inputCls}
              />
              <p className="text-xs text-gray-500 mt-1">
                Where parents collect afterwards, if that differs from where it runs. Shown to a
                parent once their place is confirmed.
              </p>
            </div>
            <div>
              <label className={labelCls}>Staff Name</label>
              <input
                value={form.staffName}
                onChange={(e) => setForm((f) => ({ ...f, staffName: e.target.value }))}
                placeholder="Ms. Smith"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Pricing & payment */}
        <div className="warm-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-warm-text-primary">Pricing &amp; Payment</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={subLabelCls}>Per Session</label>
              <input
                value={form.costPerSession}
                onChange={(e) => setForm((f) => ({ ...f, costPerSession: e.target.value }))}
                placeholder="5.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={subLabelCls}>Per Week</label>
              <input
                value={form.costPerWeek}
                onChange={(e) => setForm((f) => ({ ...f, costPerWeek: e.target.value }))}
                placeholder="20.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={subLabelCls}>Per Term</label>
              <input
                value={form.costPerTerm}
                onChange={(e) => setForm((f) => ({ ...f, costPerTerm: e.target.value }))}
                placeholder="150.00"
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={subLabelCls}>Cost Description (free text)</label>
              <input
                value={form.costDescription}
                onChange={(e) => setForm((f) => ({ ...f, costDescription: e.target.value }))}
                placeholder="55 AED per session"
                className={inputCls}
              />
            </div>
            <div>
              <label className={subLabelCls}>Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className={`${inputCls} bg-white`}
              >
                <option value="AED">AED</option>
                <option value="GBP">GBP (&pound;)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (&euro;)</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="costIsFrom"
              checked={form.costIsFrom}
              onChange={(e) => setForm((f) => ({ ...f, costIsFrom: e.target.checked }))}
              className="rounded border-warm-border"
            />
            <label htmlFor="costIsFrom" className="text-xs text-warm-text-secondary">
              Display as "from" price (e.g. "from 55 AED/session")
            </label>
          </div>
          <div>
            <label className={labelCls}>Payment Method</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: '', label: 'Not specified' },
                { value: 'ONLINE', label: 'Online Payment' },
                { value: 'CASH_ONLY', label: 'Cash Only' },
                { value: 'FREE', label: 'Free' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, paymentMethod: opt.value }))}
                  className={`px-3 py-2 rounded-warm-btn text-xs font-semibold text-center transition-colors ${
                    form.paymentMethod === opt.value
                      ? 'bg-brand text-white'
                      : 'bg-slate-100 text-warm-text-secondary hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {(form.paymentMethod === 'ONLINE' || form.paymentUrl) && (
              <div className="mt-3">
                <label className={subLabelCls}>Payment Link (PayHub, Zenda, Stripe, etc.)</label>
                <input
                  value={form.paymentUrl}
                  onChange={(e) => setForm((f) => ({ ...f, paymentUrl: e.target.value }))}
                  placeholder="https://pay.example.com/service-name"
                  className={inputCls}
                />
              </div>
            )}
          </div>
        </div>

        {/* Capacity & eligibility */}
        <div className="warm-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-warm-text-primary">Capacity &amp; Eligibility</h2>
          <div>
            <label className={labelCls}>Capacity (leave blank for unlimited)</label>
            <input
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              placeholder="20"
              type="number"
              className={`${inputCls} max-w-xs`}
            />
          </div>
          {yearGroups && yearGroups.length > 0 && (
            <div>
              <label className={labelCls}>
                Eligible Year Groups <span className="text-warm-text-tertiary font-normal">(leave empty for all)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {yearGroups.map((yg) => (
                  <button key={yg.id} onClick={() => toggleYear(yg.name)} className={chipCls(form.eligibleYears.includes(yg.name))}>
                    {yg.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {classes && classes.length > 0 && (
            <div>
              <label className={labelCls}>
                Eligible Classes <span className="text-warm-text-tertiary font-normal">(leave empty for all)</span>
              </label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {classes.map((c) => (
                  <button key={c.id} onClick={() => toggleClass(c.name)} className={chipCls(form.eligibleClasses.includes(c.name))}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save. A disabled button that won't say why is a dead end — name what's
          still missing, in the order the form asks for it. */}
      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleSave}
          disabled={isSubmitting || missingFields.length > 0}
          className="rounded-warm-btn bg-brand text-white font-semibold px-6 py-2.5 text-sm disabled:opacity-60"
        >
          {isSubmitting ? 'Saving…' : editingId ? 'Save Changes' : 'Create Service'}
        </button>
        <button
          onClick={() => setViewMode('list')}
          className="rounded-warm-btn border border-warm-border px-5 py-2.5 text-sm font-semibold text-warm-text-secondary hover:bg-slate-50"
        >
          Cancel
        </button>
        {missingFields.length > 0 && (
          <p className="text-sm text-warm-text-tertiary">
            Still needed: {missingFields.join(' and ')}.
          </p>
        )}
      </div>
    </div>
  )
}
