import React, { useState, useEffect } from 'react'
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronRight, Users, Check,
  Clock, DollarSign, X, RefreshCw,
} from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type {
  SchoolService, SchoolServiceWithStats, ServiceRegistration,
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

const STATUS_COLORS: Record<ServiceStatus, string> = {
  DRAFT: '#9CA3AF',
  PUBLISHED: '#5B6EC4',
  REGISTRATION_OPEN: '#2D8B4E',
  REGISTRATION_CLOSED: '#C47A20',
  ACTIVE: '#2D8B4E',
  ARCHIVED: '#7A6469',
}

const STATUS_TRANSITIONS: Record<ServiceStatus, { next: ServiceStatus; label: string; color: string }[]> = {
  DRAFT: [{ next: 'PUBLISHED', label: 'Publish', color: '#5B6EC4' }],
  PUBLISHED: [{ next: 'REGISTRATION_OPEN', label: 'Open Registration', color: '#2D8B4E' }, { next: 'DRAFT', label: 'Revert to Draft', color: '#9CA3AF' }],
  REGISTRATION_OPEN: [{ next: 'REGISTRATION_CLOSED', label: 'Close Registration', color: '#C47A20' }],
  REGISTRATION_CLOSED: [{ next: 'ACTIVE', label: 'Mark Active', color: '#2D8B4E' }, { next: 'REGISTRATION_OPEN', label: 'Reopen Registration', color: '#5B6EC4' }],
  ACTIVE: [{ next: 'ARCHIVED', label: 'Archive', color: '#7A6469' }],
  ARCHIVED: [],
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = { UNPAID: 'Unpaid', PAID: 'Paid', PARTIAL: 'Partial', WAIVED: 'Waived' }
const PAYMENT_COLORS: Record<PaymentStatus, string> = { UNPAID: '#C47A20', PAID: '#2D8B4E', PARTIAL: '#C47A20', WAIVED: '#7A6469' }
const REG_STATUS_LABELS: Record<RegistrationStatus, string> = { PENDING: 'Pending', CONFIRMED: 'Confirmed', WAITLISTED: 'Waitlisted', CANCELLED: 'Cancelled' }
const REG_STATUS_COLORS: Record<RegistrationStatus, string> = { PENDING: '#9CA3AF', CONFIRMED: '#2D8B4E', WAITLISTED: '#C47A20', CANCELLED: '#DC2626' }

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
  staffName: string
  serviceStarts: string
  serviceEnds: string
}

const emptyForm: FormState = {
  name: '', description: '', details: '', days: [],
  startTime: '07:00', endTime: '08:00',
  costPerSession: '', costPerWeek: '', costPerTerm: '', costDescription: '',
  costIsFrom: false, currency: 'AED', paymentMethod: '', paymentUrl: '',
  capacity: '', eligibleClasses: [], eligibleYears: [],
  location: '', staffName: '', serviceStarts: '', serviceEnds: '',
}

export function SchoolServicesPage() {
  const theme = useTheme()
  const toast = useToast()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ ...emptyForm })
  const [isSubmitting, setIsSubmitting] = useState(false)
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
      staffName: service.staffName || '',
      serviceStarts: service.serviceStarts || '',
      serviceEnds: service.serviceEnds || '',
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
        staffName: form.staffName || undefined,
        serviceStarts: form.serviceStarts || undefined,
        serviceEnds: form.serviceEnds || undefined,
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

  const confirmAllPending = async () => {
    if (!detail?.registrations) return
    const pending = detail.registrations.filter((r) => r.status === 'PENDING')
    for (const reg of pending) {
      await api.schoolServices.updateRegistrationStatus(reg.id, 'CONFIRMED')
    }
    if (selectedId) loadDetail(selectedId)
  }

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

  // LIST VIEW
  if (viewMode === 'list') {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">School Services</h1>
            <p className="text-sm text-gray-500 mt-1">Manage wraparound care and clubs</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium text-sm"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : !services || services.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No school services yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Service</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Days</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Registered</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(s.id)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{s.name}</p>
                      {s.description && <p className="text-xs text-gray-500 truncate max-w-xs">{s.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(s.days || []).map((d) => (
                          <span key={d} className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                            {d.slice(0, 3)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.startTime} - {s.endTime}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2.5 py-1 rounded-full font-medium text-white"
                        style={{ backgroundColor: STATUS_COLORS[s.status] }}
                      >
                        {STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-medium">{s.registeredCount || 0}</span>
                      {s.capacity && <span className="text-gray-400">/{s.capacity}</span>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {/* Primary action — first available transition */}
                        {(STATUS_TRANSITIONS[s.status] || []).slice(0, 1).map((t) => (
                          <button
                            key={t.next}
                            onClick={() => handleStatusChange(s.id, t.next)}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg text-white whitespace-nowrap"
                            style={{ backgroundColor: t.color }}
                          >
                            {t.label}
                          </button>
                        ))}
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {s.status === 'DRAFT' && (
                          <button
                            onClick={() => setShowDeleteConfirm(s.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

  // DETAIL VIEW
  if (viewMode === 'detail' && selectedId) {
    const registrations = detail?.registrations || []
    const nonCancelled = registrations.filter((r) => r.status !== 'CANCELLED')
    const nextStatuses = detail ? STATUS_TRANSITIONS[detail.status] || [] : []

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => { setViewMode('list'); setDetail(null) }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{detail?.name || 'Loading...'}</h1>
          {detail && (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium text-white"
              style={{ backgroundColor: STATUS_COLORS[detail.status] }}
            >
              {STATUS_LABELS[detail.status]}
            </span>
          )}
        </div>

        {detailLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : detail ? (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Registered', value: detail.registeredCount, color: '#5B6EC4' },
                { label: 'Confirmed', value: detail.confirmedCount || 0, color: '#2D8B4E' },
                { label: 'Pending', value: detail.pendingCount || 0, color: '#9CA3AF' },
                { label: 'Paid', value: detail.paidCount || 0, color: '#2D8B4E' },
                { label: 'Unpaid', value: detail.unpaidCount || 0, color: '#C47A20' },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Status controls */}
            {nextStatuses.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Change status:</span>
                {nextStatuses.map((t) => (
                  <button
                    key={t.next}
                    onClick={() => handleStatusChange(detail.id, t.next)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg text-white"
                    style={{ backgroundColor: t.color }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => openEdit(detail)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              {(detail.pendingCount || 0) > 0 && (
                <button
                  onClick={confirmAllPending}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg text-white"
                  style={{ backgroundColor: '#2D8B4E' }}
                >
                  <Check className="w-3.5 h-3.5" /> Confirm All Pending
                </button>
              )}
              <button
                onClick={() => loadDetail(selectedId)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {/* Registrations table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-700">Registrations ({nonCancelled.length})</h3>
              </div>
              {nonCancelled.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No registrations yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Student</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Class</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Parent</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Days</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Payment</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Notes</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {nonCancelled.map((reg) => (
                        <tr key={reg.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{reg.studentName}</td>
                          <td className="px-4 py-2 text-gray-600">{reg.className}</td>
                          <td className="px-4 py-2">
                            <p className="text-gray-900">{reg.parentName}</p>
                            <p className="text-xs text-gray-400">{reg.parentEmail}</p>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(reg.days || []).map((d) => (
                                <span key={d} className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                                  {d.slice(0, 3)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={reg.status}
                              onChange={(e) => handleRegStatusChange(reg.id, e.target.value as RegistrationStatus)}
                              className="text-xs px-2 py-1 rounded border border-gray-200 font-medium"
                              style={{ color: REG_STATUS_COLORS[reg.status] }}
                            >
                              <option value="PENDING">Pending</option>
                              <option value="CONFIRMED">Confirmed</option>
                              <option value="WAITLISTED">Waitlisted</option>
                              <option value="CANCELLED">Cancelled</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={reg.paymentStatus}
                              onChange={(e) => handlePaymentChange(reg.id, e.target.value as PaymentStatus)}
                              className="text-xs px-2 py-1 rounded border border-gray-200 font-medium"
                              style={{ color: PAYMENT_COLORS[reg.paymentStatus] }}
                            >
                              <option value="UNPAID">Unpaid</option>
                              <option value="PAID">Paid</option>
                              <option value="PARTIAL">Partial</option>
                              <option value="WAIVED">Waived</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs max-w-[150px] truncate" title={reg.notes || ''}>
                            {reg.notes || '-'}
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs">
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

  // FORM VIEW (Create / Edit)
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setViewMode('list')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {editingId ? 'Edit Service' : 'Create Service'}
        </h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-3xl space-y-5">
        {/* Name */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Service Name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Early Bird Club"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Short Description</label>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Supervised morning care before school starts"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {/* Details */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Details</label>
          <textarea
            value={form.details}
            onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
            placeholder="Longer description of what's included..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
          />
        </div>

        {/* Days */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Days *</label>
          <div className="flex flex-wrap gap-2">
            {ALL_DAYS.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.days.includes(day)
                    ? 'text-white border-transparent'
                    : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                style={form.days.includes(day) ? { backgroundColor: theme.colors.brandColor } : undefined}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Start Time *</label>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">End Time *</label>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Costs */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Pricing</label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Per Session</label>
              <input
                value={form.costPerSession}
                onChange={(e) => setForm((f) => ({ ...f, costPerSession: e.target.value }))}
                placeholder="5.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Per Week</label>
              <input
                value={form.costPerWeek}
                onChange={(e) => setForm((f) => ({ ...f, costPerWeek: e.target.value }))}
                placeholder="20.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Per Term</label>
              <input
                value={form.costPerTerm}
                onChange={(e) => setForm((f) => ({ ...f, costPerTerm: e.target.value }))}
                placeholder="150.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cost Description (free text)</label>
              <input
                value={form.costDescription}
                onChange={(e) => setForm((f) => ({ ...f, costDescription: e.target.value }))}
                placeholder="55 AED per session"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="AED">AED</option>
                <option value="GBP">GBP (&pound;)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (&euro;)</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="costIsFrom"
              checked={form.costIsFrom}
              onChange={(e) => setForm((f) => ({ ...f, costIsFrom: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="costIsFrom" className="text-xs text-gray-600">
              Display as "from" price (e.g. "from 55 AED/session")
            </label>
          </div>
        </div>

        {/* Payment */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Payment Method</label>
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
                className="px-3 py-2 rounded-lg text-xs font-semibold text-center transition-colors"
                style={
                  form.paymentMethod === opt.value
                    ? { backgroundColor: theme.colors.brandColor, color: '#FFFFFF' }
                    : { backgroundColor: '#F1F5F9', color: '#64748B' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          {(form.paymentMethod === 'ONLINE' || form.paymentUrl) && (
            <div className="mt-2">
              <label className="text-xs text-gray-500 mb-1 block">Payment Link (PayHub, Zenda, Stripe, etc.)</label>
              <input
                value={form.paymentUrl}
                onChange={(e) => setForm((f) => ({ ...f, paymentUrl: e.target.value }))}
                placeholder="https://pay.example.com/service-name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}
        </div>

        {/* Capacity */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Capacity (leave blank for unlimited)</label>
          <input
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            placeholder="20"
            type="number"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm max-w-xs"
          />
        </div>

        {/* Eligible Year Groups */}
        {yearGroups && yearGroups.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Eligible Year Groups <span className="text-gray-400 font-normal">(leave empty for all)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {yearGroups.map((yg) => (
                <button
                  key={yg.id}
                  onClick={() => toggleYear(yg.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.eligibleYears.includes(yg.name)
                      ? 'text-white border-transparent'
                      : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                  style={form.eligibleYears.includes(yg.name) ? { backgroundColor: theme.colors.brandColor } : undefined}
                >
                  {yg.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Eligible Classes */}
        {classes && classes.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Eligible Classes <span className="text-gray-400 font-normal">(leave empty for all)</span>
            </label>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {classes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleClass(c.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.eligibleClasses.includes(c.name)
                      ? 'text-white border-transparent'
                      : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                  style={form.eligibleClasses.includes(c.name) ? { backgroundColor: theme.colors.brandColor } : undefined}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Location + Staff */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Main Hall"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Staff Name</label>
            <input
              value={form.staffName}
              onChange={(e) => setForm((f) => ({ ...f, staffName: e.target.value }))}
              placeholder="Ms. Smith"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Service dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Service Starts</label>
            <input
              type="date"
              value={form.serviceStarts}
              onChange={(e) => setForm((f) => ({ ...f, serviceStarts: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Service Ends</label>
            <input
              type="date"
              value={form.serviceEnds}
              onChange={(e) => setForm((f) => ({ ...f, serviceEnds: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={isSubmitting || !form.name || form.days.length === 0}
            className="px-6 py-2 rounded-lg text-white font-medium text-sm disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create Service'}
          </button>
          <button
            onClick={() => setViewMode('list')}
            className="px-6 py-2 rounded-lg text-gray-600 font-medium text-sm border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
