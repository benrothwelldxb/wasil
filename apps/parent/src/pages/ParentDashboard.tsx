import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCard, WeeklyMessagePreview } from '../components/messages'
import { PulseBanner, PulseSurveyModal } from '../components/pulse'
import { ScheduleWidget } from '../components/schedule'
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import { useApi, useMutation } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { Message, PulseSurvey, WeeklyMessage, ScheduleItem, Class } from '@wasil/shared'
import { Clock } from 'lucide-react'

export function ParentDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const theme = useTheme()

  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all')
  const [showWeeklyMessageModal, setShowWeeklyMessageModal] = useState(false)
  const [showPulseSurvey, setShowPulseSurvey] = useState(false)

  // Fetch data
  const { data: messages, setData: setMessages } = useApi<Message[]>(
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

  return (
    <div className="space-y-6">
      {/* Parent Pulse Banner */}
      {openPulse && (
        <PulseBanner
          pulse={openPulse}
          onStartSurvey={() => setShowPulseSurvey(true)}
        />
      )}

      {/* Urgency Summary Banner */}
      {urgencySummary && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center space-x-3">
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-800">
            {t('dashboard.formsUrgent', { count: urgencySummary, defaultValue: `You have ${urgencySummary} outstanding form${urgencySummary > 1 ? 's' : ''} due within 3 days` })}
          </span>
        </div>
      )}

      {/* Today's Schedule */}
      {todaysSchedule.length > 0 && (
        <ScheduleWidget
          items={todaysSchedule}
          date={todayString}
        />
      )}

      {/* Messages Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-2xl font-bold mb-6" style={{ color: theme.colors.brandColor }}>
          {t('messages.title')}
        </h2>

        {/* Weekly Message Preview */}
        {weeklyMessageData && (
          <div className="mb-6">
            <WeeklyMessagePreview
              message={weeklyMessageData}
              onHeart={handleToggleHeart}
              onClick={() => setShowWeeklyMessageModal(true)}
            />
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {filterOptions.map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedClassFilter(filter)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedClassFilter === filter
                  ? 'text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              style={
                selectedClassFilter === filter
                  ? { backgroundColor: theme.colors.brandColor }
                  : undefined
              }
            >
              {getFilterLabel(filter)}
            </button>
          ))}
        </div>

        {/* Message Cards */}
        <div className="space-y-4">
          {filteredMessages.length > 0 ? (
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
            <p className="text-gray-500 text-center py-8">
              {t('dashboard.noMessages')}
            </p>
          )}
        </div>
      </div>

      {/* Weekly Message Modal */}
      {showWeeklyMessageModal && weeklyMessageData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold" style={{ color: theme.colors.brandColor }}>
                    {weeklyMessageData.title}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {t('principal.weekOf', { date: new Date(weeklyMessageData.weekOf).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }) })}
                  </p>
                </div>
                <button
                  onClick={() => setShowWeeklyMessageModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  &times;
                </button>
              </div>
              <div className="prose prose-sm max-w-none">
                {weeklyMessageData.content.split('\n').map((paragraph, idx) => (
                  <p key={idx} className="text-gray-700 mb-3">
                    {paragraph}
                  </p>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => handleToggleHeart(weeklyMessageData.id)}
                  className={`flex items-center space-x-2 ${
                    weeklyMessageData.hasHearted ? 'text-red-500' : 'text-gray-400'
                  }`}
                >
                  <span className={`text-2xl ${weeklyMessageData.hasHearted ? '' : 'opacity-50'}`}>
                    {weeklyMessageData.hasHearted ? '❤️' : '🤍'}
                  </span>
                  <span className="font-medium">{weeklyMessageData.heartCount}</span>
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
