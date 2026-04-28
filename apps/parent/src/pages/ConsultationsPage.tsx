import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, Clock, MapPin, User, X, ChevronLeft, Video, ExternalLink } from 'lucide-react'
import { useApi, useAuth } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ConsultationEvent, ConsultationSlot, ConsultationTeacher } from '@wasil/shared'

type ViewMode = 'list' | 'booking'

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'Upcoming',
  BOOKING_OPEN: 'Book Now',
  BOOKING_CLOSED: 'Bookings Closed',
  COMPLETED: 'Completed',
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PUBLISHED: { bg: '#EEF0FF', text: '#5B6EC4' },
  BOOKING_OPEN: { bg: '#E8F5EC', text: '#2D8B4E' },
  BOOKING_CLOSED: { bg: '#FFF3E6', text: '#C47A20' },
  COMPLETED: { bg: '#F0E4E6', text: '#7A6469' },
}

const LOCATION_TYPE_LABELS: Record<string, string> = {
  IN_PERSON: 'In Person',
  GOOGLE_MEET: 'Video Call',
  ZOOM: 'Video Call',
  TEAMS: 'Video Call',
  CUSTOM: 'Custom',
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function ConsultationsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedConsultation, setSelectedConsultation] = useState<ConsultationEvent | null>(null)
  const [bookingSlot, setBookingSlot] = useState<{ slot: ConsultationSlot; teacher: ConsultationTeacher } | null>(null)
  const [bookingStudentId, setBookingStudentId] = useState('')
  const [bookingStudentName, setBookingStudentName] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [isBooking, setIsBooking] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const { data: consultations, refetch, isLoading } = useApi<ConsultationEvent[]>(
    () => api.consultations.parent.list(),
    []
  )

  // Get children from user (deduplicated, prefer studentLinks)
  const children = useMemo(() => {
    const kids: Array<{ id: string; name: string; className: string }> = []
    const seen = new Set<string>()
    user?.studentLinks?.forEach(l => {
      const name = l.studentName.trim()
      if (!seen.has(name)) { seen.add(name); kids.push({ id: l.studentId, name, className: l.className }) }
    })
    user?.children?.forEach(c => {
      const name = c.name.trim()
      if (!seen.has(name)) { seen.add(name); kids.push({ id: c.id, name, className: c.className }) }
    })
    return kids
  }, [user])

  // My bookings across all consultations
  const myBookings = useMemo(() => {
    if (!consultations || !user) return []
    const bookings: Array<{
      id: string
      teacherName: string
      location?: string | null
      locationType?: string
      startTime: string
      endTime: string
      studentName: string
      consultationTitle: string
      consultationDate: string
      consultationId: string
      meetingLink?: string | null
    }> = []

    consultations.forEach(c => {
      c.teachers?.forEach(teacher => {
        teacher.slots?.forEach(slot => {
          if (slot.booking && slot.booking.parentId === user.id) {
            bookings.push({
              id: slot.booking.id,
              teacherName: teacher.teacherName,
              location: teacher.location,
              locationType: teacher.locationType,
              startTime: slot.startTime,
              endTime: slot.endTime,
              studentName: slot.booking.studentName,
              consultationTitle: c.title,
              consultationDate: c.date,
              consultationId: c.id,
              meetingLink: slot.booking.meetingLink,
            })
          }
        })
      })
    })

    return bookings.sort((a, b) => {
      if (a.consultationDate !== b.consultationDate) return a.consultationDate.localeCompare(b.consultationDate)
      return a.startTime.localeCompare(b.startTime)
    })
  }, [consultations, user])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleOpenBooking = (consultation: ConsultationEvent) => {
    setSelectedConsultation(consultation)
    setSelectedDay(null)
    setViewMode('booking')
  }

  // Refetch list and sync selectedConsultation with fresh data
  const refetchAndSync = async () => {
    const fresh = await api.consultations.parent.list()
    if (selectedConsultation) {
      const updated = fresh.find((c: ConsultationEvent) => c.id === selectedConsultation.id)
      if (updated) setSelectedConsultation(updated)
    }
    return fresh
  }

  const handleBook = async () => {
    if (!bookingSlot || !bookingStudentId) return
    setIsBooking(true)
    try {
      await api.consultations.parent.book({
        slotId: bookingSlot.slot.id,
        studentId: bookingStudentId,
        studentName: bookingStudentName,
        notes: bookingNotes || undefined,
      })
      showToast(`Booked: ${bookingSlot.teacher.teacherName} at ${bookingSlot.slot.startTime}. Check your email for confirmation.`)
      setBookingSlot(null)
      setBookingNotes('')
      setBookingStudentId('')
      setBookingStudentName('')
      await refetchAndSync()
    } catch (err: any) {
      showToast(err.message || 'Failed to book appointment')
    } finally {
      setIsBooking(false)
    }
  }

  const handleCancel = async (bookingId: string) => {
    try {
      // Optimistically remove booking from local state for instant visual feedback
      setSelectedConsultation(prev => {
        if (!prev) return prev
        return {
          ...prev,
          teachers: prev.teachers?.map(t => ({
            ...t,
            slots: t.slots?.map(s =>
              s.booking?.id === bookingId ? { ...s, booking: null } : s
            ),
          })),
        } as typeof prev
      })
      await api.consultations.parent.cancelBooking(bookingId)
      showToast('Booking cancelled. Confirmation sent to your email.')
      await refetchAndSync()
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel booking')
      // Revert on error
      await refetchAndSync()
    }
  }

  // Compute effective selected day for multi-day consultations (derived from actual slot data)
  const effectiveDay = useMemo(() => {
    if (!selectedConsultation) return null

    const dateSet = new Set<string>()
    selectedConsultation.teachers?.forEach(t => {
      t.slots?.forEach(s => {
        if (!s.isBreak && s.date) dateSet.add(s.date)
      })
    })
    const dates = [...dateSet].sort()
    if (dates.length <= 1) return null // single day, no filtering needed

    if (selectedDay && dates.includes(selectedDay)) return selectedDay
    const today = new Date().toISOString().split('T')[0]
    return dates.find(d => d >= today) || dates[0]
  }, [selectedConsultation, selectedDay])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
            Parent Consultations
          </h1>
          <p className="text-sm mt-1" style={{ color: '#A8929A' }}>Book appointments with your child's teachers</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#C4506E' }} />
        </div>
      </div>
    )
  }

  // Booking flow view
  if (viewMode === 'booking' && selectedConsultation) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => { setViewMode('list'); setSelectedConsultation(null) }}
            className="flex items-center space-x-1 text-sm font-semibold mb-3"
            style={{ color: '#C4506E' }}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back to Consultations</span>
          </button>
          <h1 className="text-xl font-bold" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
            {selectedConsultation.title}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#A8929A' }}>
            {formatDate(selectedConsultation.date)}
            {selectedConsultation.endDate && selectedConsultation.endDate !== selectedConsultation.date
              ? ` - ${formatDate(selectedConsultation.endDate)}`
              : ''}
          </p>
        </div>

        {/* Day selector for multi-day consultations */}
        {(() => {
          // Derive available days from actual slot data (respects which days have slots)
          const dateSet = new Set<string>()
          selectedConsultation.teachers?.forEach(t => {
            t.slots?.forEach(s => {
              if (!s.isBreak && s.date) dateSet.add(s.date)
            })
          })
          const sortedDates = [...dateSet].sort()
          const isMultiDay = sortedDates.length > 1

          if (!isMultiDay) return null

          const activeDay = effectiveDay || sortedDates[0]

          return (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {sortedDates.map(dateKey => {
                const date = new Date(dateKey + 'T00:00:00')
                const isActive = activeDay === dateKey
                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDay(dateKey)}
                    className="flex flex-col items-center px-4 py-2.5 rounded-[16px] shrink-0 transition-all"
                    style={{
                      backgroundColor: isActive ? '#C4506E' : '#FFFFFF',
                      border: isActive ? '1.5px solid #C4506E' : '1.5px solid #F0E4E6',
                      minWidth: '72px',
                    }}
                  >
                    <span
                      className="text-[11px] font-bold uppercase"
                      style={{ color: isActive ? 'rgba(255,255,255,0.7)' : '#A8929A' }}
                    >
                      {date.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </span>
                    <span
                      className="text-[18px] font-extrabold leading-tight"
                      style={{ color: isActive ? '#FFFFFF' : '#2D2225' }}
                    >
                      {date.getDate()}
                    </span>
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: isActive ? 'rgba(255,255,255,0.7)' : '#A8929A' }}
                    >
                      {date.toLocaleDateString('en-GB', { month: 'short' })}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Child-centric booking view */}
        {children.map((child, childIdx) => {
          // Find teachers assigned to this child's class (class teacher)
          const classTeachers = selectedConsultation.teachers?.filter(t =>
            t.assignedClasses && t.assignedClasses.includes(child.className)
          ) || []
          // Non-class teachers (specialists + admin) — available to all children
          const specialistTeachers = selectedConsultation.teachers?.filter(t =>
            !t.assignedClasses || t.assignedClasses.length === 0
          ) || []
          const relevantTeachers = [...classTeachers, ...specialistTeachers]
          // Deduplicate by teacher id
          const seen = new Set<string>()
          const uniqueTeachers = relevantTeachers.filter(t => {
            if (seen.has(t.id)) return false
            seen.add(t.id)
            return true
          })

          if (uniqueTeachers.length === 0) return null

          const CHILD_COLORS = [
            'linear-gradient(135deg, #5B8EC4, #7BA8D9)',
            'linear-gradient(135deg, #5BA97B, #7BC49A)',
            'linear-gradient(135deg, #C4506E, #D97A93)',
            'linear-gradient(135deg, #E8A54B, #F0C078)',
          ]

          return (
            <div key={child.id}>
              {/* Child header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="flex items-center justify-center rounded-[16px] text-white font-extrabold"
                  style={{ width: '44px', height: '44px', background: CHILD_COLORS[childIdx % CHILD_COLORS.length], fontSize: '18px' }}
                >
                  {child.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-[16px] font-bold" style={{ color: '#2D2225' }}>{child.name}</h2>
                  <p className="text-[13px] font-semibold" style={{ color: '#A8929A' }}>{child.className}</p>
                </div>
              </div>

              {/* Teachers for this child */}
              <div className="space-y-4 mb-6">
                {uniqueTeachers.map(teacher => {
                  const isClassTeacher = classTeachers.some(ct => ct.id === teacher.id)
                  const isVideoType = ['GOOGLE_MEET', 'ZOOM', 'TEAMS'].includes(teacher.locationType || '')
                  const locationLabel = LOCATION_TYPE_LABELS[teacher.locationType || 'IN_PERSON'] || 'In Person'

                  return (
                    <div
                      key={teacher.id}
                      className="bg-white overflow-hidden"
                      style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                    >
                      {/* Teacher header */}
                      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #F0E4E6' }}>
                        <div
                          className="flex items-center justify-center rounded-full text-white font-bold"
                          style={{ width: '36px', height: '36px', backgroundColor: '#C4506E', fontSize: '13px' }}
                        >
                          {teacher.teacherName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="flex-1">
                          <p className="text-[14px] font-bold" style={{ color: '#2D2225' }}>{teacher.teacherName}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {(() => {
                              const positionLabel = teacher.teacherPosition || (
                                isClassTeacher ? 'Class Teacher'
                                : (teacher.teacherRole === 'ADMIN' || teacher.teacherRole === 'SUPER_ADMIN') ? 'Admin Team'
                                : 'Specialist'
                              )
                              const POSITION_COLORS: Record<string, { bg: string; text: string }> = {
                                'Class Teacher': { bg: '#EDF4FC', text: '#5B8EC4' },
                                'Teaching Assistant': { bg: '#EDF4FC', text: '#5B8EC4' },
                                'Leadership Team': { bg: '#FCF0ED', text: '#C47A5B' },
                                'Admin Team': { bg: '#FCF0ED', text: '#C47A5B' },
                                'SEN Coordinator': { bg: '#E8F5EC', text: '#2D8B4E' },
                                'Support Staff': { bg: '#F5EEF0', text: '#7A6469' },
                              }
                              const colors = POSITION_COLORS[positionLabel] || { bg: '#F3EEFC', text: '#8B6EAE' }
                              return (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: colors.bg, color: colors.text }}>
                                  {positionLabel}
                                </span>
                              )
                            })()}
                            {isVideoType ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5" style={{ backgroundColor: '#EEF0FF', color: '#5B6EC4' }}>
                                <Video className="h-3 w-3" />
                                {locationLabel}
                              </span>
                            ) : (
                              teacher.location && (
                                <span className="text-[11px] font-medium flex items-center gap-1" style={{ color: '#A8929A' }}>
                                  <MapPin className="h-3 w-3" />{teacher.location}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Time slots (filtered by selected day) */}
                      <div className="px-4 py-3">
                        {(() => {
                          const availableSlots = teacher.slots?.filter(s => !s.isBreak) || []

                          // Filter by effective day for multi-day consultations
                          const filteredSlots = effectiveDay
                            ? availableSlots.filter(s => s.date === effectiveDay)
                            : availableSlots

                          if (filteredSlots.length === 0) {
                            return (
                              <p className="text-sm py-3 text-center" style={{ color: '#A8929A' }}>
                                No slots available on this day
                              </p>
                            )
                          }

                          // Check if parent already has a booking with this teacher (any slot)
                          const allTeacherSlots = teacher.slots?.filter(s => !s.isBreak) || []
                          const myBookingWithTeacher = allTeacherSlots.find(s => s.booking && s.booking.parentId === user?.id)

                          return (
                            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                              {filteredSlots.map(slot => {
                                const isBookedByMe = slot.booking && slot.booking.parentId === user?.id
                                const isTaken = slot.booking && !isBookedByMe
                                const isOpen = selectedConsultation.status === 'BOOKING_OPEN'
                                const isCompleted = selectedConsultation.status === 'COMPLETED'
                                // Disable if parent already booked a different slot with this teacher
                                const alreadyBookedOtherSlot = !isBookedByMe && !!myBookingWithTeacher

                                return (
                                  <button
                                    key={slot.id}
                                    disabled={!!isTaken || (!isOpen && !isBookedByMe) || alreadyBookedOtherSlot || (!!isBookedByMe && isCompleted)}
                                    onClick={() => {
                                      if (isBookedByMe && slot.booking) {
                                        if (confirm(`Cancel your ${slot.startTime} appointment with ${teacher.teacherName}?`)) {
                                          handleCancel(slot.booking.id)
                                        }
                                        return
                                      }
                                      if (alreadyBookedOtherSlot) return
                                      setBookingSlot({ slot, teacher })
                                      setBookingStudentId(child.id)
                                      setBookingStudentName(child.name)
                                    }}
                                    className="p-2 text-center transition-all relative"
                                    style={{
                                      borderRadius: '12px',
                                      border: isBookedByMe
                                        ? '2px solid #C4506E'
                                        : isTaken
                                        ? '1.5px solid #E8E0E2'
                                        : '1.5px solid #F0E4E6',
                                      backgroundColor: isBookedByMe
                                        ? '#FFF0F3'
                                        : isTaken || alreadyBookedOtherSlot
                                        ? '#F0ECEE'
                                        : '#FFF8F4',
                                      cursor: isBookedByMe ? 'pointer' : (isTaken || !isOpen || alreadyBookedOtherSlot) ? 'default' : 'pointer',
                                    }}
                                  >
                                    <p
                                      className="text-[12px] font-bold"
                                      style={{
                                        color: isBookedByMe ? '#C4506E' : (isTaken || alreadyBookedOtherSlot) ? '#C9BCC0' : '#2D2225',
                                        textDecoration: isTaken ? 'line-through' : 'none',
                                      }}
                                    >
                                      {slot.startTime}
                                    </p>
                                    <p className="text-[11px] font-semibold" style={{ color: isBookedByMe ? '#C4506E' : (isTaken || alreadyBookedOtherSlot) ? '#C9BCC0' : '#A8929A' }}>
                                      {isBookedByMe ? 'Your Booking' : isTaken ? 'Booked' : alreadyBookedOtherSlot ? slot.endTime : slot.endTime}
                                    </p>
                                  </button>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Booking confirmation dialog */}
        {bookingSlot && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
            <div
              className="w-full max-w-md overflow-hidden"
              style={{ backgroundColor: 'white', borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
                    Confirm Booking
                  </h3>
                  <button
                    onClick={() => { setBookingSlot(null); setBookingNotes('') }}
                    style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X className="h-5 w-5" style={{ color: '#7A6469' }} />
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-sm" style={{ color: '#2D2225' }}>
                    <User className="h-4 w-4" style={{ color: '#C4506E' }} />
                    <span className="font-semibold">{bookingSlot.teacher.teacherName}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm" style={{ color: '#2D2225' }}>
                    <Clock className="h-4 w-4" style={{ color: '#C4506E' }} />
                    <span>
                      {bookingSlot.slot.date && selectedConsultation.endDate && selectedConsultation.endDate !== selectedConsultation.date
                        ? `${new Date(bookingSlot.slot.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} - `
                        : ''
                      }
                      {bookingSlot.slot.startTime} - {bookingSlot.slot.endTime}
                    </span>
                  </div>
                  {['GOOGLE_MEET', 'ZOOM', 'TEAMS'].includes(bookingSlot.teacher.locationType || '') ? (
                    <div className="flex items-center space-x-2 text-sm" style={{ color: '#5B6EC4' }}>
                      <Video className="h-4 w-4" />
                      <span className="font-medium">Video Call - link will be provided after booking</span>
                    </div>
                  ) : (
                    bookingSlot.teacher.location && (
                      <div className="flex items-center space-x-2 text-sm" style={{ color: '#2D2225' }}>
                        <MapPin className="h-4 w-4" style={{ color: '#C4506E' }} />
                        <span>{bookingSlot.teacher.location}</span>
                      </div>
                    )
                  )}
                </div>

                {/* Child (auto-selected) */}
                <div className="flex items-center gap-2 text-sm" style={{ color: '#2D2225' }}>
                  <User className="h-4 w-4" style={{ color: '#5B8EC4' }} />
                  <span>Booking for <strong>{bookingStudentName}</strong></span>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#2D2225' }}>
                    Notes for teacher (optional)
                  </label>
                  <textarea
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    placeholder="Any topics you'd like to discuss..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm resize-none"
                    style={{
                      borderRadius: '12px',
                      border: '1.5px solid #F0E4E6',
                      backgroundColor: '#FFF8F4',
                      color: '#2D2225',
                    }}
                  />
                </div>

                <button
                  onClick={handleBook}
                  disabled={isBooking || !bookingStudentId}
                  className="w-full py-3 text-white font-semibold text-sm"
                  style={{
                    borderRadius: '14px',
                    backgroundColor: !bookingStudentId ? '#E8E0E2' : '#C4506E',
                    opacity: isBooking ? 0.7 : 1,
                  }}
                >
                  {isBooking ? 'Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50">
            <div
              className="px-4 py-2 text-sm font-semibold text-white shadow-lg"
              style={{ borderRadius: '14px', backgroundColor: '#2D2225' }}
            >
              {toast}
            </div>
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
          Parent Consultations
        </h1>
        <p className="text-sm mt-1" style={{ color: '#A8929A' }}>Book appointments with your child's teachers</p>
      </div>

      {/* My Bookings Summary */}
      {myBookings.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
            My Bookings
          </h2>
          {myBookings.map(b => {
            const isVideoType = ['GOOGLE_MEET', 'ZOOM', 'TEAMS'].includes(b.locationType || '')

            return (
              <div
                key={b.id}
                className="p-4"
                style={{
                  borderRadius: '22px',
                  backgroundColor: 'white',
                  border: '1.5px solid #F0E4E6',
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="font-semibold text-sm" style={{ color: '#2D2225' }}>
                      {b.teacherName}
                    </p>
                    <div className="flex items-center space-x-3 text-xs" style={{ color: '#7A6469' }}>
                      <span className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />{b.startTime} - {b.endTime}
                      </span>
                      {isVideoType ? (
                        <span className="flex items-center" style={{ color: '#5B6EC4' }}>
                          <Video className="h-3 w-3 mr-1" />Video Call
                        </span>
                      ) : (
                        b.location && (
                          <span className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />{b.location}
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-xs" style={{ color: '#A8929A' }}>
                      {b.studentName} &middot; {formatDate(b.consultationDate)}
                    </p>

                    {/* Meeting link button */}
                    {b.meetingLink && (
                      <a
                        href={b.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-bold text-white"
                        style={{
                          borderRadius: '10px',
                          backgroundColor: '#2D8B4E',
                        }}
                      >
                        <Video className="h-3.5 w-3.5" />
                        Join Meeting
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {consultations?.find(c => c.id === b.consultationId)?.status !== 'COMPLETED' && (
                    <button
                      onClick={() => {
                        if (confirm(`Cancel your ${b.startTime} appointment with ${b.teacherName}?`)) {
                          handleCancel(b.id)
                        }
                      }}
                      className="text-xs font-semibold px-3 py-1"
                      style={{
                        borderRadius: '10px',
                        backgroundColor: '#FFF0F0',
                        color: '#D14D4D',
                        minHeight: '32px',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Consultation Events */}
      <div className="space-y-3">
        <h2 className="text-base font-bold" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
          {myBookings.length > 0 ? 'All Consultations' : 'Upcoming Consultations'}
        </h2>

        {(!consultations || consultations.length === 0) ? (
          <div
            className="text-center py-12"
            style={{
              borderRadius: '22px',
              backgroundColor: 'white',
              border: '1.5px solid #F0E4E6',
            }}
          >
            <Calendar className="h-10 w-10 mx-auto mb-3" style={{ color: '#E8E0E2' }} />
            <p className="text-sm font-semibold" style={{ color: '#A8929A' }}>
              No upcoming consultations
            </p>
            <p className="text-xs mt-1" style={{ color: '#C4B5B9' }}>
              Check back later for Parents' Evening bookings
            </p>
          </div>
        ) : (
          consultations.map(c => {
            const statusStyle = STATUS_COLORS[c.status] || STATUS_COLORS.PUBLISHED
            return (
              <div
                key={c.id}
                className="p-4"
                style={{
                  borderRadius: '22px',
                  backgroundColor: 'white',
                  border: '1.5px solid #F0E4E6',
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-sm" style={{ color: '#2D2225' }}>{c.title}</h3>
                  <span
                    className="text-xs font-semibold px-2 py-1"
                    style={{
                      borderRadius: '8px',
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.text,
                    }}
                  >
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                </div>
                <div className="space-y-1 mb-3">
                  <p className="text-xs flex items-center" style={{ color: '#7A6469' }}>
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(c.date)}
                    {c.endDate && c.endDate !== c.date ? ` - ${formatDate(c.endDate)}` : ''}
                  </p>
                  {c.description && (
                    <p className="text-xs" style={{ color: '#A8929A' }}>{c.description}</p>
                  )}
                  {c.teachers && c.teachers.length > 0 && (
                    <p className="text-xs" style={{ color: '#A8929A' }}>
                      {c.teachers.length} teacher{c.teachers.length !== 1 ? 's' : ''} available
                    </p>
                  )}
                </div>
                {c.status === 'BOOKING_OPEN' && (
                  <button
                    onClick={() => handleOpenBooking(c)}
                    className="w-full py-2.5 text-white font-semibold text-sm"
                    style={{ borderRadius: '14px', backgroundColor: '#C4506E' }}
                  >
                    Book Appointments
                  </button>
                )}
                {c.status === 'PUBLISHED' && (
                  <button
                    onClick={() => handleOpenBooking(c)}
                    className="w-full py-2.5 font-semibold text-sm"
                    style={{ borderRadius: '14px', backgroundColor: '#FFF8F4', color: '#C4506E', border: '1.5px solid #F0E4E6' }}
                  >
                    View Details
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50">
          <div
            className="px-4 py-2 text-sm font-semibold text-white shadow-lg"
            style={{ borderRadius: '14px', backgroundColor: '#2D2225' }}
          >
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
