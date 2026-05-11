import React, { useState, useMemo } from 'react'
import {
  Plus,
  X,
  Trash2,
  Calendar,
  User,
  Users,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Video,
  MapPin,
  Clock,
  Copy,
} from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type { ConsultationEvent, ConsultationTeacher, ConsultationStatus, ConsultationLocationType } from '@wasil/shared'

interface StaffMember {
  id: string
  name: string
  email: string
  role: string
}

interface ConsultationForm {
  title: string
  description: string
  date: string
  endDate: string
  slotDuration: number
  breakDuration: number
  targetClass: string
}

const emptyForm: ConsultationForm = {
  title: '',
  description: '',
  date: '',
  endDate: '',
  slotDuration: 10,
  breakDuration: 0,
  targetClass: '',
}

interface TeacherForm {
  teacherId: string
  location: string
  locationType: ConsultationLocationType
  startTime: string
  endTime: string
}

const emptyTeacherForm: TeacherForm = {
  teacherId: '',
  location: '',
  locationType: 'IN_PERSON',
  startTime: '15:30',
  endTime: '19:00',
}

interface AvailabilityWindow {
  date: string
  startTime: string
  endTime: string
}

function getWeekdayDates(startDate: string, endDate?: string): string[] {
  const dates: string[] = []
  const start = new Date(startDate + 'T00:00:00')
  const end = endDate ? new Date(endDate + 'T00:00:00') : start
  const d = new Date(start)
  while (d <= end) {
    if (d.getDay() >= 1 && d.getDay() <= 5) dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

const LOCATION_TYPE_OPTIONS: { value: ConsultationLocationType; label: string }[] = [
  { value: 'IN_PERSON', label: 'In Person' },
  { value: 'GOOGLE_MEET', label: 'Google Meet' },
  { value: 'ZOOM', label: 'Zoom' },
  { value: 'TEAMS', label: 'Microsoft Teams' },
  { value: 'CUSTOM', label: 'Custom' },
]

const LOCATION_TYPE_LABELS: Record<string, string> = {
  IN_PERSON: 'In Person',
  GOOGLE_MEET: 'Google Meet',
  ZOOM: 'Zoom',
  TEAMS: 'Teams',
  CUSTOM: 'Custom',
}

const STATUS_ACTIONS: Record<ConsultationStatus, { next: ConsultationStatus; label: string; color: string }[]> = {
  DRAFT: [{ next: 'PUBLISHED', label: 'Publish', color: '#5B6EC4' }],
  PUBLISHED: [{ next: 'BOOKING_OPEN', label: 'Open Bookings', color: '#2D8B4E' }, { next: 'DRAFT', label: 'Revert to Draft', color: '#9CA3AF' }],
  BOOKING_OPEN: [{ next: 'BOOKING_CLOSED', label: 'Close Bookings', color: '#C47A20' }],
  BOOKING_CLOSED: [{ next: 'COMPLETED', label: 'Mark Complete', color: '#2D8B4E' }, { next: 'BOOKING_OPEN', label: 'Reopen Bookings', color: '#5B6EC4' }],
  COMPLETED: [],
}

const STATUS_OPTIONS: { value: ConsultationStatus; label: string; color: string }[] = [
  { value: 'DRAFT', label: 'Draft', color: '#9CA3AF' },
  { value: 'PUBLISHED', label: 'Published', color: '#5B6EC4' },
  { value: 'BOOKING_OPEN', label: 'Booking Open', color: '#2D8B4E' },
  { value: 'BOOKING_CLOSED', label: 'Booking Closed', color: '#C47A20' },
  { value: 'COMPLETED', label: 'Completed', color: '#7A6469' },
]

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

type ViewMode = 'list' | 'create' | 'detail'

export function ConsultationsPage() {
  const theme = useTheme()
  const toast = useToast()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [form, setForm] = useState<ConsultationForm>(emptyForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ConsultationEvent | null>(null)
  const [showTeacherForm, setShowTeacherForm] = useState(false)
  const [teacherForm, setTeacherForm] = useState<TeacherForm>(emptyTeacherForm)
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([])
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null)
  const [sameTimeStart, setSameTimeStart] = useState('15:30')
  const [sameTimeEnd, setSameTimeEnd] = useState('19:00')
  const [removeTeacherTarget, setRemoveTeacherTarget] = useState<{ consultationId: string; ctId: string; name: string } | null>(null)
  const [customSlotForm, setCustomSlotForm] = useState<{ ctId: string; startTime: string; endTime: string; date?: string } | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)

  const { data: consultations, refetch } = useApi<ConsultationEvent[]>(
    () => api.consultations.list(),
    []
  )

  const { data: staffList } = useApi<StaffMember[]>(
    () => api.staff.list(),
    []
  )

  const selectedConsultation = useMemo(() => {
    if (!selectedId || !consultations) return null
    return consultations.find(c => c.id === selectedId) || null
  }, [selectedId, consultations])

  // Compute weekday dates for the selected consultation
  const consultationDates = useMemo(() => {
    if (!selectedConsultation) return []
    return getWeekdayDates(selectedConsultation.date, selectedConsultation.endDate || undefined)
  }, [selectedConsultation])

  // Initialize availability windows when opening teacher form
  const openTeacherForm = (existingTeacher?: ConsultationTeacher) => {
    if (existingTeacher) {
      setEditingTeacherId(existingTeacher.id)
      setTeacherForm({
        teacherId: existingTeacher.teacherId,
        location: existingTeacher.location || '',
        locationType: existingTeacher.locationType || 'IN_PERSON',
        startTime: existingTeacher.startTime,
        endTime: existingTeacher.endTime,
      })
      // Load existing availability windows or fall back to flat startTime/endTime
      if (existingTeacher.availabilityWindows && existingTeacher.availabilityWindows.length > 0) {
        setAvailabilityWindows(existingTeacher.availabilityWindows.map(w => ({
          date: w.date,
          startTime: w.startTime,
          endTime: w.endTime,
        })))
      } else {
        // Backwards compat: populate from flat startTime/endTime across all dates
        const dates = getWeekdayDates(
          selectedConsultation!.date,
          selectedConsultation!.endDate || undefined
        )
        setAvailabilityWindows(dates.map(date => ({
          date,
          startTime: existingTeacher.startTime,
          endTime: existingTeacher.endTime,
        })))
      }
    } else {
      setEditingTeacherId(null)
      setTeacherForm(emptyTeacherForm)
      // Start with empty windows for each date
      setAvailabilityWindows([])
    }
    setShowTeacherForm(true)
  }

  const addWindowForDate = (date: string) => {
    setAvailabilityWindows(prev => [...prev, { date, startTime: '', endTime: '' }])
  }

  const removeWindow = (date: string, index: number) => {
    setAvailabilityWindows(prev => {
      const windowsForDate = prev.filter(w => w.date === date)
      const otherWindows = prev.filter(w => w.date !== date)
      windowsForDate.splice(index, 1)
      return [...otherWindows, ...windowsForDate]
    })
  }

  const updateWindow = (date: string, index: number, field: 'startTime' | 'endTime', value: string) => {
    setAvailabilityWindows(prev => {
      const updated = [...prev]
      let count = 0
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].date === date) {
          if (count === index) {
            updated[i] = { ...updated[i], [field]: value }
            break
          }
          count++
        }
      }
      return updated
    })
  }

  const applySameTimeEveryDay = () => {
    if (!sameTimeStart || !sameTimeEnd) {
      toast.error('Please enter both start and end times')
      return
    }
    if (sameTimeStart >= sameTimeEnd) {
      toast.error('Start time must be before end time')
      return
    }
    const dates = consultationDates
    setAvailabilityWindows(dates.map(date => ({
      date,
      startTime: sameTimeStart,
      endTime: sameTimeEnd,
    })))
  }

  // Compute booking stats from consultation teachers
  const getStats = (c: ConsultationEvent) => {
    let totalSlots = 0
    let bookedSlots = 0
    c.teachers?.forEach(t => {
      t.slots?.forEach(s => {
        if (!s.isBreak) {
          totalSlots++
          if (s.booking) bookedSlots++
        }
      })
    })
    return { totalSlots, bookedSlots }
  }

  const handleCreate = async () => {
    setIsSubmitting(true)
    try {
      await api.consultations.create({
        title: form.title,
        description: form.description || undefined,
        date: form.date,
        endDate: form.endDate || undefined,
        slotDuration: form.slotDuration,
        breakDuration: form.breakDuration,
        targetClass: form.targetClass || undefined,
      })
      setForm(emptyForm)
      setViewMode('list')
      await refetch()
    } catch (err) {
      console.error('Failed to create consultation:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStatusChange = async (id: string, status: ConsultationStatus) => {
    try {
      await api.consultations.update(id, { status })
      await refetch()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.consultations.delete(deleteTarget.id)
      if (selectedId === deleteTarget.id) {
        setSelectedId(null)
        setViewMode('list')
      }
      setDeleteTarget(null)
      await refetch()
    } catch (err) {
      console.error('Failed to delete consultation:', err)
    }
  }

  const handleAddTeacher = async () => {
    if (!selectedId || !teacherForm.teacherId) return
    // Validate that there's at least one complete window
    const validWindows = availabilityWindows.filter(w => w.startTime && w.endTime)
    if (validWindows.length === 0) {
      toast.error('Please add at least one availability window')
      return
    }
    // Validate all windows have start < end
    for (const w of validWindows) {
      if (w.startTime >= w.endTime) {
        toast.error(`Invalid time window on ${formatDayHeader(w.date)}: start must be before end`)
        return
      }
    }
    // Compute backwards-compat startTime/endTime from earliest/latest across all windows
    const allStarts = validWindows.map(w => w.startTime).sort()
    const allEnds = validWindows.map(w => w.endTime).sort()
    const earliestStart = allStarts[0]
    const latestEnd = allEnds[allEnds.length - 1]

    setIsSubmitting(true)
    try {
      if (editingTeacherId) {
        // Update existing teacher's availability windows
        await api.consultations.updateTeacherAvailability(selectedId, editingTeacherId, validWindows)
      } else {
        await api.consultations.addTeacher(selectedId, {
          teacherId: teacherForm.teacherId,
          location: teacherForm.location || undefined,
          locationType: teacherForm.locationType,
          startTime: earliestStart,
          endTime: latestEnd,
          availabilityWindows: validWindows,
        })
      }
      setTeacherForm(emptyTeacherForm)
      setAvailabilityWindows([])
      setShowTeacherForm(false)
      setEditingTeacherId(null)
      await refetch()
    } catch (err) {
      console.error('Failed to save teacher:', err)
      toast.error(editingTeacherId ? 'Failed to update availability' : 'Failed to add teacher')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveTeacher = async () => {
    if (!removeTeacherTarget) return
    try {
      await api.consultations.removeTeacher(removeTeacherTarget.consultationId, removeTeacherTarget.ctId)
      setRemoveTeacherTarget(null)
      await refetch()
    } catch (err) {
      console.error('Failed to remove teacher:', err)
    }
  }

  const handleAddCustomSlot = async () => {
    if (!selectedId || !customSlotForm) return
    setSlotError(null)
    setIsSubmitting(true)
    try {
      await api.consultations.addCustomSlot(selectedId, customSlotForm.ctId, {
        startTime: customSlotForm.startTime,
        endTime: customSlotForm.endTime,
        ...(customSlotForm.date && { date: customSlotForm.date }),
      })
      setCustomSlotForm(null)
      await refetch()
    } catch (err: any) {
      setSlotError(err.message || 'Failed to add custom slot')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSlot = async (ctId: string, slotId: string) => {
    if (!selectedId) return
    try {
      await api.consultations.deleteSlot(selectedId, ctId, slotId)
      await refetch()
    } catch (err: any) {
      console.error('Failed to delete slot:', err)
    }
  }

  const openDetail = (id: string) => {
    setSelectedId(id)
    setViewMode('detail')
  }

  // ========================
  // Detail View
  // ========================
  if (viewMode === 'detail' && selectedConsultation) {
    const stats = getStats(selectedConsultation)
    const statusOption = STATUS_OPTIONS.find(s => s.value === selectedConsultation.status)

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => { setViewMode('list'); setSelectedId(null) }}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">{selectedConsultation.title}</h1>
              <p className="text-sm text-gray-500">
                {formatDate(selectedConsultation.date)}
                {selectedConsultation.endDate && selectedConsultation.endDate !== selectedConsultation.date
                  ? ` - ${formatDate(selectedConsultation.endDate)}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {selectedConsultation.status === 'DRAFT' && (
              <button
                onClick={() => setDeleteTarget(selectedConsultation)}
                className="p-2 rounded-lg text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Status & Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-500">Status</span>
              <div className="flex items-center space-x-2 mt-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: statusOption?.color }}
                />
                <span className="font-semibold">{statusOption?.label}</span>
              </div>
            </div>
            <div className="flex space-x-2">
              {(STATUS_ACTIONS[selectedConsultation.status] || []).map(action => (
                <button
                  key={action.next}
                  onClick={() => handleStatusChange(selectedConsultation.id, action.next)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg text-white"
                  style={{ backgroundColor: action.color }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Slot Duration</p>
              <p className="font-semibold">{selectedConsultation.slotDuration} min</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Break Between</p>
              <p className="font-semibold">{selectedConsultation.breakDuration} min</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Utilization</p>
              <p className="font-semibold">
                {stats.bookedSlots} / {stats.totalSlots} slots
                {stats.totalSlots > 0 && (
                  <span className="text-gray-400 ml-1">
                    ({Math.round((stats.bookedSlots / stats.totalSlots) * 100)}%)
                  </span>
                )}
              </p>
            </div>
          </div>

          {selectedConsultation.description && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">Description</p>
              <p className="text-sm text-gray-700 mt-1">{selectedConsultation.description}</p>
            </div>
          )}
        </div>

        {/* Teachers Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Teachers</h2>
            <button
              onClick={() => openTeacherForm()}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-white text-sm font-semibold"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              <Plus className="h-4 w-4" />
              <span>Add Teacher</span>
            </button>
          </div>

          {selectedConsultation.teachers && selectedConsultation.teachers.length > 0 ? (
            <div className="space-y-4">
              {selectedConsultation.teachers.map(teacher => {
                const teacherSlots = teacher.slots?.filter(s => !s.isBreak) || []
                const autoSlots = teacherSlots.filter(s => !s.isCustom)
                const customSlots = teacherSlots.filter(s => s.isCustom)
                const booked = teacherSlots.filter(s => s.booking).length
                const locLabel = LOCATION_TYPE_LABELS[teacher.locationType || 'IN_PERSON'] || 'In Person'
                const isVideoType = ['GOOGLE_MEET', 'ZOOM', 'TEAMS'].includes(teacher.locationType || '')

                return (
                  <div key={teacher.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                    {/* Teacher header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <User className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="font-semibold">{teacher.teacherName}</p>
                          <div className="flex items-center space-x-2 text-xs text-gray-400">
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-0.5" />
                              {teacher.startTime} - {teacher.endTime}
                            </span>
                            {teacher.location && (
                              <span className="flex items-center">
                                <MapPin className="h-3 w-3 mr-0.5" />{teacher.location}
                              </span>
                            )}
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 text-xs font-semibold"
                              style={{
                                borderRadius: '8px',
                                backgroundColor: isVideoType ? '#EEF0FF' : '#F0F9F4',
                                color: isVideoType ? '#5B6EC4' : '#2D8B4E',
                              }}
                            >
                              {isVideoType && <Video className="h-3 w-3 mr-0.5" />}
                              {locLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs text-gray-500">
                          {booked}/{teacherSlots.length} booked
                        </span>
                        <button
                          onClick={() => setRemoveTeacherTarget({
                            consultationId: selectedConsultation.id,
                            ctId: teacher.id,
                            name: teacher.teacherName,
                          })}
                          className="p-1 text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Auto-generated slots grid (grouped by date for multi-day) */}
                    {autoSlots.length > 0 && (() => {
                      const slotsByDate: Record<string, typeof autoSlots> = {}
                      autoSlots.forEach(slot => {
                        const d = slot.date || selectedConsultation.date
                        if (!slotsByDate[d]) slotsByDate[d] = []
                        slotsByDate[d].push(slot)
                      })
                      const dateKeys = Object.keys(slotsByDate).sort()
                      const isMultiDay = dateKeys.length > 1

                      return (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">
                            Generated Slots ({autoSlots.length})
                          </p>
                          {dateKeys.map(dateKey => (
                            <div key={dateKey} className={isMultiDay ? 'mb-3' : ''}>
                              {isMultiDay && (
                                <p className="text-xs font-semibold text-gray-600 mb-1">
                                  {new Date(dateKey + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                                  {' '}({slotsByDate[dateKey].length} slots)
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {slotsByDate[dateKey].map(slot => (
                                  <div
                                    key={slot.id}
                                    className="group relative px-2 py-1 text-xs border"
                                    style={{
                                      borderRadius: '8px',
                                      backgroundColor: slot.booking ? '#E8F5EC' : '#F9FAFB',
                                      borderColor: slot.booking ? '#BBE5C7' : '#E5E7EB',
                                      color: slot.booking ? '#2D8B4E' : '#6B7280',
                                    }}
                                    title={slot.booking ? `${(slot.booking as any).parentName || 'Booked'} - ${slot.booking.studentName}` : 'Available'}
                                  >
                                    {slot.startTime}
                                    {slot.booking && (
                                      <span className="ml-1 font-medium">{slot.booking.studentName}</span>
                                    )}
                                    {!slot.booking && (
                                      <button
                                        onClick={() => handleDeleteSlot(teacher.id, slot.id)}
                                        className="hidden group-hover:inline-block ml-1 text-red-400 hover:text-red-600"
                                        title="Delete slot"
                                      >
                                        <X className="h-3 w-3 inline" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {/* Custom slots section */}
                    <div className="pt-2 border-t border-gray-50">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium text-gray-500">
                          Custom Slots {customSlots.length > 0 && `(${customSlots.length})`}
                        </p>
                        <button
                          onClick={() => {
                            setCustomSlotForm({ ctId: teacher.id, startTime: '', endTime: '', date: selectedConsultation.date })
                            setSlotError(null)
                          }}
                          className="flex items-center text-xs font-semibold px-2 py-1 hover:bg-gray-50"
                          style={{ borderRadius: '8px', color: theme.colors.brandColor }}
                        >
                          <Plus className="h-3 w-3 mr-0.5" />
                          Add Slot
                        </button>
                      </div>

                      {customSlots.length > 0 && (() => {
                        const customByDate: Record<string, typeof customSlots> = {}
                        customSlots.forEach(slot => {
                          const d = slot.date || selectedConsultation.date
                          if (!customByDate[d]) customByDate[d] = []
                          customByDate[d].push(slot)
                        })
                        const customDateKeys = Object.keys(customByDate).sort()
                        const isMultiDayCustom = customDateKeys.length > 1 || (selectedConsultation.endDate && selectedConsultation.endDate !== selectedConsultation.date)

                        return (
                          <div className="mb-2">
                            {customDateKeys.map(dateKey => (
                              <div key={dateKey} className={isMultiDayCustom ? 'mb-2' : ''}>
                                {isMultiDayCustom && (
                                  <p className="text-xs font-semibold text-gray-600 mb-1">
                                    {new Date(dateKey + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                  {customByDate[dateKey].map(slot => (
                                    <div
                                      key={slot.id}
                                      className="group relative flex items-center px-2 py-1 text-xs border"
                                      style={{
                                        borderRadius: '8px',
                                        backgroundColor: slot.booking ? '#E8F5EC' : '#FFF8F0',
                                        borderColor: slot.booking ? '#BBE5C7' : '#F0DCC8',
                                        color: slot.booking ? '#2D8B4E' : '#A06828',
                                      }}
                                      title={slot.booking ? `${(slot.booking as any).parentName || 'Booked'} - ${slot.booking.studentName}` : 'Custom slot'}
                                    >
                                      <span>{slot.startTime}-{slot.endTime}</span>
                                      {slot.booking && (
                                        <span className="ml-1 font-medium">{slot.booking.studentName}</span>
                                      )}
                                      {!slot.booking && (
                                        <button
                                          onClick={() => handleDeleteSlot(teacher.id, slot.id)}
                                          className="ml-1 text-red-400 hover:text-red-600"
                                          title="Remove custom slot"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {/* Inline custom slot form */}
                      {customSlotForm && customSlotForm.ctId === teacher.id && (
                        <div className="flex items-end gap-2 p-2 bg-gray-50 flex-wrap" style={{ borderRadius: '10px' }}>
                          {selectedConsultation.endDate && selectedConsultation.endDate !== selectedConsultation.date && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Date</label>
                              <select
                                value={customSlotForm.date || selectedConsultation.date}
                                onChange={(e) => {
                                  setCustomSlotForm({ ...customSlotForm, date: e.target.value })
                                  setSlotError(null)
                                }}
                                className="px-2 py-1 text-xs border border-gray-200 text-gray-700"
                                style={{ borderRadius: '8px' }}
                              >
                                {(() => {
                                  const options: string[] = []
                                  const start = new Date(selectedConsultation.date + 'T00:00:00')
                                  const end = new Date(selectedConsultation.endDate + 'T00:00:00')
                                  const cur = new Date(start)
                                  while (cur <= end) {
                                    options.push(cur.toISOString().split('T')[0])
                                    cur.setDate(cur.getDate() + 1)
                                  }
                                  return options.map(d => (
                                    <option key={d} value={d}>
                                      {new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </option>
                                  ))
                                })()}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Start</label>
                            <input
                              type="time"
                              value={customSlotForm.startTime}
                              onChange={(e) => {
                                setCustomSlotForm({ ...customSlotForm, startTime: e.target.value })
                                setSlotError(null)
                              }}
                              className="px-2 py-1 text-xs border border-gray-200 text-gray-700"
                              style={{ borderRadius: '8px' }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">End</label>
                            <input
                              type="time"
                              value={customSlotForm.endTime}
                              onChange={(e) => {
                                setCustomSlotForm({ ...customSlotForm, endTime: e.target.value })
                                setSlotError(null)
                              }}
                              className="px-2 py-1 text-xs border border-gray-200 text-gray-700"
                              style={{ borderRadius: '8px' }}
                            />
                          </div>
                          <button
                            onClick={handleAddCustomSlot}
                            disabled={isSubmitting || !customSlotForm.startTime || !customSlotForm.endTime}
                            className="px-3 py-1 text-xs font-semibold text-white"
                            style={{
                              borderRadius: '8px',
                              backgroundColor: theme.colors.brandColor,
                              opacity: isSubmitting || !customSlotForm.startTime || !customSlotForm.endTime ? 0.5 : 1,
                            }}
                          >
                            {isSubmitting ? '...' : 'Add'}
                          </button>
                          <button
                            onClick={() => { setCustomSlotForm(null); setSlotError(null) }}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                          {slotError && (
                            <span className="text-xs text-red-500 ml-1">{slotError}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">
              No teachers added yet. Add teachers to generate booking slots.
            </p>
          )}
        </div>

        {/* Bookings Table */}
        {selectedConsultation.teachers && selectedConsultation.teachers.some(t => t.slots?.some(s => s.booking)) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-bold mb-4">All Bookings</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Time</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Teacher</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Parent</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Student</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Type</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedConsultation.teachers
                    .flatMap(t =>
                      (t.slots || [])
                        .filter(s => s.booking)
                        .map(s => ({
                          time: s.startTime,
                          endTime: s.endTime,
                          date: s.date || selectedConsultation.date,
                          teacherName: t.teacherName,
                          location: t.location,
                          locationType: t.locationType || 'IN_PERSON',
                          parentName: (s.booking as any)?.parentName || 'N/A',
                          studentName: s.booking!.studentName,
                          notes: s.booking!.notes,
                          meetingLink: s.booking!.meetingLink,
                        }))
                    )
                    .sort((a, b) => {
                      if (a.date !== b.date) return a.date.localeCompare(b.date)
                      return a.time.localeCompare(b.time)
                    })
                    .map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 font-mono">
                          {selectedConsultation.endDate && selectedConsultation.endDate !== selectedConsultation.date && (
                            <span className="text-gray-400 mr-1">
                              {new Date(row.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          {row.time} - {row.endTime}
                        </td>
                        <td className="py-2 px-3">{row.teacherName}</td>
                        <td className="py-2 px-3">{row.parentName}</td>
                        <td className="py-2 px-3">{row.studentName}</td>
                        <td className="py-2 px-3">
                          <span className="text-xs">
                            {LOCATION_TYPE_LABELS[row.locationType] || 'In Person'}
                          </span>
                          {row.meetingLink && (
                            <a
                              href={row.meetingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-xs font-semibold"
                              style={{ color: '#5B6EC4' }}
                            >
                              Link
                            </a>
                          )}
                        </td>
                        <td className="py-2 px-3 text-gray-400 max-w-48 truncate">{row.notes || '-'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Add/Edit Teacher Modal */}
        {showTeacherForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{editingTeacherId ? 'Edit Teacher' : 'Add Teacher'}</h3>
                <button onClick={() => { setShowTeacherForm(false); setEditingTeacherId(null); setAvailabilityWindows([]) }}>
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                  <select
                    value={teacherForm.teacherId}
                    onChange={(e) => setTeacherForm({ ...teacherForm, teacherId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 text-sm"
                    style={{ borderRadius: '14px' }}
                    disabled={!!editingTeacherId}
                  >
                    <option value="">Select a teacher...</option>
                    {staffList?.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location Type</label>
                  <select
                    value={teacherForm.locationType}
                    onChange={(e) => setTeacherForm({ ...teacherForm, locationType: e.target.value as ConsultationLocationType })}
                    className="w-full px-3 py-2 text-sm"
                    style={{ borderRadius: '14px', border: '1.5px solid #E5E0E2' }}
                  >
                    {LOCATION_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={teacherForm.location}
                    onChange={(e) => setTeacherForm({ ...teacherForm, location: e.target.value })}
                    placeholder={teacherForm.locationType === 'IN_PERSON' ? 'e.g., Room 3A' : 'Optional meeting URL or room'}
                    className="w-full px-3 py-2 text-sm"
                    style={{ borderRadius: '14px', border: '1.5px solid #E5E0E2' }}
                  />
                </div>

                {/* Availability Windows Editor */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-bold text-gray-700">Availability Windows</label>
                  </div>

                  {/* Same time every day quick-fill */}
                  <div className="flex items-end gap-2 mb-4 p-3 border border-gray-200 bg-white" style={{ borderRadius: '12px' }}>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Start</label>
                      <input
                        type="time"
                        value={sameTimeStart}
                        onChange={(e) => setSameTimeStart(e.target.value)}
                        className="px-2 py-1.5 text-sm border border-gray-200"
                        style={{ borderRadius: '10px' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">End</label>
                      <input
                        type="time"
                        value={sameTimeEnd}
                        onChange={(e) => setSameTimeEnd(e.target.value)}
                        className="px-2 py-1.5 text-sm border border-gray-200"
                        style={{ borderRadius: '10px' }}
                      />
                    </div>
                    <button
                      onClick={applySameTimeEveryDay}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold border-2 hover:bg-gray-50"
                      style={{ borderRadius: '10px', borderColor: theme.colors.brandColor, color: theme.colors.brandColor }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Same time every day
                    </button>
                  </div>

                  {/* Day-by-day grid */}
                  <div className="space-y-2">
                    {consultationDates.map(date => {
                      const windowsForDate = availabilityWindows
                        .map((w, idx) => ({ ...w, originalIndex: idx }))
                        .filter(w => w.date === date)
                      // We need the index within this date's windows for removal
                      let dateWindowIndex = -1

                      return (
                        <div key={date} className="p-3 bg-slate-50" style={{ borderRadius: '12px' }}>
                          <p className="text-sm font-bold text-gray-700 mb-2">{formatDayHeader(date)}</p>

                          {windowsForDate.length > 0 ? (
                            <div className="space-y-1.5">
                              {windowsForDate.map((w) => {
                                dateWindowIndex++
                                const currentDateIdx = dateWindowIndex
                                return (
                                  <div key={`${date}-${currentDateIdx}`} className="flex items-center gap-2">
                                    <input
                                      type="time"
                                      value={w.startTime}
                                      onChange={(e) => updateWindow(date, currentDateIdx, 'startTime', e.target.value)}
                                      className="px-2 py-1 text-sm border border-gray-200 bg-white"
                                      style={{ borderRadius: '8px' }}
                                    />
                                    <span className="text-gray-400 text-sm">-</span>
                                    <input
                                      type="time"
                                      value={w.endTime}
                                      onChange={(e) => updateWindow(date, currentDateIdx, 'endTime', e.target.value)}
                                      className="px-2 py-1 text-sm border border-gray-200 bg-white"
                                      style={{ borderRadius: '8px' }}
                                    />
                                    <button
                                      onClick={() => removeWindow(date, currentDateIdx)}
                                      className="p-1 text-gray-400 hover:text-red-500"
                                      title="Remove window"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic mb-1">(No availability)</p>
                          )}

                          <button
                            onClick={() => addWindowForDate(date)}
                            className="flex items-center text-xs font-semibold mt-1.5 px-1 py-0.5 hover:underline"
                            style={{ color: theme.colors.brandColor }}
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            Add window
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {consultationDates.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No weekday dates found for this consultation's date range.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => { setShowTeacherForm(false); setEditingTeacherId(null); setAvailabilityWindows([]) }}
                  className="flex-1 py-2 px-4 border border-gray-200 text-sm font-medium hover:bg-gray-50"
                  style={{ borderRadius: '14px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTeacher}
                  disabled={isSubmitting || !teacherForm.teacherId}
                  className="flex-1 py-2 px-4 text-sm font-semibold text-white"
                  style={{ borderRadius: '14px', backgroundColor: theme.colors.brandColor, opacity: isSubmitting || !teacherForm.teacherId ? 0.6 : 1 }}
                >
                  {isSubmitting ? 'Saving...' : editingTeacherId ? 'Update Teacher' : 'Add Teacher'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {deleteTarget && (
          <ConfirmModal
            title="Delete Consultation"
            message={`Are you sure you want to delete "${deleteTarget.title}"? This action cannot be undone.`}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}

        {/* Remove teacher confirm */}
        {removeTeacherTarget && (
          <ConfirmModal
            title="Remove Teacher"
            message={`Remove ${removeTeacherTarget.name} and all their slots/bookings?`}
            confirmLabel="Remove"
            variant="danger"
            onConfirm={handleRemoveTeacher}
            onCancel={() => setRemoveTeacherTarget(null)}
          />
        )}
      </div>
    )
  }

  // ========================
  // Create Form View
  // ========================
  if (viewMode === 'create') {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => { setViewMode('list'); setForm(emptyForm) }}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold">New Consultation</h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Spring Term Parents' Evening"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description for parents"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date (multi-day)</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slot Duration (min)</label>
              <input
                type="number"
                value={form.slotDuration}
                onChange={(e) => setForm({ ...form, slotDuration: parseInt(e.target.value) || 10 })}
                min={5}
                max={60}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Break Between (min)</label>
              <input
                type="number"
                value={form.breakDuration}
                onChange={(e) => setForm({ ...form, breakDuration: parseInt(e.target.value) || 0 })}
                min={0}
                max={30}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Class (optional)</label>
            <input
              type="text"
              value={form.targetClass}
              onChange={(e) => setForm({ ...form, targetClass: e.target.value })}
              placeholder="Leave empty for whole school"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              onClick={() => { setViewMode('list'); setForm(emptyForm) }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isSubmitting || !form.title || !form.date}
              className="px-6 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: theme.colors.brandColor, opacity: isSubmitting || !form.title || !form.date ? 0.6 : 1 }}
            >
              {isSubmitting ? 'Creating...' : 'Create Consultation'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ========================
  // List View
  // ========================
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Parent Consultations</h1>
        <button
          onClick={() => setViewMode('create')}
          className="flex items-center space-x-1 px-4 py-2 rounded-lg text-white text-sm font-semibold"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <Plus className="h-4 w-4" />
          <span>New Consultation</span>
        </button>
      </div>

      {(!consultations || consultations.length === 0) ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No consultations yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first Parents' Evening consultation</p>
        </div>
      ) : (
        <div className="space-y-3">
          {consultations.map(c => {
            const stats = getStats(c)
            const statusOption = STATUS_OPTIONS.find(s => s.value === c.status)

            return (
              <div
                key={c.id}
                onClick={() => openDetail(c.id)}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-bold">{c.title}</h3>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${statusOption?.color}15`,
                          color: statusOption?.color,
                        }}
                      >
                        {statusOption?.label}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span className="flex items-center">
                        <Calendar className="h-3.5 w-3.5 mr-1" />
                        {formatDate(c.date)}
                        {c.endDate && c.endDate !== c.date ? ` - ${formatDate(c.endDate)}` : ''}
                      </span>
                      <span className="flex items-center">
                        <Users className="h-3.5 w-3.5 mr-1" />
                        {c.teachers?.length || 0} teachers
                      </span>
                      <span className="flex items-center">
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        {stats.bookedSlots}/{stats.totalSlots} booked
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 mt-1" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
