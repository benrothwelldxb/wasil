import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCard } from '../components/messages'
import { PulseBanner, PulseSurveyModal } from '../components/pulse'
// ScheduleWidget no longer used — schedule items shown inline in child cards
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import { useApi, useMutation } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { Message, PulseSurvey, WeeklyMessage, ScheduleItem, Class, ParentEcaAllocations, EcaTerm, EmergencyAlert, Event } from '@wasil/shared'
import { Clock, Sparkles, MapPin, ChevronRight, Calendar, Shield, Cloud, AlertTriangle, Heart, Siren, X, Check } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Link } from 'react-router-dom'

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center space-x-3">
        {/* Avatar circle */}
        <div className="skeleton-pulse w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          {/* Title line */}
          <div className="skeleton-pulse h-4 w-3/4 rounded" />
          {/* Subtitle line */}
          <div className="skeleton-pulse h-3 w-1/2 rounded" />
        </div>
      </div>
      {/* Body text lines */}
      <div className="space-y-2">
        <div className="skeleton-pulse h-3 w-full rounded" />
        <div className="skeleton-pulse h-3 w-5/6 rounded" />
      </div>
      {/* Button */}
      <div className="skeleton-pulse h-8 w-28 rounded-lg" />
    </div>
  )
}

export function ParentDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const theme = useTheme()

  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all')
  const [showWeeklyMessageModal, setShowWeeklyMessageModal] = useState(false)
  const [showPulseSurvey, setShowPulseSurvey] = useState(false)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('dismissedAlerts')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const [acknowledgedAlertMap, setAcknowledgedAlertMap] = useState<Record<string, string>>({})
  const [acknowledgingAlerts, setAcknowledgingAlerts] = useState<Set<string>>(new Set())

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => {
      const next = new Set(prev)
      next.add(alertId)
      localStorage.setItem('dismissedAlerts', JSON.stringify([...next]))
      return next
    })
  }

  const getDevicePlatform = (): string => {
    try {
      const platform = Capacitor.getPlatform()
      return platform // 'web', 'ios', 'android'
    } catch {
      return 'web'
    }
  }

  const handleAcknowledgeAlert = async (alertId: string) => {
    setAcknowledgingAlerts(prev => new Set(prev).add(alertId))
    try {
      const result = await api.emergencyAlerts.acknowledge(alertId, getDevicePlatform())
      setAcknowledgedAlertMap(prev => ({ ...prev, [alertId]: result.acknowledgedAt }))
    } catch {
      // Silently fail — user can retry
    } finally {
      setAcknowledgingAlerts(prev => {
        const next = new Set(prev)
        next.delete(alertId)
        return next
      })
    }
  }

  // Fetch data
  const { data: messages, isLoading: messagesLoading, setData: setMessages } = useApi<Message[]>(
    () => api.messages.list(),
    []
  )
  const { data: weeklyMessageData, setData: setWeeklyMessage } = useApi<WeeklyMessage | null>(
    () => api.weeklyMessage.getCurrent(),
    []
  )
  const { data: pulseData, setData: setPulseData, refetch: refetchPulse } = useApi<PulseSurvey[]>(
    () => api.pulse.list(),
    []
  )
  const { data: scheduleData } = useApi<ScheduleItem[]>(
    () => api.schedule.list(),
    []
  )
  const { data: allClasses } = useApi<Class[]>(
    () => api.classes.list(),
    []
  )
  const { data: ecaAllocations } = useApi<ParentEcaAllocations[]>(
    () => api.eca.parent.getAllocations(),
    []
  )
  const { data: ecaTerms } = useApi<EcaTerm[]>(
    () => api.eca.parent.listTerms(),
    []
  )
  const { data: activeAlerts } = useApi<EmergencyAlert[]>(
    () => api.emergencyAlerts.active(),
    []
  )
  const { data: events } = useApi<Event[]>(
    () => api.events.list(),
    []
  )

  // Build class color map from actual class data
  const classColorMap = useMemo(() => {
    const map: Record<string, { bg: string; hex: string }> = {}
    const CLASS_COLOR_HEX: Record<string, string> = {
      'bg-gray-600': '#4B5563', 'bg-blue-600': '#2563EB', 'bg-red-600': '#DC2626',
      'bg-green-600': '#16A34A', 'bg-purple-600': '#9333EA', 'bg-amber-500': '#F59E0B',
      'bg-teal-600': '#0D9488', 'bg-pink-600': '#DB2777', 'bg-orange-600': '#EA580C',
      'bg-indigo-600': '#4F46E5', 'bg-blue-500': '#3b82f6',
    }
    allClasses?.forEach(c => {
      const hex = CLASS_COLOR_HEX[c.colorBg] || '#4B5563'
      map[c.name] = { bg: c.colorBg, hex }
    })
    return map
  }, [allClasses])

  // Mutations
  const { mutate: acknowledgeMessage } = useMutation(api.messages.acknowledge)
  const { mutate: toggleHeart } = useMutation(api.weeklyMessage.toggleHeart)

  // Get user's children's classes
  const userClasses = useMemo(() => {
    const classes = user?.children?.map((c) => c.className) || []
    return [...new Set(classes)]
  }, [user])

  // Filter options including "All Messages" and "Whole School"
  const filterOptions = ['all', 'Whole School', ...userClasses]

  // Filter messages by selected class
  const filteredMessages = useMemo(() => {
    if (!messages) return []
    if (selectedClassFilter === 'all') return messages
    if (selectedClassFilter === 'Whole School') {
      return messages.filter((m) => m.targetClass === 'Whole School')
    }
    return messages.filter(
      (m) => m.targetClass === selectedClassFilter || m.targetClass === 'Whole School'
    )
  }, [messages, selectedClassFilter])

  // Get the open pulse survey (show even if completed to display thank you message)
  const openPulse = useMemo(() => {
    return pulseData?.find((p) => p.status === 'OPEN')
  }, [pulseData])

  // Get today's schedule items (recurring for today's day + one-off for today's date)
  const todayString = new Date().toISOString().split('T')[0]
  const todayDayOfWeek = new Date().getDay()
  const todaysSchedule = useMemo(() => {
    if (!scheduleData) return []
    return scheduleData.filter((item) => {
      if (item.isRecurring && item.dayOfWeek === todayDayOfWeek) {
        return true
      }
      if (!item.isRecurring && item.date === todayString) {
        return true
      }
      return false
    })
  }, [scheduleData, todayDayOfWeek, todayString])

  // Get today's ECA activities
  const todaysEcaActivities = useMemo(() => {
    if (!ecaAllocations) return []
    const activities: Array<{
      studentName: string
      activityName: string
      timeSlot: string
      location?: string | null
      startTime?: string | null
      endTime?: string | null
    }> = []
    ecaAllocations.forEach(student => {
      student.allocations
        .filter(a => a.status === 'CONFIRMED' && a.dayOfWeek === todayDayOfWeek)
        .forEach(a => {
          activities.push({
            studentName: student.studentName,
            activityName: a.activityName,
            timeSlot: a.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School',
            location: a.location,
            startTime: a.startTime,
            endTime: a.endTime,
          })
        })
    })
    return activities.sort((a, b) => {
      if (a.timeSlot === 'Before School' && b.timeSlot !== 'Before School') return -1
      if (a.timeSlot !== 'Before School' && b.timeSlot === 'Before School') return 1
      return 0
    })
  }, [ecaAllocations, todayDayOfWeek])

  // Urgency summary: count outstanding forms nearing deadline across all messages
  const urgencySummary = useMemo(() => {
    if (!messages) return null
    const now = new Date()
    let count = 0
    for (const msg of messages) {
      if (!msg.form || msg.form.userResponse) continue
      if (!msg.form.expiresAt) continue
      const expires = new Date(msg.form.expiresAt)
      const diffDays = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays >= 0 && diffDays <= 3) count++
    }
    return count > 0 ? count : null
  }, [messages])

  // Check for open ECA registration
  const openRegistrationTerm = useMemo(() => {
    if (!ecaTerms) return null
    const now = new Date()
    return ecaTerms.find(term => {
      if (term.status !== 'REGISTRATION_OPEN') return false
      const closes = new Date(term.registrationCloses)
      return closes > now
    }) || null
  }, [ecaTerms])

  // Calculate days left for registration
  const registrationDaysLeft = useMemo(() => {
    if (!openRegistrationTerm) return null
    const now = new Date()
    const closes = new Date(openRegistrationTerm.registrationCloses)
    const diffTime = closes.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : null
  }, [openRegistrationTerm])

  // Upcoming events this week
  const upcomingThisWeek = useMemo(() => {
    if (!events) return []
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    // End of this week (Sunday)
    const endOfWeek = new Date(now)
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
    endOfWeek.setHours(23, 59, 59, 999)

    return events
      .filter(e => {
        const eventDate = new Date(e.date + 'T00:00:00')
        return eventDate >= now && eventDate <= endOfWeek
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3) // Show max 3
  }, [events])

  const formatEventDay = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const eventDay = new Date(date)
    eventDay.setHours(0, 0, 0, 0)
    const diffDays = Math.round((eventDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    return date.toLocaleDateString('en-GB', { weekday: 'long' })
  }

  const handleAcknowledge = async (messageId: string) => {
    await acknowledgeMessage(messageId)
    setMessages((prev) =>
      prev?.map((m) =>
        m.id === messageId
          ? { ...m, acknowledged: true, acknowledgmentCount: (m.acknowledgmentCount || 0) + 1 }
          : m
      ) || null
    )
  }

  const handleFormResponse = async (formId: string, answers: Record<string, unknown>) => {
    try {
      const result = await api.forms.respond(formId, answers)
      setMessages(prev =>
        prev?.map(m =>
          m.form && m.form.id === formId
            ? { ...m, form: { ...m.form, userResponse: result } }
            : m
        ) || null
      )
    } catch {
      alert('Failed to submit response')
    }
  }

  const handleToggleHeart = async (messageId: string) => {
    const result = await toggleHeart(messageId)
    setWeeklyMessage((prev) =>
      prev
        ? {
            ...prev,
            hasHearted: result.hearted,
            heartCount: result.hearted ? prev.heartCount + 1 : prev.heartCount - 1,
          }
        : null
    )
  }

  const getFilterLabel = (filter: string) => {
    if (filter === 'all') return t('dashboard.allMessages', 'All Messages')
    if (filter === 'Whole School') return t('messages.wholeSchool')
    return filter
  }

  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case 'LOCKDOWN': return Shield
      case 'WEATHER': return Cloud
      case 'EARLY_DISMISSAL': return Clock
      case 'MEDICAL': return Heart
      case 'SECURITY': return Siren
      default: return AlertTriangle
    }
  }

  const getAlertBg = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return '#DC2626'
      case 'HIGH': return '#EA580C'
      case 'MEDIUM': return '#F59E0B'
      default: return '#DC2626'
    }
  }

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  // Group today's activities by child for the child-centric cards
  const childCards = useMemo(() => {
    // Prefer studentLinks (newer model), fall back to legacy children
    const studentLinks = user?.studentLinks || []
    const children = user?.children || []
    const allChildren: Array<{ id: string; name: string; className: string; teacherName?: string }> = []
    const seenNames = new Set<string>()
    // studentLinks first (newer model)
    studentLinks.forEach(l => {
      const name = l.studentName.trim()
      if (!seenNames.has(name)) {
        seenNames.add(name)
        allChildren.push({ id: l.studentId, name, className: l.className, teacherName: l.teacherName || undefined })
      }
    })
    // then legacy children, skipping duplicates by name
    children.forEach(c => {
      const name = c.name.trim()
      if (!seenNames.has(name)) {
        seenNames.add(name)
        allChildren.push({ id: c.id, name, className: c.className, teacherName: (c as any).teacherName })
      }
    })
    return allChildren.map(child => ({
      ...child,
      activities: todaysEcaActivities.filter(a => a.studentName === child.name),
      schedule: todaysSchedule.filter(item => {
        // Match schedule items to this child's class
        return !item.targetClass || item.targetClass === child.className || item.targetClass === 'Whole School'
      }),
    }))
  }, [user, todaysEcaActivities, todaysSchedule])

  const CHILD_COLORS = [
    'linear-gradient(135deg, #5B8EC4, #7BA8D9)',
    'linear-gradient(135deg, #5BA97B, #7BC49A)',
    'linear-gradient(135deg, #C4506E, #D97A93)',
    'linear-gradient(135deg, #E8A54B, #F0C078)',
  ]

  const ACTIVITY_EMOJIS: Record<string, string> = {
    swimming: '\u{1F3CA}', football: '\u26BD', art: '\u{1F3A8}', drama: '\u{1F3AD}',
    music: '\u{1F3B5}', coding: '\u{1F4BB}', chess: '\u265F\uFE0F', gymnastics: '\u{1F938}',
    cricket: '\u{1F3CF}', tennis: '\u{1F3BE}', basketball: '\u{1F3C0}', dance: '\u{1F483}',
    choir: '\u{1F3A4}', science: '\u{1F52C}', reading: '\u{1F4DA}', yoga: '\u{1F9D8}',
  }

  const getActivityEmoji = (name: string) => {
    const lower = name.toLowerCase()
    for (const [key, emoji] of Object.entries(ACTIVITY_EMOJIS)) {
      if (lower.includes(key)) return emoji
    }
    return '\u2B50'
  }

  // Greeting based on time of day
  const hour = new Date().getHours()
  const greetingText = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.name?.split(' ')[0] || ''

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="space-y-5">
      {/* Emergency Alert Banners */}
      {activeAlerts && activeAlerts.length > 0 && activeAlerts.filter(a => !dismissedAlerts.has(a.id)).map(alert => {
        const AlertIcon = getAlertIcon(alert.type)
        const isResolved = alert.status === 'RESOLVED'
        const isDrill = !!alert.isDrill
        const isAcknowledged = alert.acknowledged || !!acknowledgedAlertMap[alert.id]
        const acknowledgedTime = acknowledgedAlertMap[alert.id] || alert.acknowledgedAt
        const bgColor = isResolved ? '#EDFAF2' : isDrill ? '#EFF6FF' : getAlertBg(alert.severity)
        const isCritical = alert.severity === 'CRITICAL' && !isResolved && !isDrill
        const drillTextColor = '#1E40AF'
        const drillBorderColor = '#BFDBFE'

        return (
          <div
            key={alert.id}
            className="rounded-[22px] p-4"
            style={{
              backgroundColor: bgColor,
              border: isResolved ? '1.5px solid rgba(91,169,123,0.25)' : isDrill ? `1.5px solid ${drillBorderColor}` : 'none',
              boxShadow: isResolved ? 'none' : isDrill ? '0 4px 20px rgba(30,64,175,0.08)' : '0 4px 20px rgba(0,0,0,0.12)',
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {isCritical && (
                  <span className="relative flex h-3 w-3 mb-1 mx-auto">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                  </span>
                )}
                <AlertIcon className="h-6 w-6" style={{ color: isResolved ? '#5BA97B' : isDrill ? drillTextColor : '#FFFFFF' }} />
              </div>
              <div className="flex-1 min-w-0">
                {isResolved && (
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="float-right ml-2 w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
                    aria-label="Dismiss alert"
                  >
                    <X className="w-4 h-4" style={{ color: '#A8929A' }} />
                  </button>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {isResolved && (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wide"
                      style={{ backgroundColor: 'rgba(91,169,123,0.15)', color: '#5BA97B' }}
                    >
                      Resolved
                    </span>
                  )}
                  {isDrill && !isResolved && (
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wide"
                      style={{ backgroundColor: 'rgba(30,64,175,0.12)', color: drillTextColor }}
                    >
                      Drill
                    </span>
                  )}
                  <h3
                    className="font-extrabold text-lg"
                    style={{ color: isResolved ? '#2D2225' : isDrill ? drillTextColor : '#FFFFFF' }}
                  >
                    {alert.title}
                  </h3>
                </div>
                {isDrill && alert.drillName && !isResolved && (
                  <p className="text-sm font-bold mt-0.5" style={{ color: drillTextColor }}>
                    {alert.drillName}
                  </p>
                )}
                {isResolved ? (
                  <>
                    <p className="mt-1 text-sm leading-relaxed font-medium" style={{ color: '#5BA97B' }}>
                      This situation has been resolved. No further action is required.
                    </p>
                    <p className="text-xs mt-2 font-semibold" style={{ color: '#A8929A' }}>
                      {alert.type.replace('_', ' ')} &middot; Resolved {alert.resolvedAt ? getTimeAgo(alert.resolvedAt) : ''}
                    </p>
                  </>
                ) : isDrill ? (
                  <>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: drillTextColor, opacity: 0.85 }}>{alert.message}</p>
                    <p className="mt-1.5 text-xs leading-relaxed font-medium italic" style={{ color: drillTextColor, opacity: 0.7 }}>
                      This is a practice alert to test emergency communications
                    </p>
                    <p className="text-xs mt-2 font-semibold" style={{ color: drillTextColor, opacity: 0.55 }}>
                      {alert.type.replace('_', ' ')} &middot; Sent {getTimeAgo(alert.sentAt)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-white/90 mt-1 text-sm leading-relaxed">{alert.message}</p>
                    <p className="text-white/60 text-xs mt-2 font-semibold">
                      {alert.type.replace('_', ' ')} &middot; Sent {getTimeAgo(alert.sentAt)}
                    </p>
                  </>
                )}
                {/* Acknowledgment section */}
                {!isResolved && alert.requireAck && (
                  <div className="mt-3">
                    {isAcknowledged ? (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-4 h-4" style={{ color: isDrill ? drillTextColor : '#FFFFFF' }} />
                        <span className="text-xs font-semibold" style={{ color: isDrill ? drillTextColor : 'rgba(255,255,255,0.8)' }}>
                          Acknowledged at {acknowledgedTime ? new Date(acknowledgedTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'just now'}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAcknowledgeAlert(alert.id)}
                        disabled={acknowledgingAlerts.has(alert.id)}
                        className="px-4 py-2 rounded-xl text-sm font-bold transition-opacity disabled:opacity-60"
                        style={{
                          backgroundColor: '#FFFFFF',
                          color: isDrill ? drillTextColor : getAlertBg(alert.severity),
                        }}
                      >
                        {acknowledgingAlerts.has(alert.id)
                          ? 'Sending...'
                          : isDrill
                            ? 'Confirm Receipt'
                            : 'I Acknowledge This Alert'
                        }
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Warm Greeting */}
      <div>
        {theme.logoUrl ? (
          <img
            src={theme.logoUrl}
            alt={theme.schoolName}
            style={{ height: '44px', borderRadius: '12px', objectFit: 'contain' }}
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #C4506E, #E8785B)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '20px',
              fontWeight: 800,
            }}
          >
            {theme.shortName?.charAt(0) || 'W'}
          </div>
        )}
        <h1 className="text-[28px] font-extrabold leading-tight mt-2" style={{ color: '#2D2225' }}>
          {greetingText}, {firstName} 👋
        </h1>
        <p className="text-[15px] font-medium mt-1" style={{ color: '#7A6469' }}>{todayFormatted}</p>
      </div>

      {/* Urgency Summary Banner */}
      {urgencySummary && (
        <div
          className="rounded-[22px] px-5 py-4 flex items-center gap-4"
          style={{ backgroundColor: '#FFF7EC', border: '1.5px solid rgba(232,165,75,0.25)' }}
        >
          <div
            className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(232,165,75,0.15)' }}
          >
            <span className="text-[22px]">&#9888;&#65039;</span>
          </div>
          <div>
            <h4 className="text-[15px] font-bold" style={{ color: '#8B5E0F' }}>
              {urgencySummary} form{urgencySummary > 1 ? 's' : ''} need{urgencySummary === 1 ? 's' : ''} your attention
            </h4>
            <p className="text-[13px] font-medium" style={{ color: '#B07A1B' }}>
              {t('dashboard.formsUrgent', { count: urgencySummary, defaultValue: `Due within 3 days` })}
            </p>
          </div>
        </div>
      )}

      {/* Upcoming Events This Week */}
      {upcomingThisWeek.length > 0 && (
        <Link
          to="/events"
          className="block overflow-hidden"
          style={{
            borderRadius: '22px',
            background: 'linear-gradient(135deg, #5B8EC4, #7BA8D9)',
            padding: '20px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-15px',
              right: '-15px',
              width: '90px',
              height: '90px',
              borderRadius: '45px',
              background: 'rgba(255,255,255,0.08)',
            }}
          />
          <p
            className="text-[11px] font-bold uppercase tracking-widest mb-2"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            Coming up this week
          </p>
          <div className="space-y-2">
            {upcomingThisWeek.map((event, idx) => (
              <div key={event.id} className="flex items-center gap-3" style={{ position: 'relative', zIndex: 1 }}>
                <div
                  className="flex-shrink-0 text-center"
                  style={{
                    minWidth: '44px',
                    padding: '4px 8px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(255,255,255,0.18)',
                  }}
                >
                  <p className="text-[11px] font-bold text-white/70">{formatEventDay(event.date)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-white truncate">{event.title}</p>
                  {event.time && (
                    <p className="text-[12px] font-medium text-white/70">{event.time}{event.location ? ` · ${event.location}` : ''}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {upcomingThisWeek.length === 1 && (
            <p className="text-[13px] font-semibold text-white/60 mt-2" style={{ position: 'relative', zIndex: 1 }}>
              Tap to view all events →
            </p>
          )}
        </Link>
      )}

      {/* Your Family's Day — Child-centric cards */}
      {childCards.length > 0 && (childCards.some(c => c.activities.length > 0) || todaysSchedule.length > 0) && (
        <>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#A8929A' }}>
            {t('dashboard.familyDay', "Your family's day")}
          </p>
          {childCards.map((child, idx) => (
            (child.activities.length > 0 || child.schedule.length > 0) && (
              <div
                key={child.id}
                className="bg-white rounded-[22px] overflow-hidden"
                style={{ border: '1.5px solid #F0E4E6' }}
              >
                <div className="p-[18px]">
                  <div className="flex items-center gap-[14px] mb-[14px]">
                    <div
                      className="w-12 h-12 rounded-[16px] flex items-center justify-center text-white text-xl font-extrabold flex-shrink-0"
                      style={{ background: CHILD_COLORS[idx % CHILD_COLORS.length] }}
                    >
                      {child.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: '#2D2225' }}>{child.name}</h3>
                      <span className="text-[13px] font-semibold" style={{ color: '#7A6469' }}>
                        {child.className}{child.teacherName ? ` \u00B7 ${child.teacherName}` : ''}
                      </span>
                    </div>
                  </div>
                  {/* Activities */}
                  {child.activities.map((activity, aIdx) => (
                    <div
                      key={aIdx}
                      className="rounded-[16px] p-[14px] flex items-center gap-3 mb-2"
                      style={{ backgroundColor: '#FFF8F4' }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ backgroundColor: idx % 2 === 0 ? '#EDF4FC' : '#EDFAF2' }}
                      >
                        {getActivityEmoji(activity.activityName)}
                      </div>
                      <div>
                        <h4 className="text-[15px] font-bold" style={{ color: '#2D2225' }}>{activity.activityName}</h4>
                        <p className="text-[13px] font-medium" style={{ color: '#7A6469' }}>
                          {activity.startTime && activity.endTime
                            ? `${activity.startTime} - ${activity.endTime}`
                            : activity.timeSlot
                          }
                          {activity.location ? ` \u00B7 ${activity.location}` : ''}
                        </p>
                        <span
                          className="inline-block mt-1 px-[10px] py-[3px] rounded-lg text-[11px] font-bold uppercase tracking-wide"
                          style={{
                            backgroundColor: idx % 2 === 0 ? '#EDF4FC' : '#EDFAF2',
                            color: idx % 2 === 0 ? '#5B8EC4' : '#5BA97B',
                          }}
                        >
                          {activity.timeSlot}
                        </span>
                      </div>
                    </div>
                  ))}
                  {/* Schedule items */}
                  {child.schedule.map((item, sIdx) => (
                    <div
                      key={`s-${sIdx}`}
                      className="rounded-[16px] p-[14px] flex items-center gap-3 mb-2"
                      style={{ backgroundColor: '#FFF8F4' }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ backgroundColor: '#EDF4FC' }}
                      >
                        {item.icon || '\u{1F4CB}'}
                      </div>
                      <div>
                        <h4 className="text-[15px] font-bold" style={{ color: '#2D2225' }}>{item.label}</h4>
                        <p className="text-[13px] font-medium" style={{ color: '#7A6469' }}>
                          {item.description || ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </>
      )}

      {/* ECA Registration Banner */}
      {openRegistrationTerm && (
        <Link
          to="/activities"
          className="block rounded-[22px] p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #C4506E, #E8785B)' }}
        >
          <div className="absolute -top-2 -right-2 text-[90px] opacity-10 pointer-events-none">&#127912;</div>
          <h3 className="text-[19px] font-extrabold text-white relative z-10">
            {t('eca.registrationOpen', 'Activity sign-ups are open!')}
          </h3>
          <p className="text-sm font-medium text-white/90 relative z-10">
            {t('eca.registrationOpenBanner', 'Choose clubs and activities for next term')}
          </p>
          {registrationDaysLeft && (
            <span
              className="inline-flex items-center gap-1.5 mt-[10px] px-[14px] py-1.5 rounded-xl text-[13px] font-bold text-white relative z-10"
              style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
            >
              &#9200; {t('eca.daysLeft', 'Closes in {{count}} days', { count: registrationDaysLeft })}
            </span>
          )}
        </Link>
      )}

      {/* Parent Pulse Banner */}
      {openPulse && (
        <PulseBanner
          pulse={openPulse}
          onStartSurvey={() => setShowPulseSurvey(true)}
        />
      )}

      {/* Messages Section */}
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#A8929A' }}>
        {t('messages.recentMessages', 'Recent messages')}
      </p>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedClassFilter(filter)}
            className="px-4 py-2 rounded-full text-sm font-bold transition-colors"
            style={
              selectedClassFilter === filter
                ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
            }
          >
            {getFilterLabel(filter)}
          </button>
        ))}
      </div>

      {/* Message Cards */}
      <div className="space-y-4">
        {messagesLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filteredMessages.length > 0 ? (
          filteredMessages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              onAcknowledge={handleAcknowledge}
              onFormRespond={handleFormResponse}
              classColors={classColorMap}
            />
          ))
        ) : (
          <p className="text-center py-8 font-medium" style={{ color: '#A8929A' }}>
            {t('dashboard.noMessages')}
          </p>
        )}
      </div>

      {/* Weekly Principal Update — below messages, styled as a distinct section */}
      {weeklyMessageData && (
        <div
          className="rounded-[22px] overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, #FFF7F9, #FFF0F3)',
            border: '1.5px solid rgba(196,80,110,0.12)',
            position: 'relative',
          }}
        >
          {/* Decorative accent */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, #C4506E, #E8785B)',
            borderRadius: '22px 22px 0 0',
          }} />
          <div className="p-5 pt-6">
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#C4506E' }}>
              From the Principal
            </p>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-white text-sm font-extrabold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #C4506E, #D97A93)' }}
              >
                {weeklyMessageData.title
                  ? weeklyMessageData.title.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
                  : 'P'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold truncate" style={{ color: '#2D2225' }}>
                  {weeklyMessageData.title || "Weekly Update"}
                </h3>
                <p className="text-[12px] font-semibold" style={{ color: '#A8929A' }}>
                  {t('principal.weekOf', { date: new Date(weeklyMessageData.weekOf).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                  }) })}
                </p>
              </div>
            </div>
            <p className="text-[14px] leading-relaxed font-medium" style={{ color: '#7A6469' }}>
              {weeklyMessageData.content?.substring(0, 160)}...
            </p>
            <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid rgba(196,80,110,0.08)' }}>
              <button
                onClick={() => handleToggleHeart(weeklyMessageData.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{
                  background: weeklyMessageData.hasHearted ? 'rgba(224,85,119,0.1)' : 'transparent',
                  color: weeklyMessageData.hasHearted ? '#E05577' : '#A8929A',
                  fontSize: '14px',
                  fontWeight: 700,
                  border: 'none',
                }}
              >
                <span className="text-[20px]">{weeklyMessageData.hasHearted ? '\u2764\uFE0F' : '\u{1FA77}'}</span>
                <span>{weeklyMessageData.heartCount}</span>
              </button>
              <button
                onClick={() => setShowWeeklyMessageModal(true)}
                className="flex items-center gap-1 text-[13px] font-bold"
                style={{ color: '#C4506E', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Read full update
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Message Modal */}
      {showWeeklyMessageModal && weeklyMessageData && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[22px] max-w-2xl w-full max-h-[80vh] overflow-auto" style={{ border: '1.5px solid #F0E4E6' }}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-extrabold" style={{ color: '#2D2225' }}>
                    {weeklyMessageData.title}
                  </h3>
                  <p className="text-sm font-medium" style={{ color: '#7A6469' }}>
                    {t('principal.weekOf', { date: new Date(weeklyMessageData.weekOf).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }) })}
                  </p>
                </div>
                <button
                  onClick={() => setShowWeeklyMessageModal(false)}
                  className="text-2xl w-10 h-10 flex items-center justify-center rounded-xl"
                  style={{ color: '#A8929A' }}
                >
                  &times;
                </button>
              </div>
              <div className="prose prose-sm max-w-none">
                {weeklyMessageData.content.split('\n').map((paragraph, idx) => (
                  <p key={idx} className="mb-3 text-[15px] leading-relaxed" style={{ color: '#4A3A40' }}>
                    {paragraph}
                  </p>
                ))}
              </div>
              <div className="mt-6 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid #F0E4E6' }}>
                <button
                  onClick={() => handleToggleHeart(weeklyMessageData.id)}
                  className="flex items-center gap-2"
                  style={{
                    color: weeklyMessageData.hasHearted ? '#E05577' : '#A8929A',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 700,
                  }}
                >
                  <span className="text-2xl">{weeklyMessageData.hasHearted ? '\u2764\uFE0F' : '\u{1F90D}'}</span>
                  <span>{weeklyMessageData.heartCount}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pulse Survey Modal */}
      {showPulseSurvey && openPulse && (
        <PulseSurveyModal
          pulse={openPulse}
          onClose={() => setShowPulseSurvey(false)}
          onComplete={() => {
            setShowPulseSurvey(false)
            refetchPulse()
          }}
        />
      )}
    </div>
  )
}
