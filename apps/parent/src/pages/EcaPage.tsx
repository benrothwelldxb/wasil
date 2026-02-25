import React, { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Star,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Lock,
  Sparkles,
  Mail,
  X,
} from 'lucide-react'
import { useApi, useMutation, useAuth, useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type {
  EcaTerm,
  EcaTermStatus,
  ParentEcaTerm,
  ParentEcaActivity,
  ParentEcaSelections,
  ParentEcaAllocations,
  EcaSelectionSubmission,
  EcaTimeSlot,
} from '@wasil/shared'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function EcaPage() {
  const { t } = useTranslation()
  const theme = useTheme()
  const { user } = useAuth()

  const [selectedTermId, setSelectedTermId] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})

  // Selections state for form (smart allocation mode)
  const [prioritySelection, setPrioritySelection] = useState<string | null>(null)
  const [rankedSelections, setRankedSelections] = useState<Record<string, string[]>>({}) // daySlot -> [activityId, activityId, activityId]

  // Selections state for FCFS mode
  const [fcfsSelections, setFcfsSelections] = useState<Set<string>>(new Set())

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Fetch terms
  const { data: terms, isLoading: termsLoading, error: termsError } = useApi<EcaTerm[]>(
    () => api.eca.parent.listTerms(),
    []
  )

  // Fetch term details with activities
  const { data: termDetails, isLoading: termLoading, refetch: refetchTerm } = useApi<ParentEcaTerm | null>(
    () => selectedTermId && selectedStudentId
      ? api.eca.parent.getTerm(selectedTermId, selectedStudentId)
      : Promise.resolve(null),
    [selectedTermId, selectedStudentId]
  )

  // Fetch current selections
  const { data: currentSelections, refetch: refetchSelections } = useApi<ParentEcaSelections[]>(
    () => selectedTermId ? api.eca.parent.getSelections(selectedTermId) : Promise.resolve([]),
    [selectedTermId]
  )

  // Fetch allocations
  const { data: allocations } = useApi<ParentEcaAllocations[]>(
    () => api.eca.parent.getAllocations(),
    []
  )

  // Fetch invitations
  const { data: invitations, refetch: refetchInvitations } = useApi<Array<{
    id: string
    studentId: string
    studentName: string
    activityId: string
    activityName: string
    activityDescription?: string
    dayOfWeek: number
    timeSlot: string
    location?: string
    isTryout: boolean
    invitedByName: string
    createdAt: string
  }>>(
    () => api.eca.parent.getInvitations(),
    []
  )

  const { mutate: respondToInvitation } = useMutation(api.eca.parent.respondToInvitation)

  // Get children from user - support both legacy children and new studentLinks
  const children = useMemo(() => {
    // Prefer studentLinks (new model)
    if (user?.studentLinks && user.studentLinks.length > 0) {
      return user.studentLinks.map(link => ({
        id: link.studentId,
        name: link.studentName,
        classId: '', // Not available in ParentStudentLinkInfo, but not needed for ECA
        className: link.className,
      }))
    }
    // Fall back to legacy children
    return user?.children || []
  }, [user])

  // Initialize selected student
  React.useEffect(() => {
    if (children.length > 0 && !selectedStudentId) {
      setSelectedStudentId(children[0].id)
    }
  }, [children, selectedStudentId])

  // Initialize selected term
  React.useEffect(() => {
    if (terms && terms.length > 0 && !selectedTermId) {
      // Select the first active/open term
      const activeTerm = terms.find(t =>
        ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ALLOCATION_COMPLETE', 'ACTIVE'].includes(t.status)
      )
      if (activeTerm) {
        setSelectedTermId(activeTerm.id)
      } else if (terms.length > 0) {
        setSelectedTermId(terms[0].id)
      }
    }
  }, [terms, selectedTermId])

  // Initialize selections from current data
  React.useEffect(() => {
    if (currentSelections && selectedStudentId) {
      const studentSelections = currentSelections.find(s => s.studentId === selectedStudentId)
      if (studentSelections) {
        // Set up ranked selections
        const ranked: Record<string, string[]> = {}
        let priority: string | null = null
        const fcfs = new Set<string>()

        studentSelections.selections.forEach(sel => {
          const key = `${sel.dayOfWeek}-${sel.timeSlot}`
          if (!ranked[key]) ranked[key] = ['', '', '']
          if (sel.rank >= 1 && sel.rank <= 3) {
            ranked[key][sel.rank - 1] = sel.activityId
          }
          if (sel.isPriority) {
            priority = sel.activityId
          }
          fcfs.add(sel.activityId)
        })

        setRankedSelections(ranked)
        setPrioritySelection(priority)
        setFcfsSelections(fcfs)
      }
    }
  }, [currentSelections, selectedStudentId])

  // Get current term status info
  const termStatus = useMemo(() => {
    if (!termDetails) return null
    const now = new Date()
    const regOpens = new Date(termDetails.registrationOpens)
    const regCloses = new Date(termDetails.registrationCloses)

    return {
      status: termDetails.status,
      isBeforeRegistration: now < regOpens,
      isDuringRegistration: termDetails.status === 'REGISTRATION_OPEN',
      isAfterRegistration: termDetails.status === 'REGISTRATION_CLOSED',
      isAllocated: termDetails.status === 'ALLOCATION_COMPLETE' || termDetails.status === 'ACTIVE' || termDetails.status === 'COMPLETED',
      registrationOpens: regOpens,
      registrationCloses: regCloses,
    }
  }, [termDetails])

  // Group activities by day and time slot
  const activitiesByDaySlot = useMemo(() => {
    if (!termDetails?.activities) return {}
    const grouped: Record<string, ParentEcaActivity[]> = {}
    termDetails.activities.forEach(activity => {
      const key = `${activity.dayOfWeek}-${activity.timeSlot}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(activity)
    })
    return grouped
  }, [termDetails])

  // Get unique day/slot combinations sorted
  const daySlots = useMemo(() => {
    const slots = Object.keys(activitiesByDaySlot).map(key => {
      const [day, slot] = key.split('-')
      return { key, dayOfWeek: parseInt(day), timeSlot: slot as EcaTimeSlot }
    })
    return slots.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek
      return a.timeSlot === 'BEFORE_SCHOOL' ? -1 : 1
    })
  }, [activitiesByDaySlot])

  // Get allocations for current student
  const studentAllocations = useMemo(() => {
    if (!allocations || !selectedStudentId) return null
    return allocations.find(a => a.studentId === selectedStudentId)
  }, [allocations, selectedStudentId])

  // Get invitations for current student
  const studentInvitations = useMemo(() => {
    if (!invitations || !selectedStudentId) return []
    return invitations.filter(i => i.studentId === selectedStudentId)
  }, [invitations, selectedStudentId])

  // Toggle day expansion
  const toggleDay = useCallback((key: string) => {
    setExpandedDays(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Handle ranked selection change
  const handleRankedChange = useCallback((daySlot: string, rank: number, activityId: string) => {
    setRankedSelections(prev => {
      const current = prev[daySlot] || ['', '', '']
      const updated = [...current]
      updated[rank] = activityId
      return { ...prev, [daySlot]: updated }
    })
    setSubmitSuccess(false)
    setSubmitError(null)
  }, [])

  // Handle priority selection change
  const handlePriorityChange = useCallback((activityId: string) => {
    setPrioritySelection(prev => prev === activityId ? null : activityId)
    setSubmitSuccess(false)
    setSubmitError(null)
  }, [])

  // Handle FCFS selection toggle
  const handleFcfsToggle = useCallback((activityId: string) => {
    setFcfsSelections(prev => {
      const next = new Set(prev)
      if (next.has(activityId)) {
        next.delete(activityId)
      } else {
        next.add(activityId)
      }
      return next
    })
    setSubmitSuccess(false)
    setSubmitError(null)
  }, [])

  // Submit selections
  const handleSubmit = useCallback(async () => {
    if (!selectedTermId || !selectedStudentId || !termDetails) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const selections: EcaSelectionSubmission['selections'] = []

      // FCFS mode - just add all selected activities
      if (termDetails.status === 'REGISTRATION_OPEN') {
        // Check selection mode from settings (we'll assume smart allocation for now based on the data)
        const hasRankedSelections = Object.values(rankedSelections).some(ranks => ranks.some(r => r))

        if (hasRankedSelections) {
          // Smart allocation mode
          Object.entries(rankedSelections).forEach(([_, ranks]) => {
            ranks.forEach((activityId, index) => {
              if (activityId) {
                selections.push({
                  activityId,
                  rank: index + 1,
                  isPriority: activityId === prioritySelection,
                })
              }
            })
          })
        } else {
          // FCFS mode
          fcfsSelections.forEach(activityId => {
            selections.push({
              activityId,
              rank: 1,
              isPriority: false,
            })
          })
        }
      }

      await api.eca.parent.submitSelections(selectedTermId, {
        studentId: selectedStudentId,
        selections,
      })

      setSubmitSuccess(true)
      refetchSelections()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit selections')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedTermId, selectedStudentId, termDetails, rankedSelections, prioritySelection, fcfsSelections, refetchSelections])

  // Handle invitation response
  const handleInvitationResponse = useCallback(async (invitationId: string, accept: boolean) => {
    try {
      await respondToInvitation(invitationId, accept)
      refetchInvitations()
      refetchTerm()
    } catch {
      // Silent fail
    }
  }, [respondToInvitation, refetchInvitations, refetchTerm])

  // Format date helper
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  }

  // Loading state
  if (termsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  // Error state
  if (termsError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: theme.colors.brandColor }}>
            {t('eca.title', 'Activities')}
          </h1>
          <p className="text-gray-600 mt-1">{t('eca.subtitle', 'Extra-curricular activities for your children')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-red-300 mb-4" />
          <p className="text-gray-500">{t('common.error', 'An error occurred. Please try again later.')}</p>
        </div>
      </div>
    )
  }

  // No terms available
  if (!terms || terms.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: theme.colors.brandColor }}>
            {t('eca.title', 'Activities')}
          </h1>
          <p className="text-gray-600 mt-1">{t('eca.subtitle', 'Extra-curricular activities for your children')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">{t('eca.noTerms', 'No activity terms are available at this time.')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: theme.colors.brandColor }}>
          {t('eca.title', 'Activities')}
        </h1>
        <p className="text-gray-600 mt-1">{t('eca.subtitle', 'Extra-curricular activities for your children')}</p>
      </div>

      {/* Child Selector (if multiple children) */}
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => setSelectedStudentId(child.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedStudentId === child.id
                  ? 'text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              style={
                selectedStudentId === child.id
                  ? { backgroundColor: theme.colors.brandColor }
                  : undefined
              }
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      {/* Term Selector */}
      {terms.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {terms.map(term => (
            <button
              key={term.id}
              onClick={() => setSelectedTermId(term.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedTermId === term.id
                  ? 'text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              style={
                selectedTermId === term.id
                  ? { backgroundColor: theme.colors.brandColor }
                  : undefined
              }
            >
              {term.name}
            </button>
          ))}
        </div>
      )}

      {/* Pending Invitations */}
      {studentInvitations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">
              {t('eca.invitations', 'Activity Invitations')}
            </h3>
          </div>
          <div className="space-y-3">
            {studentInvitations.map(inv => (
              <div
                key={inv.id}
                className="bg-white rounded-lg p-3 border border-amber-100"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{inv.activityName}</h4>
                    <p className="text-sm text-gray-600">
                      {DAY_NAMES[inv.dayOfWeek]} - {inv.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}
                    </p>
                    {inv.location && (
                      <p className="text-sm text-gray-500 flex items-center mt-1">
                        <MapPin className="h-3 w-3 mr-1" />
                        {inv.location}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {t('eca.invitedBy', 'Invited by {{name}}', { name: inv.invitedByName })}
                    </p>
                    {inv.isTryout && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                        {t('eca.tryout', 'Try-out')}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInvitationResponse(inv.id, true)}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                    >
                      {t('eca.accept', 'Accept')}
                    </button>
                    <button
                      onClick={() => handleInvitationResponse(inv.id, false)}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      {t('eca.decline', 'Decline')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading term details */}
      {termLoading && (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }}
          />
        </div>
      )}

      {/* Term Content */}
      {termDetails && termStatus && !termLoading && (
        <>
          {/* Before Registration Banner */}
          {termStatus.isBeforeRegistration && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-blue-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-blue-800">
                    {t('eca.registrationOpens', 'Registration Opens Soon')}
                  </h3>
                  <p className="text-sm text-blue-700">
                    {t('eca.registrationOpensOn', 'Registration opens on {{date}}', {
                      date: formatDate(termDetails.registrationOpens)
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Registration Open Banner */}
          {termStatus.isDuringRegistration && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-green-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-green-800">
                    {t('eca.registrationOpen', 'Registration is Open!')}
                  </h3>
                  <p className="text-sm text-green-700">
                    {t('eca.registrationClosesOn', 'Register by {{date}}', {
                      date: formatDate(termDetails.registrationCloses)
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Registration Closed Banner */}
          {termStatus.isAfterRegistration && !termStatus.isAllocated && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Lock className="h-6 w-6 text-amber-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-amber-800">
                    {t('eca.registrationClosed', 'Registration Closed')}
                  </h3>
                  <p className="text-sm text-amber-700">
                    {t('eca.allocationPending', 'Activity allocations will be announced soon.')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Allocated Activities */}
          {termStatus.isAllocated && studentAllocations && studentAllocations.allocations.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-lg font-bold" style={{ color: theme.colors.brandColor }}>
                  {t('eca.yourActivities', 'Your Activities')}
                </h2>
                <p className="text-sm text-gray-600">
                  {t('eca.allocatedFor', 'Allocated activities for {{name}}', {
                    name: studentAllocations.studentName
                  })}
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {studentAllocations.allocations
                  .filter(a => a.status === 'CONFIRMED')
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map(allocation => (
                    <div key={allocation.activityId} className="p-4 flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: theme.colors.brandColor }}
                      >
                        {DAY_NAMES_SHORT[allocation.dayOfWeek]}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{allocation.activityName}</h3>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {allocation.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}
                            {allocation.startTime && allocation.endTime && (
                              <span className="ml-1">({allocation.startTime} - {allocation.endTime})</span>
                            )}
                          </span>
                          {allocation.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {allocation.location}
                            </span>
                          )}
                          {allocation.staffName && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {allocation.staffName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-green-600">
                        <Check className="h-5 w-5" />
                        <span className="text-sm font-medium">{t('eca.confirmed', 'Confirmed')}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Activity Selection (during registration) */}
          {termStatus.isDuringRegistration && (
            <>
              {/* Activities by Day/Slot */}
              <div className="space-y-4">
                {daySlots.map(({ key, dayOfWeek, timeSlot }) => {
                  const activities = activitiesByDaySlot[key] || []
                  const eligibleActivities = activities.filter(a => a.isEligible)
                  const isExpanded = expandedDays[key] !== false // Default to expanded
                  const currentRanks = rankedSelections[key] || ['', '', '']

                  return (
                    <div
                      key={key}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                    >
                      {/* Day Header */}
                      <button
                        onClick={() => toggleDay(key)}
                        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                            style={{ backgroundColor: theme.colors.brandColor }}
                          >
                            {DAY_NAMES_SHORT[dayOfWeek]}
                          </div>
                          <div className="text-left">
                            <h3 className="font-semibold text-gray-900">
                              {DAY_NAMES[dayOfWeek]}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}
                              {' '}&middot;{' '}
                              {eligibleActivities.length} {t('eca.activitiesAvailable', 'activities available')}
                            </p>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        )}
                      </button>

                      {/* Activities List */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 p-4 space-y-4">
                          {/* Rank Selection (Smart Allocation) */}
                          <div className="grid gap-3 md:grid-cols-3">
                            {[1, 2, 3].map(rank => (
                              <div key={rank}>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  {rank === 1 ? t('eca.firstChoice', '1st Choice') :
                                   rank === 2 ? t('eca.secondChoice', '2nd Choice') :
                                   t('eca.thirdChoice', '3rd Choice')}
                                </label>
                                <select
                                  value={currentRanks[rank - 1] || ''}
                                  onChange={(e) => handleRankedChange(key, rank - 1, e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
                                  style={{ '--tw-ring-color': theme.colors.brandColor } as React.CSSProperties}
                                >
                                  <option value="">{t('eca.selectActivity', '-- Select --')}</option>
                                  {eligibleActivities.map(activity => {
                                    const isSelectedElsewhere = currentRanks.some(
                                      (r, i) => r === activity.id && i !== rank - 1
                                    )
                                    return (
                                      <option
                                        key={activity.id}
                                        value={activity.id}
                                        disabled={isSelectedElsewhere}
                                      >
                                        {activity.name}
                                        {activity.maxCapacity && activity.currentEnrollment !== undefined && (
                                          ` (${activity.currentEnrollment}/${activity.maxCapacity})`
                                        )}
                                      </option>
                                    )
                                  })}
                                </select>
                              </div>
                            ))}
                          </div>

                          {/* Activity Cards */}
                          <div className="space-y-2 mt-4">
                            {activities.map(activity => {
                              const isSelected = currentRanks.includes(activity.id) || fcfsSelections.has(activity.id)
                              const selectedRank = currentRanks.indexOf(activity.id) + 1
                              const isPriority = activity.id === prioritySelection

                              return (
                                <div
                                  key={activity.id}
                                  className={`p-3 rounded-lg border transition-colors ${
                                    isSelected
                                      ? 'border-2 bg-opacity-5'
                                      : activity.isEligible
                                      ? 'border-gray-200 hover:border-gray-300'
                                      : 'border-gray-100 bg-gray-50 opacity-60'
                                  }`}
                                  style={
                                    isSelected
                                      ? {
                                          borderColor: theme.colors.brandColor,
                                          backgroundColor: `${theme.colors.brandColor}10`,
                                        }
                                      : undefined
                                  }
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-gray-900">{activity.name}</h4>
                                        {isSelected && selectedRank > 0 && (
                                          <span
                                            className="px-1.5 py-0.5 text-xs font-medium rounded text-white"
                                            style={{ backgroundColor: theme.colors.brandColor }}
                                          >
                                            #{selectedRank}
                                          </span>
                                        )}
                                        {isPriority && (
                                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">
                                            <Star className="h-3 w-3" />
                                            Priority
                                          </span>
                                        )}
                                        {!activity.isEligible && (
                                          <span className="px-1.5 py-0.5 text-xs rounded bg-gray-200 text-gray-600">
                                            {activity.eligibilityReason || t('eca.notEligible', 'Not eligible')}
                                          </span>
                                        )}
                                      </div>
                                      {activity.description && (
                                        <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
                                      )}
                                      <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                                        {activity.location && (
                                          <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {activity.location}
                                          </span>
                                        )}
                                        {activity.staff && (
                                          <span className="flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            {activity.staff.name}
                                          </span>
                                        )}
                                        {activity.maxCapacity && (
                                          <span className="flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            {activity.currentEnrollment || 0}/{activity.maxCapacity} spots
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Priority toggle */}
                                    {activity.isEligible && isSelected && (
                                      <button
                                        onClick={() => handlePriorityChange(activity.id)}
                                        className={`p-2 rounded-lg transition-colors ${
                                          isPriority
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }`}
                                        title={t('eca.markPriority', 'Mark as priority')}
                                      >
                                        <Star className={`h-4 w-4 ${isPriority ? 'fill-current' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Submit Button */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                {submitError && (
                  <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">{submitError}</span>
                  </div>
                )}

                {submitSuccess && (
                  <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
                    <Check className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">{t('eca.selectionsSubmitted', 'Your selections have been submitted successfully!')}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    {Object.values(rankedSelections).flat().filter(Boolean).length > 0 ? (
                      <span>
                        {Object.values(rankedSelections).flat().filter(Boolean).length} {t('eca.activitiesSelected', 'activities selected')}
                        {prioritySelection && (
                          <span className="ml-2 text-amber-600">
                            <Star className="h-3 w-3 inline" /> 1 priority
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">{t('eca.noSelections', 'No activities selected yet')}</span>
                    )}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-6 py-2.5 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? t('eca.submitting', 'Submitting...') : t('eca.submitSelections', 'Submit Selections')}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* View submitted selections (after registration closed) */}
          {(termStatus.isAfterRegistration || termStatus.isBeforeRegistration) && currentSelections && (
            <>
              {currentSelections
                .filter(s => s.studentId === selectedStudentId)
                .map(studentSel => (
                  <div key={studentSel.studentId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                      <h2 className="text-lg font-bold" style={{ color: theme.colors.brandColor }}>
                        {t('eca.yourSelections', 'Your Selections')}
                      </h2>
                      <p className="text-sm text-gray-600">
                        {t('eca.submittedBy', 'Submitted selections for {{name}}', {
                          name: studentSel.studentName
                        })}
                      </p>
                    </div>
                    {studentSel.selections.length > 0 ? (
                      <div className="divide-y divide-gray-100">
                        {studentSel.selections
                          .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.rank - b.rank)
                          .map((sel, idx) => (
                            <div key={idx} className="p-4 flex items-center gap-4">
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: theme.colors.brandColor }}
                              >
                                {DAY_NAMES_SHORT[sel.dayOfWeek]}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium text-gray-900">{sel.activityName}</h3>
                                  <span
                                    className="px-1.5 py-0.5 text-xs font-medium rounded text-white"
                                    style={{ backgroundColor: theme.colors.brandColor }}
                                  >
                                    #{sel.rank}
                                  </span>
                                  {sel.isPriority && (
                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">
                                      <Star className="h-3 w-3" />
                                      Priority
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-500 mt-0.5">
                                  {DAY_NAMES[sel.dayOfWeek]} - {sel.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        {t('eca.noSelectionsSubmitted', 'No selections were submitted.')}
                      </div>
                    )}
                  </div>
                ))}
            </>
          )}

          {/* Activity Preview (before registration) */}
          {termStatus.isBeforeRegistration && termDetails.activities.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-lg font-bold" style={{ color: theme.colors.brandColor }}>
                  {t('eca.activityPreview', 'Available Activities')}
                </h2>
                <p className="text-sm text-gray-600">
                  {t('eca.previewNote', 'Preview of activities that will be available for registration')}
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {termDetails.activities
                  .filter(a => a.isEligible)
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map(activity => (
                    <div key={activity.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                          style={{ backgroundColor: theme.colors.brandColor }}
                        >
                          {DAY_NAMES_SHORT[activity.dayOfWeek]}
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{activity.name}</h3>
                          {activity.description && (
                            <p className="text-sm text-gray-600 mt-0.5">{activity.description}</p>
                          )}
                          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                            <span>
                              {DAY_NAMES[activity.dayOfWeek]} - {activity.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}
                            </span>
                            {activity.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {activity.location}
                              </span>
                            )}
                            {activity.staff && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {activity.staff.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
