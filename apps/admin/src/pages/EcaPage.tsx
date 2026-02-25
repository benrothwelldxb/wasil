import React, { useState, useEffect } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Calendar,
  Clock,
  Settings,
  ChevronRight,
  Play,
  Check,
  X,
  UserPlus,
  UserMinus,
  AlertTriangle,
  MapPin,
  FileText,
  Eye,
} from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type {
  EcaSettings,
  EcaTerm,
  EcaTermWithActivities,
  EcaActivity,
  EcaTermStatus,
  EcaTimeSlot,
  EcaActivityType,
  EcaGender,
  EcaSelectionMode,
  EcaAllocationPreview,
  GroupCategory,
  YearGroup,
} from '@wasil/shared'
import { StudentSearchSelect } from '../components/StudentSearchSelect'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TIME_SLOTS: { value: EcaTimeSlot; label: string }[] = [
  { value: 'BEFORE_SCHOOL', label: 'Before School' },
  { value: 'AFTER_SCHOOL', label: 'After School' },
]
const ACTIVITY_TYPES: { value: EcaActivityType; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'INVITE_ONLY', label: 'Invite Only' },
  { value: 'COMPULSORY', label: 'Compulsory' },
  { value: 'TRYOUT', label: 'Try-out Based' },
]
const GENDER_OPTIONS: { value: EcaGender; label: string }[] = [
  { value: 'MIXED', label: 'Mixed' },
  { value: 'BOYS_ONLY', label: 'Boys Only' },
  { value: 'GIRLS_ONLY', label: 'Girls Only' },
]
const TERM_STATUS_LABELS: Record<EcaTermStatus, string> = {
  DRAFT: 'Draft',
  REGISTRATION_OPEN: 'Registration Open',
  REGISTRATION_CLOSED: 'Registration Closed',
  ALLOCATION_COMPLETE: 'Allocation Complete',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
}
const TERM_STATUS_COLORS: Record<EcaTermStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  REGISTRATION_OPEN: 'bg-green-100 text-green-700',
  REGISTRATION_CLOSED: 'bg-yellow-100 text-yellow-700',
  ALLOCATION_COMPLETE: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
}

export function EcaPage() {
  const theme = useTheme()
  const [activeTab, setActiveTab] = useState<'settings' | 'terms'>('terms')
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null)

  // Settings
  const { data: settings, refetch: refetchSettings } = useApi<EcaSettings>(
    () => api.eca.getSettings(),
    []
  )
  const [settingsForm, setSettingsForm] = useState<{
    selectionMode: EcaSelectionMode
    attendanceEnabled: boolean
    maxPriorityChoices: number
    maxChoicesPerDay: number
  }>({
    selectionMode: 'FIRST_COME_FIRST_SERVED',
    attendanceEnabled: false,
    maxPriorityChoices: 1,
    maxChoicesPerDay: 3,
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // Terms
  const { data: terms, refetch: refetchTerms, isLoading: loadingTerms } = useApi<EcaTerm[]>(
    () => api.eca.listTerms(),
    []
  )

  // Selected term detail
  const { data: selectedTerm, refetch: refetchTerm } = useApi<EcaTermWithActivities | null>(
    () => selectedTermId ? api.eca.getTerm(selectedTermId) : Promise.resolve(null),
    [selectedTermId]
  )

  // Supporting data
  const { data: categories } = useApi<GroupCategory[]>(() => api.groups.listCategories(), [])
  const { data: yearGroups } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])
  const { data: staffList } = useApi(() => api.staff.list(), [])

  // Form states
  const [showTermForm, setShowTermForm] = useState(false)
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [editingTerm, setEditingTerm] = useState<EcaTerm | null>(null)
  const [editingActivity, setEditingActivity] = useState<EcaActivity | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'term' | 'activity'; id: string; name: string } | null>(null)

  // Term form
  const [termForm, setTermForm] = useState({
    name: '',
    termNumber: 1,
    academicYear: new Date().getFullYear() + '/' + (new Date().getFullYear() + 1).toString().slice(-2),
    startDate: '',
    endDate: '',
    registrationOpens: '',
    registrationCloses: '',
    defaultBeforeSchoolStart: '07:30',
    defaultBeforeSchoolEnd: '08:15',
    defaultAfterSchoolStart: '15:30',
    defaultAfterSchoolEnd: '16:30',
  })

  // Activity form
  const [activityForm, setActivityForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    dayOfWeek: 1,
    timeSlot: 'AFTER_SCHOOL' as EcaTimeSlot,
    customStartTime: '',
    customEndTime: '',
    location: '',
    activityType: 'OPEN' as EcaActivityType,
    eligibleYearGroupIds: [] as string[],
    eligibleGender: 'MIXED' as EcaGender,
    minCapacity: '',
    maxCapacity: '',
    staffId: '',
  })

  // Allocation
  const [allocationPreview, setAllocationPreview] = useState<EcaAllocationPreview | null>(null)
  const [showAllocationModal, setShowAllocationModal] = useState(false)
  const [runningAllocation, setRunningAllocation] = useState(false)
  const [selectedAllocationMode, setSelectedAllocationMode] = useState<EcaSelectionMode>('FIRST_COME_FIRST_SERVED')
  const [cancelBelowMinimum, setCancelBelowMinimum] = useState(true)
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false)

  // Activity management
  const [showStudentsModal, setShowStudentsModal] = useState(false)
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<EcaActivity | null>(null)
  const [activityStudents, setActivityStudents] = useState<any[]>([])
  const [activityWaitlist, setActivityWaitlist] = useState<any[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)

  // Student add
  const [selectedStudentsToAdd, setSelectedStudentsToAdd] = useState<{ id: string; fullName: string; className: string }[]>([])

  // Update settings form when data loads
  useEffect(() => {
    if (settings) {
      setSettingsForm({
        selectionMode: settings.selectionMode,
        attendanceEnabled: settings.attendanceEnabled,
        maxPriorityChoices: settings.maxPriorityChoices,
        maxChoicesPerDay: settings.maxChoicesPerDay,
      })
    }
  }, [settings])

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await api.eca.updateSettings(settingsForm)
      refetchSettings()
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSavingSettings(false)
    }
  }

  const resetTermForm = () => {
    setShowTermForm(false)
    setEditingTerm(null)
    setTermForm({
      name: '',
      termNumber: 1,
      academicYear: new Date().getFullYear() + '/' + (new Date().getFullYear() + 1).toString().slice(-2),
      startDate: '',
      endDate: '',
      registrationOpens: '',
      registrationCloses: '',
      defaultBeforeSchoolStart: '07:30',
      defaultBeforeSchoolEnd: '08:15',
      defaultAfterSchoolStart: '15:30',
      defaultAfterSchoolEnd: '16:30',
    })
  }

  const resetActivityForm = () => {
    setShowActivityForm(false)
    setEditingActivity(null)
    setActivityForm({
      name: '',
      description: '',
      categoryId: '',
      dayOfWeek: 1,
      timeSlot: 'AFTER_SCHOOL',
      customStartTime: '',
      customEndTime: '',
      location: '',
      activityType: 'OPEN',
      eligibleYearGroupIds: [],
      eligibleGender: 'MIXED',
      minCapacity: '',
      maxCapacity: '',
      staffId: '',
    })
  }

  const handleEditTerm = (term: EcaTerm) => {
    setEditingTerm(term)
    setTermForm({
      name: term.name,
      termNumber: term.termNumber,
      academicYear: term.academicYear,
      startDate: term.startDate.split('T')[0],
      endDate: term.endDate.split('T')[0],
      registrationOpens: term.registrationOpens.split('T')[0],
      registrationCloses: term.registrationCloses.split('T')[0],
      defaultBeforeSchoolStart: term.defaultBeforeSchoolStart || '07:30',
      defaultBeforeSchoolEnd: term.defaultBeforeSchoolEnd || '08:15',
      defaultAfterSchoolStart: term.defaultAfterSchoolStart || '15:30',
      defaultAfterSchoolEnd: term.defaultAfterSchoolEnd || '16:30',
    })
    setShowTermForm(true)
  }

  const handleEditActivity = (activity: EcaActivity) => {
    setEditingActivity(activity)
    setActivityForm({
      name: activity.name,
      description: activity.description || '',
      categoryId: activity.categoryId || '',
      dayOfWeek: activity.dayOfWeek,
      timeSlot: activity.timeSlot,
      customStartTime: activity.customStartTime || '',
      customEndTime: activity.customEndTime || '',
      location: activity.location || '',
      activityType: activity.activityType,
      eligibleYearGroupIds: activity.eligibleYearGroupIds || [],
      eligibleGender: activity.eligibleGender,
      minCapacity: activity.minCapacity?.toString() || '',
      maxCapacity: activity.maxCapacity?.toString() || '',
      staffId: activity.staffId || '',
    })
    setShowActivityForm(true)
  }

  const handleSubmitTerm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!termForm.name.trim()) return

    setIsSubmitting(true)
    try {
      if (editingTerm) {
        await api.eca.updateTerm(editingTerm.id, {
          name: termForm.name,
          startDate: termForm.startDate,
          endDate: termForm.endDate,
          registrationOpens: termForm.registrationOpens,
          registrationCloses: termForm.registrationCloses,
          defaultBeforeSchoolStart: termForm.defaultBeforeSchoolStart,
          defaultBeforeSchoolEnd: termForm.defaultBeforeSchoolEnd,
          defaultAfterSchoolStart: termForm.defaultAfterSchoolStart,
          defaultAfterSchoolEnd: termForm.defaultAfterSchoolEnd,
        })
      } else {
        const newTerm = await api.eca.createTerm({
          name: termForm.name,
          termNumber: termForm.termNumber,
          academicYear: termForm.academicYear,
          startDate: termForm.startDate,
          endDate: termForm.endDate,
          registrationOpens: termForm.registrationOpens,
          registrationCloses: termForm.registrationCloses,
          defaultBeforeSchoolStart: termForm.defaultBeforeSchoolStart,
          defaultBeforeSchoolEnd: termForm.defaultBeforeSchoolEnd,
          defaultAfterSchoolStart: termForm.defaultAfterSchoolStart,
          defaultAfterSchoolEnd: termForm.defaultAfterSchoolEnd,
        })
        setSelectedTermId(newTerm.id)
      }
      resetTermForm()
      refetchTerms()
      if (selectedTermId) refetchTerm()
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activityForm.name.trim() || !selectedTermId) return

    setIsSubmitting(true)
    try {
      const data = {
        name: activityForm.name,
        description: activityForm.description || undefined,
        categoryId: activityForm.categoryId || undefined,
        dayOfWeek: activityForm.dayOfWeek,
        timeSlot: activityForm.timeSlot,
        customStartTime: activityForm.customStartTime || undefined,
        customEndTime: activityForm.customEndTime || undefined,
        location: activityForm.location || undefined,
        activityType: activityForm.activityType,
        eligibleYearGroupIds: activityForm.eligibleYearGroupIds,
        eligibleGender: activityForm.eligibleGender,
        minCapacity: activityForm.minCapacity ? parseInt(activityForm.minCapacity) : undefined,
        maxCapacity: activityForm.maxCapacity ? parseInt(activityForm.maxCapacity) : undefined,
        staffId: activityForm.staffId || undefined,
      }

      if (editingActivity) {
        await api.eca.updateActivity(editingActivity.id, data)
      } else {
        await api.eca.createActivity(selectedTermId, data)
      }
      resetActivityForm()
      refetchTerm()
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'term') {
        await api.eca.deleteTerm(deleteConfirm.id)
        if (selectedTermId === deleteConfirm.id) {
          setSelectedTermId(null)
        }
        refetchTerms()
      } else {
        await api.eca.deleteActivity(deleteConfirm.id)
        refetchTerm()
      }
      setDeleteConfirm(null)
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleTermStatusChange = async (termId: string, newStatus: EcaTermStatus) => {
    try {
      await api.eca.updateTermStatus(termId, newStatus)
      refetchTerms()
      if (selectedTermId === termId) refetchTerm()
    } catch (error) {
      alert(`Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handlePreviewAllocation = async (mode?: EcaSelectionMode) => {
    if (!selectedTermId) return
    try {
      const preview = await api.eca.previewAllocation(selectedTermId, mode)
      setAllocationPreview(preview)
      setSelectedAllocationMode(preview.defaultSelectionMode)
      setCancelBelowMinimum(true)
      setShowCancelConfirmation(false)
      setShowAllocationModal(true)
    } catch (error) {
      alert(`Failed to preview: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleModeChange = async (newMode: EcaSelectionMode) => {
    setSelectedAllocationMode(newMode)
    if (!selectedTermId) return
    try {
      const preview = await api.eca.previewAllocation(selectedTermId, newMode)
      setAllocationPreview(preview)
    } catch (error) {
      alert(`Failed to update preview: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRunAllocation = async () => {
    if (!selectedTermId) return

    // If there are activities to cancel and user hasn't confirmed, show confirmation
    const activitiesToCancel = allocationPreview?.activities.filter(a => a.willBeCancelled) || []
    if (cancelBelowMinimum && activitiesToCancel.length > 0 && !showCancelConfirmation) {
      setShowCancelConfirmation(true)
      return
    }

    setRunningAllocation(true)
    try {
      const result = await api.eca.runAllocation(selectedTermId, {
        selectionMode: selectedAllocationMode,
        cancelBelowMinimum,
      })

      let message = `Allocation complete: ${result.allocations} students allocated, ${result.waitlisted} waitlisted`
      if (result.cancelledActivities > 0) {
        message += `, ${result.cancelledActivities} activities cancelled`
        if (result.cancelledActivityNames && result.cancelledActivityNames.length > 0) {
          message += ` (${result.cancelledActivityNames.join(', ')})`
        }
      }
      alert(message)
      setShowAllocationModal(false)
      setShowCancelConfirmation(false)
      refetchTerm()
    } catch (error) {
      alert(`Failed to run allocation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setRunningAllocation(false)
    }
  }

  const handlePublishAllocation = async () => {
    if (!selectedTermId) return
    try {
      await api.eca.publishAllocation(selectedTermId)
      alert('Allocation published successfully')
      refetchTerm()
      refetchTerms()
    } catch (error) {
      alert(`Failed to publish: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const openStudentsModal = async (activity: EcaActivity) => {
    setSelectedActivity(activity)
    setShowStudentsModal(true)
    setLoadingStudents(true)
    try {
      const [students, waitlist] = await Promise.all([
        api.eca.getActivityStudents(activity.id),
        api.eca.getActivityWaitlist(activity.id),
      ])
      setActivityStudents(students)
      setActivityWaitlist(waitlist)
    } catch (error) {
      console.error('Failed to load students:', error)
    } finally {
      setLoadingStudents(false)
    }
  }

  const closeStudentsModal = () => {
    setShowStudentsModal(false)
    setSelectedActivity(null)
    setActivityStudents([])
    setActivityWaitlist([])
    setSelectedStudentsToAdd([])
  }

  const handleAddStudent = async () => {
    if (!selectedActivity || selectedStudentsToAdd.length === 0) return
    try {
      for (const student of selectedStudentsToAdd) {
        await api.eca.addStudentToActivity(selectedActivity.id, student.id)
      }
      const students = await api.eca.getActivityStudents(selectedActivity.id)
      setActivityStudents(students)
      setSelectedStudentsToAdd([])
      refetchTerm()
    } catch (error) {
      alert(`Failed to add: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRemoveStudent = async (studentId: string) => {
    if (!selectedActivity) return
    try {
      await api.eca.removeStudentFromActivity(selectedActivity.id, studentId)
      setActivityStudents(activityStudents.filter(s => s.studentId !== studentId))
      refetchTerm()
    } catch (error) {
      alert(`Failed to remove: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handlePromoteFromWaitlist = async (studentId: string) => {
    if (!selectedActivity) return
    try {
      await api.eca.promoteFromWaitlist(selectedActivity.id, studentId)
      const [students, waitlist] = await Promise.all([
        api.eca.getActivityStudents(selectedActivity.id),
        api.eca.getActivityWaitlist(selectedActivity.id),
      ])
      setActivityStudents(students)
      setActivityWaitlist(waitlist)
      refetchTerm()
    } catch (error) {
      alert(`Failed to promote: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const openAttendanceExport = async (activity: EcaActivity) => {
    try {
      const html = await api.eca.exportAttendanceHtml(activity.id, undefined, undefined, true)
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
      }
    } catch (error) {
      alert(`Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  if (loadingTerms) {
    return (
      <div className="p-6 flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Extra-Curricular Activities</h1>
          <p className="text-gray-600 mt-1">Manage ECA registration, allocation, and scheduling</p>
        </div>
        {activeTab === 'terms' && !selectedTermId && (
          <button
            onClick={() => setShowTermForm(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-5 h-5" />
            <span>Add Term</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      {!selectedTermId && (
        <div className="flex space-x-1 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('terms')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'terms'
                ? 'border-current text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'terms' ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
          >
            <Calendar className="w-4 h-4 inline mr-2" />
            Terms
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'settings'
                ? 'border-current text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'settings' ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
          >
            <Settings className="w-4 h-4 inline mr-2" />
            Settings
          </button>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && !selectedTermId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          <h2 className="text-lg font-semibold mb-6">ECA Settings</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Selection Mode</label>
              <select
                value={settingsForm.selectionMode}
                onChange={(e) => setSettingsForm({ ...settingsForm, selectionMode: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="FIRST_COME_FIRST_SERVED">First Come First Served</option>
                <option value="SMART_ALLOCATION">Smart Allocation (Ranked Choices)</option>
              </select>
              <p className="text-sm text-gray-500 mt-1">
                {settingsForm.selectionMode === 'FIRST_COME_FIRST_SERVED'
                  ? 'Parents select activities and are immediately allocated if space is available.'
                  : 'Parents rank their choices and allocation is run after registration closes.'}
              </p>
            </div>

            {settingsForm.selectionMode === 'SMART_ALLOCATION' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority Choices Per Week</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={settingsForm.maxPriorityChoices}
                    onChange={(e) => setSettingsForm({ ...settingsForm, maxPriorityChoices: parseInt(e.target.value) || 0 })}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Number of activities parents can mark as high priority.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ranked Choices Per Day/Slot</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={settingsForm.maxChoicesPerDay}
                    onChange={(e) => setSettingsForm({ ...settingsForm, maxChoicesPerDay: parseInt(e.target.value) || 1 })}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Number of ranked choices per time slot (1st, 2nd, 3rd choice).
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="attendanceEnabled"
                checked={settingsForm.attendanceEnabled}
                onChange={(e) => setSettingsForm({ ...settingsForm, attendanceEnabled: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="attendanceEnabled" className="text-sm text-gray-700">
                Enable attendance tracking for ECA sessions
              </label>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-6 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Terms List */}
      {activeTab === 'terms' && !selectedTermId && (
        <>
          {(terms || []).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No ECA terms yet. Create a term to start managing activities.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(terms || []).map(term => (
                <div
                  key={term.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-gray-300 cursor-pointer transition-colors"
                  onClick={() => setSelectedTermId(term.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{term.name}</h3>
                        <p className="text-sm text-gray-500">
                          {new Date(term.startDate).toLocaleDateString()} - {new Date(term.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${TERM_STATUS_COLORS[term.status]}`}>
                        {TERM_STATUS_LABELS[term.status]}
                      </span>
                    </div>
                    <div className="flex items-center space-x-6 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">{term.activityCount || 0}</span> activities
                      </div>
                      <div>
                        <span className="font-medium">{term.selectionCount || 0}</span> selections
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Term Detail View */}
      {selectedTermId && selectedTerm && (
        <div>
          {/* Back button and term header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSelectedTermId(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedTerm.name}</h2>
                <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                  <span>{new Date(selectedTerm.startDate).toLocaleDateString()} - {new Date(selectedTerm.endDate).toLocaleDateString()}</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${TERM_STATUS_COLORS[selectedTerm.status]}`}>
                    {TERM_STATUS_LABELS[selectedTerm.status]}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {selectedTerm.status === 'DRAFT' && (
                <button
                  onClick={() => handleTermStatusChange(selectedTerm.id, 'REGISTRATION_OPEN')}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700"
                >
                  <Play className="w-4 h-4" />
                  <span>Open Registration</span>
                </button>
              )}
              {selectedTerm.status === 'REGISTRATION_OPEN' && (
                <button
                  onClick={() => handleTermStatusChange(selectedTerm.id, 'REGISTRATION_CLOSED')}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white bg-yellow-600 hover:bg-yellow-700"
                >
                  <X className="w-4 h-4" />
                  <span>Close Registration</span>
                </button>
              )}
              {selectedTerm.status === 'REGISTRATION_CLOSED' && !selectedTerm.allocationRun && (
                <button
                  onClick={() => handlePreviewAllocation()}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  <Play className="w-4 h-4" />
                  <span>Run Allocation</span>
                </button>
              )}
              {selectedTerm.status === 'REGISTRATION_CLOSED' && selectedTerm.allocationRun && (
                <button
                  onClick={handlePublishAllocation}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Check className="w-4 h-4" />
                  <span>Publish Results</span>
                </button>
              )}
              {selectedTerm.status === 'ALLOCATION_COMPLETE' && (
                <button
                  onClick={() => handleTermStatusChange(selectedTerm.id, 'ACTIVE')}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white bg-purple-600 hover:bg-purple-700"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Term</span>
                </button>
              )}
              {selectedTerm.status === 'ACTIVE' && (
                <button
                  onClick={() => handleTermStatusChange(selectedTerm.id, 'COMPLETED')}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white bg-gray-600 hover:bg-gray-700"
                >
                  <Check className="w-4 h-4" />
                  <span>Complete Term</span>
                </button>
              )}
              <button
                onClick={() => handleEditTerm(selectedTerm)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                <Pencil className="w-5 h-5" />
              </button>
              {selectedTerm.status === 'DRAFT' && (
                <button
                  onClick={() => setDeleteConfirm({ type: 'term', id: selectedTerm.id, name: selectedTerm.name })}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Term info card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Registration Opens</p>
                <p className="font-medium">{new Date(selectedTerm.registrationOpens).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-gray-500">Registration Closes</p>
                <p className="font-medium">{new Date(selectedTerm.registrationCloses).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-gray-500">Before School</p>
                <p className="font-medium">
                  {selectedTerm.defaultBeforeSchoolStart || '07:30'} - {selectedTerm.defaultBeforeSchoolEnd || '08:15'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">After School</p>
                <p className="font-medium">
                  {selectedTerm.defaultAfterSchoolStart || '15:30'} - {selectedTerm.defaultAfterSchoolEnd || '16:30'}
                </p>
              </div>
            </div>
          </div>

          {/* Activities */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Activities ({selectedTerm.activities?.length || 0})</h3>
            {selectedTerm.status === 'DRAFT' && (
              <button
                onClick={() => setShowActivityForm(true)}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                <Plus className="w-4 h-4" />
                <span>Add Activity</span>
              </button>
            )}
          </div>

          {(selectedTerm.activities || []).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No activities yet. Add activities for students to select.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(selectedTerm.activities || []).map(activity => (
                <div
                  key={activity.id}
                  className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 ${activity.isCancelled ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-900">{activity.name}</h4>
                      <div className="flex items-center space-x-2 mt-1 text-sm text-gray-500">
                        <span>{DAY_NAMES[activity.dayOfWeek]}</span>
                        <span>|</span>
                        <span>{activity.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}</span>
                      </div>
                    </div>
                    {activity.category && (
                      <span
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ backgroundColor: activity.category.color ? `${activity.category.color}20` : '#f3f4f6' }}
                      >
                        {activity.category.icon} {activity.category.name}
                      </span>
                    )}
                  </div>

                  {activity.isCancelled && (
                    <div className="flex items-center text-red-600 text-sm mb-2">
                      <AlertTriangle className="w-4 h-4 mr-1" />
                      Cancelled: {activity.cancelReason}
                    </div>
                  )}

                  <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                    <div className="flex items-center">
                      <Users className="w-4 h-4 mr-1" />
                      {activity.currentEnrollment || 0}
                      {activity.maxCapacity ? `/${activity.maxCapacity}` : ''}
                    </div>
                    {(activity.waitlistCount || 0) > 0 && (
                      <div className="flex items-center text-yellow-600">
                        <Clock className="w-4 h-4 mr-1" />
                        {activity.waitlistCount} waitlist
                      </div>
                    )}
                    {activity.location && (
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 mr-1" />
                        {activity.location}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 pt-3 border-t border-gray-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); openStudentsModal(activity); }}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      <Users className="w-4 h-4 inline mr-1" />
                      Students
                    </button>
                    {settings?.attendanceEnabled && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openAttendanceExport(activity); }}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditActivity(activity); }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {selectedTerm.status === 'DRAFT' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'activity', id: activity.id, name: activity.name }); }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Term Form Modal */}
      {showTermForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingTerm ? 'Edit Term' : 'Create ECA Term'}</h2>
              <button onClick={resetTermForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTerm} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Term Name *</label>
                <input
                  type="text"
                  value={termForm.name}
                  onChange={(e) => setTermForm({ ...termForm, name: e.target.value })}
                  placeholder="e.g. Term 1 2025/26"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              {!editingTerm && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Term Number</label>
                    <select
                      value={termForm.termNumber}
                      onChange={(e) => setTermForm({ ...termForm, termNumber: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value={1}>Term 1</option>
                      <option value={2}>Term 2</option>
                      <option value={3}>Term 3</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year</label>
                    <input
                      type="text"
                      value={termForm.academicYear}
                      onChange={(e) => setTermForm({ ...termForm, academicYear: e.target.value })}
                      placeholder="2025/26"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                  <input
                    type="date"
                    value={termForm.startDate}
                    onChange={(e) => setTermForm({ ...termForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date *</label>
                  <input
                    type="date"
                    value={termForm.endDate}
                    onChange={(e) => setTermForm({ ...termForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Registration Opens *</label>
                  <input
                    type="date"
                    value={termForm.registrationOpens}
                    onChange={(e) => setTermForm({ ...termForm, registrationOpens: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Registration Closes *</label>
                  <input
                    type="date"
                    value={termForm.registrationCloses}
                    onChange={(e) => setTermForm({ ...termForm, registrationCloses: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Default Time Slots</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Before School Start</label>
                    <input
                      type="time"
                      value={termForm.defaultBeforeSchoolStart}
                      onChange={(e) => setTermForm({ ...termForm, defaultBeforeSchoolStart: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Before School End</label>
                    <input
                      type="time"
                      value={termForm.defaultBeforeSchoolEnd}
                      onChange={(e) => setTermForm({ ...termForm, defaultBeforeSchoolEnd: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">After School Start</label>
                    <input
                      type="time"
                      value={termForm.defaultAfterSchoolStart}
                      onChange={(e) => setTermForm({ ...termForm, defaultAfterSchoolStart: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">After School End</label>
                    <input
                      type="time"
                      value={termForm.defaultAfterSchoolEnd}
                      onChange={(e) => setTermForm({ ...termForm, defaultAfterSchoolEnd: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetTermForm}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {isSubmitting ? 'Saving...' : editingTerm ? 'Update' : 'Create Term'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity Form Modal */}
      {showActivityForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingActivity ? 'Edit Activity' : 'Add Activity'}</h2>
              <button onClick={resetActivityForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitActivity} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Activity Name *</label>
                <input
                  type="text"
                  value={activityForm.name}
                  onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })}
                  placeholder="e.g. Football Club"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={activityForm.description}
                  onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Day</label>
                  <select
                    value={activityForm.dayOfWeek}
                    onChange={(e) => setActivityForm({ ...activityForm, dayOfWeek: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {DAY_NAMES.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time Slot</label>
                  <select
                    value={activityForm.timeSlot}
                    onChange={(e) => setActivityForm({ ...activityForm, timeSlot: e.target.value as EcaTimeSlot })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {TIME_SLOTS.map(slot => (
                      <option key={slot.value} value={slot.value}>{slot.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Custom Start Time</label>
                  <input
                    type="time"
                    value={activityForm.customStartTime}
                    onChange={(e) => setActivityForm({ ...activityForm, customStartTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Leave empty for default"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Custom End Time</label>
                  <input
                    type="time"
                    value={activityForm.customEndTime}
                    onChange={(e) => setActivityForm({ ...activityForm, customEndTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                <input
                  type="text"
                  value={activityForm.location}
                  onChange={(e) => setActivityForm({ ...activityForm, location: e.target.value })}
                  placeholder="e.g. Sports Hall, Music Room"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Activity Type</label>
                  <select
                    value={activityForm.activityType}
                    onChange={(e) => setActivityForm({ ...activityForm, activityType: e.target.value as EcaActivityType })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {ACTIVITY_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={activityForm.categoryId}
                    onChange={(e) => setActivityForm({ ...activityForm, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">No category</option>
                    {(categories || []).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Eligible Year Groups</label>
                <div className="flex flex-wrap gap-2">
                  {(yearGroups || []).map(yg => (
                    <label key={yg.id} className="flex items-center space-x-1">
                      <input
                        type="checkbox"
                        checked={activityForm.eligibleYearGroupIds.includes(yg.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setActivityForm({ ...activityForm, eligibleYearGroupIds: [...activityForm.eligibleYearGroupIds, yg.id] })
                          } else {
                            setActivityForm({ ...activityForm, eligibleYearGroupIds: activityForm.eligibleYearGroupIds.filter(id => id !== yg.id) })
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{yg.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave empty for all year groups</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                  <select
                    value={activityForm.eligibleGender}
                    onChange={(e) => setActivityForm({ ...activityForm, eligibleGender: e.target.value as EcaGender })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {GENDER_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Min Capacity</label>
                  <input
                    type="number"
                    value={activityForm.minCapacity}
                    onChange={(e) => setActivityForm({ ...activityForm, minCapacity: e.target.value })}
                    placeholder="Optional"
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Capacity</label>
                  <input
                    type="number"
                    value={activityForm.maxCapacity}
                    onChange={(e) => setActivityForm({ ...activityForm, maxCapacity: e.target.value })}
                    placeholder="Optional"
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Staff Lead</label>
                <select
                  value={activityForm.staffId}
                  onChange={(e) => setActivityForm({ ...activityForm, staffId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">No staff assigned</option>
                  {(staffList || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetActivityForm}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {isSubmitting ? 'Saving...' : editingActivity ? 'Update' : 'Add Activity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocation Preview Modal */}
      {showAllocationModal && allocationPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {showCancelConfirmation ? 'Confirm Cancellations' : 'Allocation Preview'}
              </h2>
              <button onClick={() => { setShowAllocationModal(false); setShowCancelConfirmation(false) }} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {showCancelConfirmation ? (
                // Cancellation confirmation view
                <div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-amber-800">The following activities will be cancelled</p>
                        <p className="text-sm text-amber-700 mt-1">
                          These activities did not meet their minimum capacity and will be cancelled.
                          Students will be reallocated to their backup choices where possible.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg divide-y mb-4">
                    {allocationPreview.activities.filter(a => a.willBeCancelled).map(activity => (
                      <div key={activity.activityId} className="p-3 flex items-center justify-between">
                        <span className="font-medium">{activity.activityName}</span>
                        <span className="text-sm text-gray-500">
                          {activity.allocations}/{activity.minCapacity} minimum
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowCancelConfirmation(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Go Back
                    </button>
                    <button
                      onClick={() => {
                        setCancelBelowMinimum(false)
                        setShowCancelConfirmation(false)
                      }}
                      className="flex-1 px-4 py-2 border border-amber-300 rounded-lg text-amber-700 hover:bg-amber-50"
                    >
                      Skip Cancellations
                    </button>
                    <button
                      onClick={handleRunAllocation}
                      disabled={runningAllocation}
                      className="flex-1 px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                    >
                      {runningAllocation ? 'Running...' : 'Confirm & Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                // Normal preview view
                <>
                  {/* Allocation Method Selection */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Allocation Method
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleModeChange('FIRST_COME_FIRST_SERVED')}
                        className={`p-3 rounded-lg border-2 text-left transition-colors ${
                          selectedAllocationMode === 'FIRST_COME_FIRST_SERVED'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <p className="font-medium text-sm">First Come, First Served</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Allocates based on submission order
                        </p>
                      </button>
                      <button
                        onClick={() => handleModeChange('SMART_ALLOCATION')}
                        className={`p-3 rounded-lg border-2 text-left transition-colors ${
                          selectedAllocationMode === 'SMART_ALLOCATION'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <p className="font-medium text-sm">Smart Allocation</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Uses priorities and ranked choices
                        </p>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{allocationPreview.totalAllocations}</p>
                      <p className="text-sm text-green-600">Allocations</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-700">{allocationPreview.totalWaitlist}</p>
                      <p className="text-sm text-yellow-600">Waitlisted</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-red-700">{allocationPreview.activitiesToCancel}</p>
                      <p className="text-sm text-red-600">Below Minimum</p>
                    </div>
                  </div>

                  <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                    {allocationPreview.activities.map(activity => (
                      <div key={activity.activityId} className="p-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium">{activity.activityName}</span>
                          {activity.belowMinimum && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              Below minimum ({activity.allocations}/{activity.minCapacity})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-sm">
                          <span className="text-green-600">{activity.allocations} allocated</span>
                          {activity.waitlist > 0 && (
                            <span className="text-yellow-600">{activity.waitlist} waitlist</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex space-x-3 mt-6">
                    <button
                      onClick={() => setShowAllocationModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRunAllocation}
                      disabled={runningAllocation}
                      className="flex-1 px-4 py-2 rounded-lg text-white disabled:opacity-50"
                      style={{ backgroundColor: theme.colors.brandColor }}
                    >
                      {runningAllocation ? 'Running...' : 'Run Allocation'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Students Modal */}
      {showStudentsModal && selectedActivity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Manage Students</h2>
                <p className="text-sm text-gray-500">{selectedActivity.name}</p>
              </div>
              <button onClick={closeStudentsModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">Add Student</label>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <StudentSearchSelect
                    selectedStudents={selectedStudentsToAdd}
                    onChange={setSelectedStudentsToAdd}
                    placeholder="Search for students to add..."
                  />
                </div>
                <button
                  onClick={handleAddStudent}
                  disabled={selectedStudentsToAdd.length === 0}
                  className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingStudents ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }} />
                </div>
              ) : (
                <>
                  <h3 className="font-medium text-gray-700 mb-2">Allocated ({activityStudents.length})</h3>
                  {activityStudents.length === 0 ? (
                    <p className="text-sm text-gray-500 mb-4">No students allocated yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 mb-4">
                      {activityStudents.map(student => (
                        <div key={student.id} className="py-2 flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-900">{student.studentName}</span>
                            <span className="ml-2 text-sm text-gray-500">{student.className}</span>
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {student.allocationType}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveStudent(student.studentId)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {activityWaitlist.length > 0 && (
                    <>
                      <h3 className="font-medium text-gray-700 mb-2">Waitlist ({activityWaitlist.length})</h3>
                      <div className="divide-y divide-gray-100">
                        {activityWaitlist.map(student => (
                          <div key={student.id} className="py-2 flex items-center justify-between">
                            <div>
                              <span className="text-sm text-yellow-600 mr-2">#{student.position}</span>
                              <span className="font-medium text-gray-900">{student.studentName}</span>
                              <span className="ml-2 text-sm text-gray-500">{student.className}</span>
                            </div>
                            <button
                              onClick={() => handlePromoteFromWaitlist(student.studentId)}
                              className="px-3 py-1 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                            >
                              Promote
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title={`Delete ${deleteConfirm.type === 'term' ? 'Term' : 'Activity'}`}
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
          variant="danger"
        />
      )}
    </div>
  )
}
