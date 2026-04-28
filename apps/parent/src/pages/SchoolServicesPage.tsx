import React, { useState, useMemo } from 'react'
import { Clock, MapPin, User, X, Check, AlertCircle, ExternalLink, Banknote } from 'lucide-react'
import { useApi, useAuth } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { SchoolService, ServiceRegistration } from '@wasil/shared'

const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri',
  Saturday: 'Sat', Sunday: 'Sun',
}

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'Coming Soon',
  REGISTRATION_OPEN: 'Registration Open',
  REGISTRATION_CLOSED: 'Registration Closed',
  ACTIVE: 'Active',
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PUBLISHED: { bg: '#EEF0FF', text: '#5B6EC4' },
  REGISTRATION_OPEN: { bg: '#E8F5EC', text: '#2D8B4E' },
  REGISTRATION_CLOSED: { bg: '#FFF3E6', text: '#C47A20' },
  ACTIVE: { bg: '#E8F5EC', text: '#2D8B4E' },
}

const PAYMENT_COLORS: Record<string, { bg: string; text: string }> = {
  PAID: { bg: '#E8F5EC', text: '#2D8B4E' },
  UNPAID: { bg: '#FFF3E6', text: '#C47A20' },
  PARTIAL: { bg: '#FFF3E6', text: '#C47A20' },
  WAIVED: { bg: '#F0E4E6', text: '#7A6469' },
}

const REG_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: '#F0E4E6', text: '#7A6469' },
  CONFIRMED: { bg: '#E8F5EC', text: '#2D8B4E' },
  WAITLISTED: { bg: '#FFF3E6', text: '#C47A20' },
}

function formatTime(time: string) {
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

function getPrimaryCost(service: SchoolService): { amount: number; label: string } | null {
  if (service.costPerSession) return { amount: service.costPerSession, label: '/session' }
  if (service.costPerWeek) return { amount: service.costPerWeek, label: '/week' }
  if (service.costPerTerm) return { amount: service.costPerTerm, label: '/term' }
  return null
}

function formatCurrency(amount: number, currency = 'AED') {
  if (currency === 'AED') return `${Math.round(amount)} AED`
  if (currency === 'GBP') return `\u00A3${amount.toFixed(2)}`
  if (currency === 'USD') return `$${amount.toFixed(2)}`
  return `${amount} ${currency}`
}

export function SchoolServicesPage() {
  const { user } = useAuth()
  const [registeringService, setRegisteringService] = useState<SchoolService | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const { data: services, refetch: refetchServices, isLoading } = useApi<SchoolService[]>(
    () => api.schoolServices.parent.list(),
    []
  )

  const { data: myRegistrations, refetch: refetchRegs } = useApi<ServiceRegistration[]>(
    () => api.schoolServices.parent.myRegistrations(),
    []
  )

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

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const openRegister = (service: SchoolService) => {
    setRegisteringService(service)
    setSelectedStudentId(children.length === 1 ? children[0].id : '')
    setSelectedDays([])
    setNotes('')
  }

  const handleRegister = async () => {
    if (!registeringService || !selectedStudentId || selectedDays.length === 0) return
    const child = children.find((c) => c.id === selectedStudentId)
    if (!child) return

    setIsSubmitting(true)
    try {
      await api.schoolServices.parent.register({
        serviceId: registeringService.id,
        studentId: child.id,
        studentName: child.name,
        className: child.className,
        days: selectedDays,
        notes: notes || undefined,
      })
      showToast('Registration successful!', 'success')
      setRegisteringService(null)
      refetchServices()
      refetchRegs()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Registration failed', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = async (regId: string) => {
    setCancellingId(regId)
    try {
      await api.schoolServices.parent.cancelRegistration(regId)
      showToast('Registration cancelled', 'success')
      refetchServices()
      refetchRegs()
    } catch (error) {
      showToast('Failed to cancel', 'error')
    } finally {
      setCancellingId(null)
    }
  }

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])
  }

  const activeRegs = (myRegistrations || []).filter((r) => r.status !== 'CANCELLED')

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
          School Services
        </h1>
        <p className="text-sm mt-1" style={{ color: '#A8929A' }}>
          Clubs and wraparound care
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg"
          style={{
            backgroundColor: toast.type === 'success' ? '#E8F5EC' : '#FFF0F0',
            color: toast.type === 'success' ? '#2D8B4E' : '#D14D4D',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* My Registrations */}
      {activeRegs.length > 0 && (
        <div>
          <h2
            className="text-base font-bold mb-3"
            style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}
          >
            My Registrations
          </h2>
          <div className="space-y-3">
            {activeRegs.map((reg) => (
              <div
                key={reg.id}
                className="p-4"
                style={{
                  backgroundColor: '#FFF8F4',
                  borderRadius: '22px',
                  border: '1.5px solid #F0E4E6',
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-bold text-sm" style={{ color: '#2D2225' }}>
                      {reg.serviceName || 'Service'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#7A6469' }}>
                      {reg.studentName} - {reg.className}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(reg.days || []).map((day) => (
                        <span
                          key={day}
                          className="text-xs px-2.5 py-0.5 font-semibold"
                          style={{
                            borderRadius: '10px',
                            backgroundColor: '#F0E4E6',
                            color: '#7A6469',
                          }}
                        >
                          {DAY_SHORT[day] || day}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-1.5">
                      <span
                        className="text-xs px-2.5 py-0.5 font-semibold"
                        style={{
                          borderRadius: '10px',
                          backgroundColor: REG_STATUS_COLORS[reg.status]?.bg || '#F0E4E6',
                          color: REG_STATUS_COLORS[reg.status]?.text || '#7A6469',
                        }}
                      >
                        {reg.status}
                      </span>
                      <span
                        className="text-xs px-2.5 py-0.5 font-semibold"
                        style={{
                          borderRadius: '10px',
                          backgroundColor: PAYMENT_COLORS[reg.paymentStatus]?.bg || '#F0E4E6',
                          color: PAYMENT_COLORS[reg.paymentStatus]?.text || '#7A6469',
                        }}
                      >
                        {reg.paymentStatus}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCancel(reg.id)}
                      disabled={cancellingId === reg.id}
                      className="text-xs font-semibold px-3 py-1 rounded-xl"
                      style={{
                        color: '#D14D4D',
                        backgroundColor: '#FFF0F0',
                      }}
                    >
                      {cancellingId === reg.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Services */}
      <div>
        <h2
          className="text-base font-bold mb-3"
          style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}
        >
          Available Services
        </h2>

        {isLoading ? (
          <div className="text-center py-12" style={{ color: '#A8929A' }}>Loading services...</div>
        ) : !services || services.length === 0 ? (
          <div className="text-center py-12" style={{ color: '#A8929A' }}>
            <p>No services available at the moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {services.map((service) => {
              const primaryCost = getPrimaryCost(service)
              const statusColor = STATUS_COLORS[service.status] || STATUS_COLORS.PUBLISHED
              const spotsUsed = service.registeredCount || 0
              const hasCapacity = service.capacity != null && service.capacity > 0
              const isFull = hasCapacity && spotsUsed >= service.capacity!
              const isFree = service.paymentMethod === 'FREE' || (!primaryCost && !service.costDescription)
              const isCashOnly = service.paymentMethod === 'CASH_ONLY'
              const paymentLink = service.paymentUrl || (service.paymentMethod === 'ONLINE' ? undefined : undefined)

              return (
                <div
                  key={service.id}
                  className="p-5"
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '22px',
                    border: '1.5px solid #F0E4E6',
                  }}
                >
                  {/* Header with cost badge */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-bold text-base" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
                          {service.name}
                        </h3>
                        {/* Cost pill */}
                        {isFree ? (
                          <span
                            className="text-xs font-bold px-3 py-1 rounded-full shrink-0"
                            style={{ backgroundColor: '#EDFAF2', color: '#2D8B4E' }}
                          >
                            Free
                          </span>
                        ) : primaryCost ? (
                          <span
                            className="text-xs font-bold px-3 py-1 rounded-full shrink-0"
                            style={{ backgroundColor: '#FFF7EC', color: '#8B5E0F' }}
                          >
                            {service.costIsFrom ? 'from ' : ''}{formatCurrency(primaryCost.amount, service.currency)}{primaryCost.label}
                          </span>
                        ) : service.costDescription ? (
                          <span
                            className="text-xs font-bold px-3 py-1 rounded-full shrink-0"
                            style={{ backgroundColor: '#FFF7EC', color: '#8B5E0F' }}
                          >
                            {service.costDescription}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className="text-xs px-3 py-1 font-semibold shrink-0 ml-2"
                      style={{
                        borderRadius: '10px',
                        backgroundColor: statusColor.bg,
                        color: statusColor.text,
                      }}
                    >
                      {STATUS_LABELS[service.status] || service.status}
                    </span>
                  </div>

                  {service.description && (
                    <p className="text-sm mb-3" style={{ color: '#7A6469' }}>{service.description}</p>
                  )}

                  {/* Days */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(service.days || []).map((day) => (
                      <span
                        key={day}
                        className="text-xs px-2.5 py-1 font-semibold"
                        style={{
                          borderRadius: '12px',
                          backgroundColor: '#FFF0F3',
                          color: '#C4506E',
                        }}
                      >
                        {DAY_SHORT[day] || day}
                      </span>
                    ))}
                  </div>

                  {/* Details row */}
                  <div className="flex flex-wrap gap-4 text-xs mb-3" style={{ color: '#7A6469' }}>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTime(service.startTime)} - {formatTime(service.endTime)}
                    </span>
                    {service.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {service.location}
                      </span>
                    )}
                    {service.staffName && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {service.staffName}
                      </span>
                    )}
                    {isCashOnly && (
                      <span className="flex items-center gap-1 font-semibold" style={{ color: '#8B5E0F' }}>
                        <Banknote className="w-3.5 h-3.5" />
                        Cash Only
                      </span>
                    )}
                  </div>

                  {/* Capacity bar */}
                  {hasCapacity && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1" style={{ color: '#7A6469' }}>
                        <span>{spotsUsed} of {service.capacity} spots filled</span>
                        {isFull && <span className="font-semibold" style={{ color: '#C47A20' }}>Full</span>}
                      </div>
                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: '#F0E4E6' }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (spotsUsed / service.capacity!) * 100)}%`,
                            backgroundColor: isFull ? '#C47A20' : '#C4506E',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {service.status === 'REGISTRATION_OPEN' && (
                      <button
                        onClick={() => openRegister(service)}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm text-white"
                        style={{ backgroundColor: isFull ? '#A8929A' : '#C4506E' }}
                        disabled={isFull}
                      >
                        {isFull ? 'Waitlist Available' : 'Register'}
                      </button>
                    )}
                    {paymentLink && (
                      <a
                        href={paymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-2xl font-bold text-sm"
                        style={{
                          backgroundColor: '#FFF7EC',
                          color: '#8B5E0F',
                          border: '1.5px solid #E8D5B0',
                        }}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Pay Online
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Registration Modal */}
      {registeringService && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div
            className="bg-white w-full max-w-md max-h-[80vh] overflow-y-auto"
            style={{ borderRadius: '22px' }}
          >
            <div className="p-6">
              {/* Modal header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold" style={{ color: '#2D2225', fontFamily: 'Nunito, sans-serif' }}>
                  Register for {registeringService.name}
                </h3>
                <button
                  onClick={() => setRegisteringService(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl"
                  style={{ backgroundColor: '#FFF8F4' }}
                >
                  <X className="w-5 h-5" style={{ color: '#7A6469' }} />
                </button>
              </div>

              {/* Student picker */}
              <div className="mb-4">
                <label className="text-sm font-semibold mb-2 block" style={{ color: '#2D2225' }}>
                  Select Child
                </label>
                {children.length === 0 ? (
                  <p className="text-sm" style={{ color: '#A8929A' }}>No children linked to your account.</p>
                ) : (
                  <div className="space-y-2">
                    {children.map((child) => {
                      const isSelected = selectedStudentId === child.id
                      // Check if already registered
                      const alreadyRegistered = activeRegs.some(
                        (r) => r.serviceId === registeringService.id && r.studentId === child.id
                      )
                      return (
                        <button
                          key={child.id}
                          onClick={() => !alreadyRegistered && setSelectedStudentId(child.id)}
                          disabled={alreadyRegistered}
                          className="w-full text-left p-3 rounded-2xl flex items-center justify-between"
                          style={{
                            border: `2px solid ${isSelected ? '#C4506E' : '#F0E4E6'}`,
                            backgroundColor: isSelected ? '#FFF0F3' : alreadyRegistered ? '#F5F5F5' : 'white',
                            opacity: alreadyRegistered ? 0.6 : 1,
                          }}
                        >
                          <div>
                            <p className="font-semibold text-sm" style={{ color: '#2D2225' }}>{child.name}</p>
                            <p className="text-xs" style={{ color: '#A8929A' }}>{child.className}</p>
                          </div>
                          {alreadyRegistered && (
                            <span className="text-xs font-semibold" style={{ color: '#2D8B4E' }}>Already Registered</span>
                          )}
                          {isSelected && !alreadyRegistered && (
                            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C4506E' }}>
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Day selection */}
              <div className="mb-4">
                <label className="text-sm font-semibold mb-2 block" style={{ color: '#2D2225' }}>
                  Select Days
                </label>
                <div className="flex flex-wrap gap-2">
                  {(registeringService.days || []).map((day) => {
                    const isSelected = selectedDays.includes(day)
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className="px-4 py-2 rounded-2xl text-sm font-semibold transition-all"
                        style={{
                          backgroundColor: isSelected ? '#C4506E' : '#FFF8F4',
                          color: isSelected ? 'white' : '#7A6469',
                          border: `1.5px solid ${isSelected ? '#C4506E' : '#F0E4E6'}`,
                        }}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="mb-5">
                <label className="text-sm font-semibold mb-2 block" style={{ color: '#2D2225' }}>
                  Notes <span style={{ color: '#A8929A', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, dietary requirements, pickup details..."
                  className="w-full p-3 text-sm rounded-2xl resize-none"
                  style={{
                    border: '1.5px solid #F0E4E6',
                    backgroundColor: '#FFF8F4',
                    color: '#2D2225',
                    outline: 'none',
                  }}
                  rows={3}
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleRegister}
                disabled={!selectedStudentId || selectedDays.length === 0 || isSubmitting}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-opacity"
                style={{
                  backgroundColor: '#C4506E',
                  opacity: !selectedStudentId || selectedDays.length === 0 || isSubmitting ? 0.5 : 1,
                }}
              >
                {isSubmitting ? 'Registering...' : 'Confirm Registration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
