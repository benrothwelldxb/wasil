import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Calendar, Clock, AlertCircle } from 'lucide-react'
import { PageLogo } from '../components/PageHeader'
import { useApi, useAuth } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { AttendanceRequest, AttendanceRequestType, ChildAttendanceSummary } from '@wasil/shared'

const REQUEST_TYPE_CONFIG: Record<AttendanceRequestType, { label: string; color: string; bg: string }> = {
  ABSENCE: { label: 'Report Absence', color: '#DC2626', bg: '#FEE2E2' },
  EARLY_PICKUP: { label: 'Early Pickup', color: '#C47A20', bg: '#FFF3E6' },
  LATE_ARRIVAL: { label: 'Late Arrival', color: '#5B6EC4', bg: '#EEF0FF' },
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: '#FFF3E6', text: '#C47A20' },
  APPROVED: { bg: '#E8F5EC', text: '#2D8B4E' },
  DECLINED: { bg: '#FEE2E2', text: '#DC2626' },
}

const REASON_OPTIONS = ['Illness', 'Medical Appointment', 'Family', 'Other']

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'))
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface RequestForm {
  studentId: string
  type: AttendanceRequestType
  startDate: string
  endDate: string
  time: string
  reason: string
  notes: string
}

const emptyForm = (type: AttendanceRequestType): RequestForm => ({
  studentId: '',
  type,
  startDate: todayString(),
  endDate: todayString(),
  time: '',
  reason: '',
  notes: '',
})

export function AttendancePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<RequestForm>(emptyForm('ABSENCE'))
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const { data: requests, refetch: refetchRequests } = useApi<AttendanceRequest[]>(
    () => api.attendance.myRequests(),
    []
  )

  const { data: summaryData } = useApi<ChildAttendanceSummary[]>(
    () => api.attendance.myChildren(),
    []
  )

  // Deduplicate children
  const children = useMemo(() => {
    const kids: Array<{ id: string; name: string; className: string }> = []
    const seen = new Set<string>()
    user?.studentLinks?.forEach((l) => {
      const name = l.studentName.trim()
      if (!seen.has(name)) {
        seen.add(name)
        kids.push({ id: l.studentId, name, className: l.className })
      }
    })
    user?.children?.forEach((c) => {
      const name = c.name.trim()
      if (!seen.has(name)) {
        seen.add(name)
        kids.push({ id: c.id, name, className: c.className })
      }
    })
    return kids
  }, [user])

  const openModal = (type: AttendanceRequestType) => {
    const f = emptyForm(type)
    if (children.length === 1) f.studentId = children[0].id
    setForm(f)
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.studentId) {
      setToast('Please select a child')
      return
    }
    if (!form.reason) {
      setToast('Please select a reason')
      return
    }

    setSubmitting(true)
    try {
      await api.attendance.submitRequest({
        studentId: form.studentId,
        type: form.type,
        startDate: form.startDate,
        endDate: form.type === 'ABSENCE' ? form.endDate : undefined,
        time: form.type !== 'ABSENCE' ? form.time : undefined,
        reason: form.reason,
        notes: form.notes || undefined,
      })
      setShowModal(false)
      setToast('Request submitted successfully')
      refetchRequests()
    } catch (err: any) {
      setToast(err.message || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const sortedRequests = useMemo(() => {
    if (!requests) return []
    return [...requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [requests])

  // Clear toast
  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  return (
    <div className="space-y-6">
      <PageLogo />
      <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
        Attendance
      </h1>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-[100] px-4 py-3 rounded-[16px] shadow-lg text-sm font-semibold"
          style={{ backgroundColor: '#2D2225', color: 'white', maxWidth: '320px' }}
        >
          {toast}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <p className="text-sm font-bold mb-3" style={{ color: '#7A6469' }}>
          Quick Actions
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(Object.entries(REQUEST_TYPE_CONFIG) as [AttendanceRequestType, typeof REQUEST_TYPE_CONFIG.ABSENCE][]).map(
            ([type, cfg]) => (
              <button
                key={type}
                onClick={() => openModal(type)}
                className="flex flex-col items-center gap-2 p-4 rounded-[22px] transition-all active:scale-95"
                style={{
                  backgroundColor: cfg.bg,
                  border: `1.5px solid ${cfg.bg}`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: cfg.color + '20' }}
                >
                  {type === 'ABSENCE' && <AlertCircle className="w-5 h-5" style={{ color: cfg.color }} />}
                  {type === 'EARLY_PICKUP' && <Clock className="w-5 h-5" style={{ color: cfg.color }} />}
                  {type === 'LATE_ARRIVAL' && <Calendar className="w-5 h-5" style={{ color: cfg.color }} />}
                </div>
                <span className="text-xs font-bold text-center" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
              </button>
            )
          )}
        </div>
      </div>

      {/* My Requests */}
      <div>
        <p className="text-sm font-bold mb-3" style={{ color: '#7A6469' }}>
          My Requests
        </p>
        {sortedRequests.length === 0 ? (
          <div
            className="text-center py-8 rounded-[22px]"
            style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6' }}
          >
            <p className="text-sm" style={{ color: '#A8929A' }}>
              No requests submitted yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedRequests.map((req) => {
              const typeConfig = REQUEST_TYPE_CONFIG[req.type] || REQUEST_TYPE_CONFIG.ABSENCE
              const statusConfig = STATUS_COLORS[req.status] || STATUS_COLORS.PENDING
              return (
                <div
                  key={req.id}
                  className="rounded-[22px] p-4 space-y-2"
                  style={{ backgroundColor: 'white', border: '1.5px solid #F0E4E6' }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-sm" style={{ color: '#2D2225' }}>
                        {req.studentName}
                      </p>
                      <p className="text-xs" style={{ color: '#A8929A' }}>
                        {formatDate(req.startDate)}
                        {req.endDate && req.endDate !== req.startDate ? ` - ${formatDate(req.endDate)}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <span
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold"
                        style={{ backgroundColor: typeConfig.bg, color: typeConfig.color }}
                      >
                        {req.type.replace('_', ' ')}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold"
                        style={{ backgroundColor: statusConfig.bg, color: statusConfig.text }}
                      >
                        {req.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: '#7A6469' }}>
                    {req.reason}
                    {req.notes ? ` - ${req.notes}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Attendance Summary */}
      {summaryData && summaryData.length > 0 && (
        <div>
          <p className="text-sm font-bold mb-3" style={{ color: '#7A6469' }}>
            Attendance Summary
          </p>
          <div className="space-y-3">
            {summaryData.map((child) => {
              const total = child.present + child.absent + child.late + child.excused
              const safeTotal = total || 1
              const presentPct = Math.round(((child.present + child.excused) / safeTotal) * 100)
              return (
                <div
                  key={child.studentId}
                  className="rounded-[22px] p-4"
                  style={{ backgroundColor: 'white', border: '1.5px solid #F0E4E6' }}
                >
                  <p className="font-bold text-sm mb-2" style={{ color: '#2D2225' }}>
                    {child.studentName}
                  </p>
                  <div className="flex gap-4 text-xs mb-3" style={{ color: '#7A6469' }}>
                    <span>
                      <strong style={{ color: '#2D8B4E' }}>{child.present}</strong> present
                    </span>
                    <span>
                      <strong style={{ color: '#DC2626' }}>{child.absent}</strong> absent
                    </span>
                    <span>
                      <strong style={{ color: '#C47A20' }}>{child.late}</strong> late
                    </span>
                    {child.excused > 0 && (
                      <span>
                        <strong style={{ color: '#5B6EC4' }}>{child.excused}</strong> excused
                      </span>
                    )}
                  </div>
                  {/* Attendance bar */}
                  <div className="relative h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#F0E4E6' }}>
                    <div
                      className="absolute left-0 top-0 h-full rounded-full transition-all"
                      style={{
                        width: `${presentPct}%`,
                        backgroundColor: presentPct >= 90 ? '#2D8B4E' : presentPct >= 75 ? '#C47A20' : '#DC2626',
                      }}
                    />
                  </div>
                  <p className="text-[11px] font-semibold mt-1" style={{ color: '#A8929A' }}>
                    {presentPct}% attendance rate this term
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Request Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowModal(false)}>
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-[22px] rounded-t-[22px] max-h-[85vh] overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold" style={{ color: '#2D2225' }}>
                  {REQUEST_TYPE_CONFIG[form.type].label}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-xl p-2"
                  style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X className="w-5 h-5" style={{ color: '#7A6469' }} />
                </button>
              </div>

              {/* Child selector */}
              {children.length > 1 && (
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#2D2225' }}>
                    Child
                  </label>
                  <select
                    value={form.studentId}
                    onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
                    className="w-full px-4 py-3 rounded-[14px] text-sm font-medium"
                    style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                  >
                    <option value="">Select child...</option>
                    {children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.className})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {children.length === 1 && (
                <div className="px-4 py-3 rounded-[14px]" style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6' }}>
                  <p className="text-sm font-semibold" style={{ color: '#2D2225' }}>
                    {children[0].name}
                  </p>
                  <p className="text-xs" style={{ color: '#A8929A' }}>
                    {children[0].className}
                  </p>
                </div>
              )}

              {/* Date picker */}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: '#2D2225' }}>
                  {form.type === 'ABSENCE' ? 'Start Date' : 'Date'}
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full px-4 py-3 rounded-[14px] text-sm font-medium"
                  style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                />
              </div>

              {form.type === 'ABSENCE' && (
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#2D2225' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-4 py-3 rounded-[14px] text-sm font-medium"
                    style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                  />
                </div>
              )}

              {/* Time picker for early pickup / late arrival */}
              {form.type !== 'ABSENCE' && (
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#2D2225' }}>
                    {form.type === 'EARLY_PICKUP' ? 'Pickup Time' : 'Arrival Time'}
                  </label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full px-4 py-3 rounded-[14px] text-sm font-medium"
                    style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                  />
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: '#2D2225' }}>
                  Reason
                </label>
                <select
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="w-full px-4 py-3 rounded-[14px] text-sm font-medium"
                  style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                >
                  <option value="">Select reason...</option>
                  {REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: '#2D2225' }}>
                  Notes (optional)
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 rounded-[14px] text-sm font-medium resize-none"
                  style={{ backgroundColor: '#FFF8F4', border: '1.5px solid #F0E4E6', color: '#2D2225' }}
                  placeholder="Add any additional details..."
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3.5 rounded-[14px] text-white font-bold text-sm transition-all disabled:opacity-50 active:scale-[0.98]"
                style={{ backgroundColor: REQUEST_TYPE_CONFIG[form.type].color }}
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
