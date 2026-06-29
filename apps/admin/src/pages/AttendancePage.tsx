import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Check,
  X,
  Clock,
  ClipboardList,
  Download,
  Printer,
  Users,
  TrendingUp,
  Mail,
  Copy,
  RefreshCw,
} from 'lucide-react'
import { useApi, useToast, api, useAuth } from '@wasil/shared'
import type {
  Class,
  AttendanceRecord,
  AttendanceRequest,
  AttendanceStatus,
  AttendanceAnalytics,
  AttendanceDigest,
  RequestApprovalStatus,
} from '@wasil/shared'

type Tab = 'take' | 'digest' | 'requests' | 'analytics'
type RequestFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'DECLINED'

const STATUS_COLORS: Record<AttendanceStatus, { bg: string; text: string; border: string }> = {
  PRESENT: { bg: '#E8F5EC', text: '#2D8B4E', border: '#C6E7D0' },
  ABSENT: { bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
  LATE: { bg: '#FFF3E6', text: '#C47A20', border: '#FDE68A' },
  EXCUSED: { bg: '#EEF0FF', text: '#5B6EC4', border: '#C7D2FE' },
}

const REQUEST_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ABSENCE: { bg: '#FEE2E2', text: '#DC2626' },
  EARLY_PICKUP: { bg: '#FFF3E6', text: '#C47A20' },
  LATE_ARRIVAL: { bg: '#EEF0FF', text: '#5B6EC4' },
}

const REQUEST_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: '#FFF3E6', text: '#C47A20' },
  APPROVED: { bg: '#E8F5EC', text: '#2D8B4E' },
  DECLINED: { bg: '#FEE2E2', text: '#DC2626' },
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'))
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

// ── Take Attendance Tab ──────────────────────────────────────

interface ParentRequest {
  id: string
  type: string
  reason: string
  notes?: string | null
  time?: string | null
  status: string
  parentName: string
}

interface StudentRow {
  studentId: string
  studentName: string
  status: AttendanceStatus | null
  notes: string
  requests: ParentRequest[]
}

function TakeAttendanceTab() {
  const toast = useToast()
  const [date, setDate] = useState(todayString())
  const [selectedClassId, setSelectedClassId] = useState('')
  const [rows, setRows] = useState<StudentRow[]>([])
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data: allClasses } = useApi<Class[]>(() => api.classes.list(), [])

  const loadStudents = useCallback(async (classId: string, d: string) => {
    if (!classId) return
    try {
      const result = await api.attendance.classAttendance(classId, d)
      const newRows: StudentRow[] = (result.students || []).map((s: any) => ({
        studentId: s.studentId,
        studentName: s.studentName,
        status: s.status || null,
        notes: s.notes || '',
        requests: s.requests || [],
      }))
      newRows.sort((a, b) => a.studentName.localeCompare(b.studentName))
      setRows(newRows)
      setLoaded(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load students')
    }
  }, [toast])

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId)
    setLoaded(false)
    setRows([])
    if (classId) loadStudents(classId, date)
  }

  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    if (selectedClassId) loadStudents(selectedClassId, newDate)
  }

  const setStatus = (idx: number, status: AttendanceStatus) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, status: r.status === status ? null : status } : r)))
  }

  const setNotes = (idx: number, notes: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, notes } : r)))
  }

  const markedCount = rows.filter((r) => r.status !== null).length

  const handlePrintAllRegisters = async () => {
    try {
      const html = await api.attendance.printRegistersHtml(date)
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
      } else {
        toast.error('Please allow pop-ups to print registers')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load registers')
    }
  }

  const handleSave = async () => {
    const records = rows
      .filter((r) => r.status !== null)
      .map((r) => ({ studentId: r.studentId, status: r.status!, notes: r.notes || undefined }))

    if (records.length === 0) {
      toast.warning('No attendance marked yet')
      return
    }

    setSaving(true)
    try {
      await api.attendance.mark(records, date)
      toast.success(`Attendance saved for ${records.length} students`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save attendance')
    } finally {
      setSaving(false)
    }
  }

  const statusButtons: { key: AttendanceStatus; label: string; icon: string }[] = [
    { key: 'PRESENT', label: 'Present', icon: '\u2713' },
    { key: 'ABSENT', label: 'Absent', icon: '\u2717' },
    { key: 'LATE', label: 'Late', icon: '\u23F0' },
    { key: 'EXCUSED', label: 'Excused', icon: '\uD83D\uDCCB' },
  ]

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        <div className="min-w-[220px]">
          <label className="block text-sm font-semibold text-slate-700 mb-1">Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => handleClassChange(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
          >
            <option value="">Select a class...</option>
            {allClasses?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handlePrintAllRegisters}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          title="Open a printable register for every class on this date"
        >
          <Printer className="w-4 h-4" />
          Print all registers
        </button>
        {loaded && rows.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm font-semibold" style={{ color: markedCount === rows.length ? '#2D8B4E' : '#C47A20' }}>
              {markedCount} of {rows.length} marked
            </span>
          </div>
        )}
      </div>

      {/* Student list */}
      {!selectedClassId && (
        <div className="text-center py-16 text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Select a class to take attendance</p>
        </div>
      )}

      {selectedClassId && loaded && rows.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm font-medium">No students found in this class</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div
              key={row.studentId}
              className="bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all"
              style={{
                borderColor: row.status ? STATUS_COLORS[row.status].border : '#E2E8F0',
                backgroundColor: row.status ? STATUS_COLORS[row.status].bg + '40' : 'white',
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800">{row.studentName}</p>
                {row.requests.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {row.requests.map(r => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: r.type === 'ABSENCE' ? '#FEE2E2' : r.type === 'EARLY_PICKUP' ? '#FFF3E6' : '#EFF6FF',
                          color: r.type === 'ABSENCE' ? '#DC2626' : r.type === 'EARLY_PICKUP' ? '#C47A20' : '#2563EB',
                        }}
                      >
                        {r.status === 'PENDING' ? '⏳' : '✓'}
                        {r.type === 'ABSENCE' ? 'Absence' : r.type === 'EARLY_PICKUP' ? 'Early pickup' : 'Late arrival'}
                        {r.time && ` at ${r.time}`}
                        {' — '}{r.reason} (by {r.parentName})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-1.5 flex-shrink-0">
                {statusButtons.map((btn) => {
                  const isActive = row.status === btn.key
                  const colors = STATUS_COLORS[btn.key]
                  return (
                    <button
                      key={btn.key}
                      onClick={() => setStatus(idx, btn.key)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        backgroundColor: isActive ? colors.bg : '#F8FAFC',
                        color: isActive ? colors.text : '#94A3B8',
                        border: `1.5px solid ${isActive ? colors.border : '#E2E8F0'}`,
                      }}
                      title={btn.label}
                    >
                      {btn.icon} {btn.label}
                    </button>
                  )
                })}
              </div>

              <input
                type="text"
                placeholder="Notes..."
                value={row.notes}
                onChange={(e) => setNotes(idx, e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs w-full sm:w-40 focus:outline-none focus:ring-1 focus:ring-pink-200"
              />
            </div>
          ))}

          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={saving || markedCount === 0}
              className="px-6 py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
              style={{ backgroundColor: '#C4506E' }}
            >
              {saving ? 'Saving...' : `Save Attendance (${markedCount})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Requests Tab ─────────────────────────────────────────────

function RequestsTab() {
  const toast = useToast()
  const [filter, setFilter] = useState<RequestFilter>('ALL')
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState<string | null>(null)

  const { data: requestsData, refetch } = useApi<{ requests: AttendanceRequest[]; pagination: any }>(
    () => api.attendance.listRequests(),
    []
  )

  const requests = requestsData?.requests || []

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'PENDING').length, [requests])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return requests
    return requests.filter((r) => r.status === filter)
  }, [requests, filter])

  const handleReview = async (id: string, status: 'APPROVED' | 'DECLINED') => {
    setProcessing(id)
    try {
      await api.attendance.reviewRequest(id, status, reviewNotes[id] || undefined)
      toast.success(`Request ${status.toLowerCase()}`)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to review request')
    } finally {
      setProcessing(null)
    }
  }

  const filterTabs: { key: RequestFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'DECLINED', label: 'Declined' },
  ]

  return (
    <div className="space-y-6">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all relative"
            style={{
              backgroundColor: filter === tab.key ? '#C4506E' : '#F8FAFC',
              color: filter === tab.key ? 'white' : '#64748B',
              border: `1.5px solid ${filter === tab.key ? '#C4506E' : '#E2E8F0'}`,
            }}
          >
            {tab.label}
            {tab.key === 'PENDING' && pendingCount > 0 && (
              <span
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ backgroundColor: '#C4506E' }}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Request cards */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No requests found</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((req) => {
          const typeColors = REQUEST_TYPE_COLORS[req.type] || REQUEST_TYPE_COLORS.ABSENCE
          const statusColors = REQUEST_STATUS_COLORS[req.status] || REQUEST_STATUS_COLORS.PENDING
          return (
            <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-slate-800">{req.studentName}</p>
                  <p className="text-xs text-slate-500">Submitted by {req.parentName}</p>
                </div>
                <div className="flex gap-2">
                  <span
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
                    style={{ backgroundColor: typeColors.bg, color: typeColors.text }}
                  >
                    {req.type.replace('_', ' ')}
                  </span>
                  <span
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
                    style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
                  >
                    {req.status}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                <span>Date: {formatDate(req.startDate)}{req.endDate && req.endDate !== req.startDate ? ` - ${formatDate(req.endDate)}` : ''}</span>
                {req.time && <span>Time: {req.time}</span>}
                <span>Reason: {req.reason}</span>
              </div>

              {req.notes && (
                <p className="text-xs text-slate-500 italic">"{req.notes}"</p>
              )}

              <p className="text-[11px] text-slate-400">Submitted {formatDateTime(req.createdAt)}</p>

              {req.status === 'PENDING' && (
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                  <input
                    type="text"
                    placeholder="Review notes (optional)..."
                    value={reviewNotes[req.id] || ''}
                    onChange={(e) => setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-pink-200"
                  />
                  <button
                    onClick={() => handleReview(req.id, 'APPROVED')}
                    disabled={processing === req.id}
                    className="px-4 py-2 rounded-lg text-white text-xs font-bold transition-all disabled:opacity-50"
                    style={{ backgroundColor: '#2D8B4E' }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReview(req.id, 'DECLINED')}
                    disabled={processing === req.id}
                    className="px-4 py-2 rounded-lg text-white text-xs font-bold transition-all disabled:opacity-50"
                    style={{ backgroundColor: '#DC2626' }}
                  >
                    Decline
                  </button>
                </div>
              )}

              {req.status !== 'PENDING' && req.reviewedBy && (
                <p className="text-[11px] text-slate-400">
                  Reviewed by {req.reviewedBy}{req.reviewedAt ? ` on ${formatDateTime(req.reviewedAt)}` : ''}
                  {req.reviewNotes ? ` - "${req.reviewNotes}"` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Today's Absences Tab ─────────────────────────────────────

function TodaysAbsencesTab() {
  const toast = useToast()
  const [date, setDate] = useState(todayString())
  const [digest, setDigest] = useState<AttendanceDigest | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const data = await api.attendance.digest(d)
      setDigest(data)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load digest')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load(date) }, [date, load])

  const handleSendNow = async () => {
    setSending(true)
    try {
      const result = await api.attendance.sendDigest(date)
      toast.success(`Digest sent to ${result.recipients} admin${result.recipients === 1 ? '' : 's'}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to send digest')
    } finally {
      setSending(false)
    }
  }

  const handleCopy = async () => {
    if (!digest) return
    const lines: string[] = []
    lines.push(`${digest.schoolName} — ${digest.formattedDate}`)
    lines.push(`${digest.totalMarked} of ${digest.totalStudents} marked`)
    lines.push('')
    const section = (label: string, rows: typeof digest.absent) => {
      lines.push(`${label} (${rows.length}):`)
      if (rows.length === 0) {
        lines.push('  (none)')
      } else {
        rows.forEach(r => {
          const note = r.notes ? ` — ${r.notes}` : ''
          lines.push(`  • ${r.studentName} (${r.className})${note}`)
        })
      }
      lines.push('')
    }
    section('Absent', digest.absent)
    section('Late', digest.late)
    section('Excused', digest.excused)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Copy failed — your browser blocked clipboard access')
    }
  }

  const Section = ({ label, color, rows }: { label: string; color: string; rows: AttendanceDigest['absent'] }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold" style={{ color }}>{label}</h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '20', color }}>
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 italic">None.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className="font-semibold text-slate-800">{r.studentName}</span>
                <span className="text-slate-500 ml-2">{r.className}</span>
              </div>
              {r.notes && <span className="text-xs text-slate-500 truncate max-w-[40%]">{r.notes}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        <button
          onClick={() => load(date)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          title="Reload"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleCopy}
            disabled={!digest}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Copy className="w-4 h-4" />
            Copy as text
          </button>
          <button
            onClick={handleSendNow}
            disabled={sending}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-bold flex items-center gap-2"
            style={{ backgroundColor: '#C4506E', opacity: sending ? 0.6 : 1 }}
          >
            <Mail className="w-4 h-4" />
            {sending ? 'Sending...' : 'Email digest now'}
          </button>
        </div>
      </div>

      {loading && !digest && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      )}

      {digest && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{digest.schoolName}</p>
              <p className="text-lg font-bold text-slate-800 mt-1">{digest.formattedDate}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-500">Marked today</p>
              <p className="text-lg font-bold text-slate-800">{digest.totalMarked} / {digest.totalStudents}</p>
            </div>
          </div>

          <Section label="Absent" color="#DC2626" rows={digest.absent} />
          <Section label="Late" color="#C47A20" rows={digest.late} />
          <Section label="Excused" color="#5B6EC4" rows={digest.excused} />
        </>
      )}
    </div>
  )
}

// ── Analytics Tab ────────────────────────────────────────────

function AnalyticsTab() {
  const toast = useToast()
  const [exportStart, setExportStart] = useState(todayString())
  const [exportEnd, setExportEnd] = useState(todayString())

  const { data: stats } = useApi<AttendanceAnalytics>(() => api.attendance.analytics(), [])

  const handleExport = async () => {
    try {
      await api.attendance.exportCSV(exportStart, exportEnd)
      toast.success('CSV export started')
    } catch (err: any) {
      toast.error(err.message || 'Export failed')
    }
  }

  if (!stats) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">Loading analytics...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Today', value: `${stats.todayRate}%`, color: '#2D8B4E' },
          { label: 'This Week', value: `${stats.weekRate}%`, color: '#5B6EC4' },
          { label: 'This Month', value: `${stats.monthRate}%`, color: '#C47A20' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 mb-1">Attendance Rate {card.label}</p>
            <p className="text-3xl font-extrabold" style={{ color: card.color }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Most absent students */}
      {stats.mostAbsent && stats.mostAbsent.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-bold text-slate-700 mb-3">Most Absent Students</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-2 font-semibold">Student</th>
                <th className="pb-2 font-semibold">Class</th>
                <th className="pb-2 font-semibold text-right">Absences</th>
              </tr>
            </thead>
            <tbody>
              {stats.mostAbsent.map((s, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2 font-medium text-slate-800">{s.studentName}</td>
                  <td className="py-2 text-slate-500">{s.className}</td>
                  <td className="py-2 text-right font-bold" style={{ color: '#DC2626' }}>
                    {s.absences}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Absence reasons */}
      {stats.byReason && Object.keys(stats.byReason).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-bold text-slate-700 mb-3">Absence Reasons</p>
          <div className="space-y-2">
            {Object.entries(stats.byReason).map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{reason}</span>
                <span className="text-sm font-bold text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSV export */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-bold text-slate-700 mb-3">Export Attendance Data</p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Start Date</label>
            <input
              type="date"
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-pink-200"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">End Date</label>
            <input
              type="date"
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-pink-200"
            />
          </div>
          <button
            onClick={handleExport}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-bold flex items-center gap-2 transition-all"
            style={{ backgroundColor: '#C4506E' }}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────

export function AttendancePage() {
  const [activeTab, setActiveTab] = useState<Tab>('take')

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'take', label: 'Take Attendance', icon: <Check className="w-4 h-4" /> },
    { key: 'digest', label: "Today's Absences", icon: <Mail className="w-4 h-4" /> },
    { key: 'requests', label: 'Requests', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'analytics', label: 'Analytics', icon: <TrendingUp className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-800">Attendance</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex-1 justify-center"
            style={{
              backgroundColor: activeTab === tab.key ? 'white' : 'transparent',
              color: activeTab === tab.key ? '#C4506E' : '#64748B',
              boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'take' && <TakeAttendanceTab />}
      {activeTab === 'digest' && <TodaysAbsencesTab />}
      {activeTab === 'requests' && <RequestsTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
    </div>
  )
}
