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
import { useApi, useMutation, useAuth } from '@wasil/shared'
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
          className="w-8 h-8 border-4 rounded-full animate-spin"
          style={{ borderColor: '#F0E4E6', borderTopColor: '#C4506E' }}
        />
      </div>
    )
  }

  // Error state
  if (termsError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
            {t('eca.title', 'Activities')}
          </h1>
          <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>{t('eca.subtitle', 'Extra-curricular activities for your children')}</p>
        </div>
        <div className="bg-white p-12 text-center" style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}>
          <AlertCircle className="h-12 w-12 mx-auto mb-4" style={{ color: '#D8CDD0' }} />
          <p style={{ color: '#A8929A' }}>{t('common.error', 'An error occurred. Please try again later.')}</p>
        </div>
      </div>
    )
  }

  // No terms available
  if (!terms || terms.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
            {t('eca.title', 'Activities')}
          </h1>
          <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>{t('eca.subtitle', 'Extra-curricular activities for your children')}</p>
        </div>
        <div className="bg-white p-12 text-center" style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}>
          <Calendar className="h-12 w-12 mx-auto mb-4" style={{ color: '#D8CDD0' }} />
          <p style={{ color: '#A8929A' }}>{t('eca.noTerms', 'No activity terms are available at this time.')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
          {t('eca.title', 'Activities')}
        </h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>{t('eca.subtitle', 'Extra-curricular activities for your children')}</p>
      </div>

      {/* Child Selector (if multiple children) */}
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => setSelectedStudentId(child.id)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                selectedStudentId === child.id
                  ? 'text-white'
                  : 'bg-white'
              }`}
              style={
                selectedStudentId === child.id
                  ? { backgroundColor: '#C4506E' }
                  : { border: '1.5px solid #F0E4E6', color: '#7A6469' }
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
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                selectedTermId === term.id
                  ? 'text-white'
                  : 'bg-white'
              }`}
              style={
                selectedTermId === term.id
                  ? { backgroundColor: '#C4506E' }
                  : { border: '1.5px solid #F0E4E6', color: '#7A6469' }
              }
            >
              {term.name}
            </button>
          ))}
        </div>
      )}

      {/* Pending Invitations */}
      {studentInvitations.length > 0 && (
        <div className="p-4" style={{ backgroundColor: '#FFF7EC', border: '1.5px solid rgba(232,165,75,0.25)', borderRadius: '22px' }}>
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-5 w-5" style={{ color: '#E8A54B' }} />
            <h3 className="font-semibold" style={{ color: '#8B6820' }}>
              {t('eca.invitations', 'Activity Invitations')}
            </h3>
          </div>
          <div className="space-y-3">
            {studentInvitations.map(inv => (
              <div
                key={inv.id}
                className="bg-white p-3"
                style={{ borderRadius: '14px', border: '1.5px solid #F0E4E6' }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium" style={{ color: '#2D2225' }}>{inv.activityName}</h4>
                    <p className="text-sm" style={{ color: '#7A6469' }}>
                      {DAY_NAMES[inv.dayOfWeek]} - {inv.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}
                    </p>
                    {inv.location && (
                      <p className="text-sm flex items-center mt-1" style={{ color: '#A8929A' }}>
                        <MapPin className="h-3 w-3 mr-1" />
                        {inv.location}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: '#D8CDD0' }}>
                      {t('eca.invitedBy', 'Invited by {{name}}', { name: inv.invitedByName })}
                    </p>
                    {inv.isTryout && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded" style={{ backgroundColor: '#F3EEFC', color: '#8B6EAE' }}>
                        {t('eca.tryout', 'Try-out')}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInvitationResponse(inv.id, true)}
                      className="px-3 py-1.5 text-white text-sm font-bold transition-colors"
                      style={{ backgroundColor: '#5BA97B', borderRadius: '14px' }}
                    >
                      {t('eca.accept', 'Accept')}
                    </button>
                    <button
                      onClick={() => handleInvitationResponse(inv.id, false)}
                      className="px-3 py-1.5 text-sm font-bold transition-colors"
                      style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #F0E4E6', borderRadius: '14px', color: '#7A6469' }}
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
            className="w-8 h-8 border-4 rounded-full animate-spin"
            style={{ borderColor: '#F0E4E6', borderTopColor: '#C4506E' }}
          />
        </div>
      )}

      {/* Term Content */}
      {termDetails && termStatus && !termLoading && (
        <>
          {/* Before Registration Banner */}
          {termStatus.isBeforeRegistration && (
            <div className="p-4" style={{ backgroundColor: '#EDF4FC', border: '1.5px solid rgba(91,142,196,0.25)', borderRadius: '22px' }}>
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 flex-shrink-0" style={{ color: '#5B8EC4' }} />
                <div>
                  <h3 className="font-semibold" style={{ color: '#3A6A9E' }}>
                    {t('eca.registrationOpens', 'Registration Opens Soon')}
                  </h3>
                  <p className="text-sm" style={{ color: '#5B8EC4' }}>
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
            <div className="p-4" style={{ backgroundColor: '#EDFAF2', border: '1.5px solid rgba(91,169,123,0.25)', borderRadius: '22px' }}>
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 flex-shrink-0" style={{ color: '#5BA97B' }} />
                <div>
                  <h3 className="font-semibold" style={{ color: '#3D7A56' }}>
                    {t('eca.registrationOpen', 'Registration is Open!')}
                  </h3>
                  <p className="text-sm" style={{ color: '#5BA97B' }}>
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
            <div className="p-4" style={{ backgroundColor: '#FFF7EC', border: '1.5px solid rgba(232,165,75,0.25)', borderRadius: '22px' }}>
              <div className="flex items-center gap-3">
                <Lock className="h-6 w-6 flex-shrink-0" style={{ color: '#E8A54B' }} />
                <div>
                  <h3 className="font-semibold" style={{ color: '#8B6820' }}>
                    {t('eca.registrationClosed', 'Registration Closed')}
                  </h3>
                  <p className="text-sm" style={{ color: '#E8A54B' }}>
                    {t('eca.allocationPending', 'Activity allocations will be announced soon.')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Allocated Activities */}
          {termStatus.isAllocated && studentAllocations && studentAllocations.allocations.length > 0 && (
            <div className="bg-white overflow-hidden" style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}>
              <div className="p-4" style={{ borderBottom: '1px solid #F0E4E6' }}>
                <h2 className="text-lg font-bold" style={{ color: '#2D2225' }}>
                  {t('eca.yourActivities', 'Your Activities')}
                </h2>
                <p className="text-sm" style={{ color: '#7A6469' }}>
                  {t('eca.allocatedFor', 'Allocated activities for {{name}}', {
                    name: studentAllocations.studentName
                  })}
                </p>
              </div>
              <div>
                {studentAllocations.allocations
                  .filter(a => a.status === 'CONFIRMED')
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map(allocation => (
                    <div key={allocation.activityId} className="p-4 flex items-center gap-4" style={{ borderBottom: '1px solid #F0E4E6' }}>
                      <div
                        className="w-12 h-12 flex items-center justify-center font-bold"
                        style={{ backgroundColor: '#FFF0F3', color: '#C4506E', borderRadius: '12px' }}
                      >
                        {DAY_NAMES_SHORT[allocation.dayOfWeek]}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium" style={{ color: '#2D2225' }}>{allocation.activityName}</h3>
                        <div className="flex flex-wrap gap-3 text-sm mt-1" style={{ color: '#A8929A' }}>
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
                      <div className="flex items-center gap-1" style={{ color: '#5BA97B' }}>
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
                      className="bg-white overflow-hidden"
                      style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                    >
                      {/* Day Header */}
                      <button
                        onClick={() => toggleDay(key)}
                        className="w-full p-4 flex items-center justify-between transition-colors"
                        style={{ borderRadius: '22px' }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 flex items-center justify-center font-bold text-sm"
                            style={{ backgroundColor: '#FFF0F3', color: '#C4506E', borderRadius: '12px' }}
                          >
                            {DAY_NAMES_SHORT[dayOfWeek]}
                          </div>
                          <div className="text-left">
                            <h3 className="font-bold" style={{ color: '#2D2225' }}>
                              {DAY_NAMES[dayOfWeek]}
                            </h3>
                            <p className="text-sm" style={{ color: '#A8929A' }}>
                              {timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}
                              {' '}&middot;{' '}
                              {eligibleActivities.length} {t('eca.activitiesAvailable', 'activities available')}
                            </p>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" style={{ color: '#D8CDD0' }} />
                        ) : (
                          <ChevronDown className="h-5 w-5" style={{ color: '#D8CDD0' }} />
                        )}
                      </button>

                      {/* Activities List */}
                      {isExpanded && (
                        <div className="p-4 space-y-4" style={{ borderTop: '1px solid #F0E4E6' }}>
                          {/* Rank Selection (Smart Allocation) */}
                          <div className="grid gap-3 md:grid-cols-3">
                            {[1, 2, 3].map(rank => (
                              <div key={rank}>
                                <label className="block text-sm font-medium mb-1" style={{ color: '#7A6469' }}>
                                  {rank === 1 ? t('eca.firstChoice', '1st Choice') :
                                   rank === 2 ? t('eca.secondChoice', '2nd Choice') :
                                   t('eca.thirdChoice', '3rd Choice')}
                                </label>
                                <select
                                  value={currentRanks[rank - 1] || ''}
                                  onChange={(e) => handleRankedChange(key, rank - 1, e.target.value)}
                                  className="w-full px-3 py-2 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
                                  style={{ border: '1.5px solid #F0E4E6', borderRadius: '14px', color: '#2D2225', '--tw-ring-color': '#C4506E' } as React.CSSProperties}
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
                                  className={`p-3 transition-colors ${
                                    isSelected
                                      ? ''
                                      : activity.isEligible
                                      ? ''
                                      : 'opacity-60'
                                  }`}
                                  style={
                                    isSelected
                                      ? {
                                          backgroundColor: '#FFF0F3',
                                          border: '2px solid #C4506E',
                                          borderRadius: '14px',
                                        }
                                      : activity.isEligible
                                      ? { border: '1.5px solid #F0E4E6', borderRadius: '14px' }
                                      : { border: '1.5px solid #F0E4E6', borderRadius: '14px', backgroundColor: '#FFF8F4' }
                                  }
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-medium" style={{ color: '#2D2225' }}>{activity.name}</h4>
                                        {isSelected && selectedRank > 0 && (
                                          <span
                                            className="px-1.5 py-0.5 text-xs font-medium rounded text-white"
                                            style={{ backgroundColor: '#C4506E' }}
                                          >
                                            #{selectedRank}
                                          </span>
                                        )}
                                        {isPriority && (
                                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded" style={{ backgroundColor: '#FFF7EC', color: '#E8A54B' }}>
                                            <Star className="h-3 w-3" />
                                            Priority
                                          </span>
                                        )}
                                        {!activity.isEligible && (
                                          <span className="px-1.5 py-0.5 text-xs rounded" style={{ backgroundColor: '#F0E4E6', color: '#7A6469' }}>
                                            {activity.eligibilityReason || t('eca.notEligible', 'Not eligible')}
                                          </span>
                                        )}
                                      </div>
                                      {activity.description && (
                                        <p className="text-sm mt-1" style={{ color: '#7A6469' }}>{activity.description}</p>
                                      )}
                                      <div className="flex flex-wrap gap-3 text-xs mt-2" style={{ color: '#A8929A' }}>
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
                                        {(activity.cost || activity.costDescription) && (
                                          <span
                                            className="font-bold px-2 py-0.5 rounded-md text-[11px]"
                                            style={{ backgroundColor: '#FFF7EC', color: '#8B5E0F' }}
                                          >
                                            {activity.costDescription || `${activity.cost} AED`}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Priority toggle */}
                                    {activity.isEligible && isSelected && (
                                      <button
                                        onClick={() => handlePriorityChange(activity.id)}
                                        className="p-2 transition-colors"
                                        style={
                                          isPriority
                                            ? { backgroundColor: '#FFF7EC', color: '#E8A54B', borderRadius: '12px' }
                                            : { backgroundColor: '#FFF8F4', color: '#D8CDD0', borderRadius: '12px' }
                                        }
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
              <div className="bg-white p-4" style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}>
                {submitError && (
                  <div className="flex items-center gap-2 p-3 mb-4" style={{ backgroundColor: '#FEF2F2', border: '1.5px solid rgba(209,77,77,0.25)', borderRadius: '14px', color: '#D14D4D' }}>
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">{submitError}</span>
                  </div>
                )}

                {submitSuccess && (
                  <div className="flex items-center gap-2 p-3 mb-4" style={{ backgroundColor: '#EDFAF2', border: '1.5px solid rgba(91,169,123,0.25)', borderRadius: '14px', color: '#5BA97B' }}>
                    <Check className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">{t('eca.selectionsSubmitted', 'Your selections have been submitted successfully!')}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="text-sm" style={{ color: '#7A6469' }}>
                    {Object.values(rankedSelections).flat().filter(Boolean).length > 0 ? (
                      <span>
                        {Object.values(rankedSelections).flat().filter(Boolean).length} {t('eca.activitiesSelected', 'activities selected')}
                        {prioritySelection && (
                          <span className="ml-2" style={{ color: '#E8A54B' }}>
                            <Star className="h-3 w-3 inline" /> 1 priority
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: '#D8CDD0' }}>{t('eca.noSelections', 'No activities selected yet')}</span>
                    )}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-6 py-2.5 text-white font-bold transition-colors disabled:opacity-50"
                    style={{ backgroundColor: '#C4506E', borderRadius: '14px' }}
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
                  <div key={studentSel.studentId} className="bg-white overflow-hidden" style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}>
                    <div className="p-4" style={{ borderBottom: '1px solid #F0E4E6' }}>
                      <h2 className="text-lg font-bold" style={{ color: '#2D2225' }}>
                        {t('eca.yourSelections', 'Your Selections')}
                      </h2>
                      <p className="text-sm" style={{ color: '#7A6469' }}>
                        {t('eca.submittedBy', 'Submitted selections for {{name}}', {
                          name: studentSel.studentName
                        })}
                      </p>
                    </div>
                    {studentSel.selections.length > 0 ? (
                      <div>
                        {studentSel.selections
                          .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.rank - b.rank)
                          .map((sel, idx) => (
                            <div key={idx} className="p-4 flex items-center gap-4" style={{ borderBottom: '1px solid #F0E4E6' }}>
                              <div
                                className="w-10 h-10 flex items-center justify-center font-bold text-sm"
                                style={{ backgroundColor: '#FFF0F3', color: '#C4506E', borderRadius: '12px' }}
                              >
                                {DAY_NAMES_SHORT[sel.dayOfWeek]}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium" style={{ color: '#2D2225' }}>{sel.activityName}</h3>
                                  <span
                                    className="px-1.5 py-0.5 text-xs font-medium rounded text-white"
                                    style={{ backgroundColor: '#C4506E' }}
                                  >
                                    #{sel.rank}
                                  </span>
                                  {sel.isPriority && (
                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded" style={{ backgroundColor: '#FFF7EC', color: '#E8A54B' }}>
                                      <Star className="h-3 w-3" />
                                      Priority
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm mt-0.5" style={{ color: '#A8929A' }}>
                                  {DAY_NAMES[sel.dayOfWeek]} - {sel.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center" style={{ color: '#A8929A' }}>
                        {t('eca.noSelectionsSubmitted', 'No selections were submitted.')}
                      </div>
                    )}
                  </div>
                ))}
            </>
          )}

          {/* Activity Preview (before registration) */}
          {termStatus.isBeforeRegistration && termDetails.activities.length > 0 && (
            <div className="bg-white overflow-hidden" style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}>
              <div className="p-4" style={{ borderBottom: '1px solid #F0E4E6' }}>
                <h2 className="text-lg font-bold" style={{ color: '#2D2225' }}>
                  {t('eca.activityPreview', 'Available Activities')}
                </h2>
                <p className="text-sm" style={{ color: '#7A6469' }}>
                  {t('eca.previewNote', 'Preview of activities that will be available for registration')}
                </p>
              </div>
              <div>
                {termDetails.activities
                  .filter(a => a.isEligible)
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map(activity => (
                    <div key={activity.id} className="p-4" style={{ borderBottom: '1px solid #F0E4E6' }}>
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{ backgroundColor: '#FFF0F3', color: '#C4506E', borderRadius: '12px' }}
                        >
                          {DAY_NAMES_SHORT[activity.dayOfWeek]}
                        </div>
                        <div>
                          <h3 className="font-medium" style={{ color: '#2D2225' }}>{activity.name}</h3>
                          {activity.description && (
                            <p className="text-sm mt-0.5" style={{ color: '#7A6469' }}>{activity.description}</p>
                          )}
                          <div className="flex flex-wrap gap-3 text-xs mt-2" style={{ color: '#A8929A' }}>
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
                            {(activity.cost || activity.costDescription) && (
                              <span
                                className="font-bold px-2 py-0.5 rounded-md text-[11px]"
                                style={{ backgroundColor: '#FFF7EC', color: '#8B5E0F' }}
                              >
                                {activity.costDescription || `${activity.cost} AED`}
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
