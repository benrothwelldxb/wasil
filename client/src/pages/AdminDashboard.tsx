import React, { useState } from 'react'
import { Send, BarChart3, Users, Plus, X, Pencil, Trash2, UserCog, Shield, GraduationCap, Calendar, MessageSquare, MapPin, Clock, CheckCircle, CalendarDays, ClipboardList, Play, Square, Upload, BookOpen, FileText, GripVertical } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useApi } from '../hooks/useApi'
import { MessageForm, SurveyForm } from '../components/forms'
import { ConfirmModal } from '../components/ui'
import type { MessageFormData, SurveyFormData, AudienceOption } from '../components/forms'
import * as api from '../services/api'
import type { StaffMember, SurveyWithResponses, ClassWithDetails, Policy } from '../services/api'
import type { Class, Message, Event, WeeklyMessage, TermDate, TermDateType, PulseSurvey, YearGroup } from '../types'

export function AdminDashboard() {
  const { user } = useAuth()
  const theme = useTheme()

  const [activeTab, setActiveTab] = useState<'messages' | 'surveys' | 'events' | 'weekly' | 'termDates' | 'pulse' | 'yearGroups' | 'classes' | 'staff' | 'policies' | 'analytics'>('messages')
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [showSurveyForm, setShowSurveyForm] = useState(false)
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [showWeeklyForm, setShowWeeklyForm] = useState(false)
  const [showTermDateForm, setShowTermDateForm] = useState(false)
  const [showPulseForm, setShowPulseForm] = useState(false)
  const [showClassForm, setShowClassForm] = useState(false)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [editingSurvey, setEditingSurvey] = useState<SurveyWithResponses | null>(null)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [editingWeekly, setEditingWeekly] = useState<WeeklyMessage | null>(null)
  const [editingTermDate, setEditingTermDate] = useState<TermDate | null>(null)
  const [editingPulse, setEditingPulse] = useState<PulseSurvey | null>(null)
  const [editingClass, setEditingClass] = useState<ClassWithDetails | null>(null)
  const [showYearGroupForm, setShowYearGroupForm] = useState(false)
  const [editingYearGroup, setEditingYearGroup] = useState<YearGroup | null>(null)
  const [showPolicyForm, setShowPolicyForm] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [policyName, setPolicyName] = useState('')
  const [policyDescription, setPolicyDescription] = useState('')
  const [policyFile, setPolicyFile] = useState<File | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'message' | 'survey' | 'staff' | 'event' | 'weekly' | 'termDate' | 'pulse' | 'class' | 'yearGroup' | 'policy'; id: string; title: string } | null>(null)

  // Fetch data
  const { data: messages, refetch: refetchMessages } = useApi<Message[]>(
    () => api.messages.listAll(),
    []
  )
  const { data: surveys, refetch: refetchSurveys } = useApi<SurveyWithResponses[]>(
    () => api.surveys.listAll(),
    []
  )
  const { data: classes } = useApi<Class[]>(
    () => api.classes.list(),
    []
  )
  const { data: classesDetailed, refetch: refetchClasses } = useApi<ClassWithDetails[]>(
    () => api.classes.listAll(),
    []
  )
  const { data: staffList, refetch: refetchStaff } = useApi<StaffMember[]>(
    () => api.staff.list(),
    []
  )
  const { data: events, refetch: refetchEvents } = useApi<Event[]>(
    () => api.events.listAll(),
    []
  )
  const { data: weeklyMessages, refetch: refetchWeekly } = useApi<WeeklyMessage[]>(
    () => api.weeklyMessage.list(),
    []
  )
  const { data: termDates, refetch: refetchTermDates } = useApi<TermDate[]>(
    () => api.termDates.list(),
    []
  )
  const { data: pulseSurveys, refetch: refetchPulse } = useApi<PulseSurvey[]>(
    () => api.pulse.listAll(),
    []
  )
  const { data: yearGroups, refetch: refetchYearGroups } = useApi<YearGroup[]>(
    () => api.yearGroups.list(),
    []
  )
  const { data: policiesList, refetch: refetchPolicies } = useApi<Policy[]>(
    () => api.policies.list(),
    []
  )

  // CSV import state
  const csvFileRef = React.useRef<HTMLInputElement>(null)
  const [csvPreview, setCsvPreview] = useState<Array<{
    title: string; description: string; date: string; time: string; location: string
    targetClass: string; classId: string; yearGroupId: string; requiresRsvp: boolean
    error?: string
  }>>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvProgress, setCsvProgress] = useState<{ done: number; total: number; errors: string[] }>({ done: 0, total: 0, errors: [] })
  const [showCsvModal, setShowCsvModal] = useState(false)

  // Loading states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Message form state
  const [messageForm, setMessageForm] = useState<MessageFormData>({
    title: '',
    content: '',
    targetClass: 'Whole School',
    isPinned: false,
    isUrgent: false,
    expiresAt: '',
    hasAction: false,
    actionType: 'consent',
    actionLabel: '',
    actionDueDate: '',
    actionAmount: '',
  })

  // Survey form state
  const [surveyForm, setSurveyForm] = useState<SurveyFormData>({
    question: '',
    options: ['', ''],
    targetClass: 'Whole School',
  })

  // Staff form state
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    role: 'STAFF' as 'STAFF' | 'ADMIN',
    assignedClassIds: [] as string[],
  })

  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [bulkPasteValue, setBulkPasteValue] = useState('')
  const [bulkStaffData, setBulkStaffData] = useState<Array<{ name: string; email: string; role: 'STAFF' | 'ADMIN' }>>([])
  const [bulkImportResult, setBulkImportResult] = useState<{ created: number; skipped: number; errors?: string[] } | null>(null)

  // Event form state
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    targetClass: 'Whole School',
    classId: '' as string,
    yearGroupId: '' as string,
    requiresRsvp: false,
  })

  // Weekly message form state
  const [weeklyForm, setWeeklyForm] = useState({
    title: '',
    content: '',
    weekOf: '',
    isCurrent: true,
  })

  // Term date form state
  const [termDateForm, setTermDateForm] = useState({
    term: 1,
    termName: 'Term 1',
    label: '',
    sublabel: '',
    date: '',
    endDate: '',
    type: 'term-start' as TermDateType,
    color: 'green',
  })

  // Pulse survey form state
  const [pulseForm, setPulseForm] = useState({
    halfTermName: '',
    opensAt: '',
    closesAt: '',
  })

  // Class form state
  const [classForm, setClassForm] = useState({
    name: '',
    colorBg: 'bg-gray-600',
    colorText: 'text-white',
    staffIds: [] as string[],
    yearGroupId: '' as string,
  })

  // Year group form state
  const [draggedYearGroupId, setDraggedYearGroupId] = useState<string | null>(null)
  const [yearGroupForm, setYearGroupForm] = useState({
    name: '',
  })

  const CLASS_COLOR_PRESETS = [
    { bg: 'bg-gray-600', text: 'text-white', label: 'Grey', hex: '#4B5563' },
    { bg: 'bg-blue-600', text: 'text-white', label: 'Blue', hex: '#2563EB' },
    { bg: 'bg-red-600', text: 'text-white', label: 'Red', hex: '#DC2626' },
    { bg: 'bg-green-600', text: 'text-white', label: 'Green', hex: '#16A34A' },
    { bg: 'bg-purple-600', text: 'text-white', label: 'Purple', hex: '#9333EA' },
    { bg: 'bg-amber-500', text: 'text-white', label: 'Amber', hex: '#F59E0B' },
    { bg: 'bg-teal-600', text: 'text-white', label: 'Teal', hex: '#0D9488' },
    { bg: 'bg-pink-600', text: 'text-white', label: 'Pink', hex: '#DB2777' },
    { bg: 'bg-orange-600', text: 'text-white', label: 'Orange', hex: '#EA580C' },
    { bg: 'bg-indigo-600', text: 'text-white', label: 'Indigo', hex: '#4F46E5' },
  ]

  const handleCreateMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        title: messageForm.title,
        content: messageForm.content,
        targetClass: messageForm.targetClass,
        classId: messageForm.classId || undefined,
        yearGroupId: messageForm.yearGroupId || undefined,
        isPinned: messageForm.isPinned,
        isUrgent: messageForm.isUrgent,
        expiresAt: messageForm.expiresAt || undefined,
        ...(messageForm.hasAction && {
          actionType: messageForm.actionType,
          actionLabel: messageForm.actionLabel,
          actionDueDate: messageForm.actionDueDate,
          actionAmount: messageForm.actionAmount,
        }),
      }
      if (editingMessage) {
        await api.messages.update(editingMessage.id, data)
        setEditingMessage(null)
      } else {
        await api.messages.create(data)
      }
      setMessageForm({
        title: '',
        content: '',
        targetClass: 'Whole School',
        isPinned: false,
        isUrgent: false,
        expiresAt: '',
        hasAction: false,
        actionType: 'consent',
        actionLabel: '',
        actionDueDate: '',
        actionAmount: '',
      })
      setShowMessageForm(false)
      refetchMessages()
    } catch (error) {
      console.error('Error saving message:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save message: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditMessage = (message: Message) => {
    setMessageForm({
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      isPinned: message.isPinned || false,
      isUrgent: message.isUrgent || false,
      expiresAt: message.expiresAt ? message.expiresAt.split('T')[0] : '',
      hasAction: !!message.actionType,
      actionType: message.actionType || 'consent',
      actionLabel: message.actionLabel || '',
      actionDueDate: message.actionDueDate || '',
      actionAmount: message.actionAmount || '',
    })
    setEditingMessage(message)
    setShowMessageForm(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      if (deleteConfirm.type === 'message') {
        await api.messages.delete(deleteConfirm.id)
        refetchMessages()
      } else if (deleteConfirm.type === 'survey') {
        await api.surveys.delete(deleteConfirm.id)
        refetchSurveys()
      } else if (deleteConfirm.type === 'staff') {
        await api.staff.delete(deleteConfirm.id)
        refetchStaff()
      } else if (deleteConfirm.type === 'event') {
        await api.events.delete(deleteConfirm.id)
        refetchEvents()
      } else if (deleteConfirm.type === 'weekly') {
        await api.weeklyMessage.delete(deleteConfirm.id)
        refetchWeekly()
      } else if (deleteConfirm.type === 'termDate') {
        await api.termDates.delete(deleteConfirm.id)
        refetchTermDates()
      } else if (deleteConfirm.type === 'pulse') {
        await api.pulse.delete(deleteConfirm.id)
        refetchPulse()
      } else if (deleteConfirm.type === 'class') {
        await api.classes.delete(deleteConfirm.id)
        refetchClasses()
      } else if (deleteConfirm.type === 'yearGroup') {
        await api.yearGroups.delete(deleteConfirm.id)
        refetchYearGroups()
      } else if (deleteConfirm.type === 'policy') {
        await api.policies.delete(deleteConfirm.id)
        refetchPolicies()
      }
      setDeleteConfirm(null)
    } catch (error) {
      console.error('Error deleting:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to delete: ${message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCreateSurvey = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        question: surveyForm.question,
        options: surveyForm.options.filter(Boolean),
        targetClass: surveyForm.targetClass,
        classId: surveyForm.classId || undefined,
        yearGroupId: surveyForm.yearGroupId || undefined,
      }
      if (editingSurvey) {
        await api.surveys.update(editingSurvey.id, data)
        setEditingSurvey(null)
      } else {
        await api.surveys.create(data)
      }
      setSurveyForm({ question: '', options: ['', ''], targetClass: 'Whole School' })
      setShowSurveyForm(false)
      refetchSurveys()
    } catch (error) {
      console.error('Error saving survey:', error)
      alert('Failed to save survey. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditSurvey = (survey: SurveyWithResponses) => {
    setSurveyForm({
      question: survey.question,
      options: survey.options as string[],
      targetClass: survey.targetClass,
    })
    setEditingSurvey(survey)
    setShowSurveyForm(true)
  }

  const handleCancelMessageForm = () => {
    setShowMessageForm(false)
    setEditingMessage(null)
    setMessageForm({
      title: '',
      content: '',
      targetClass: 'Whole School',
      isPinned: false,
      isUrgent: false,
      expiresAt: '',
      hasAction: false,
      actionType: 'consent',
      actionLabel: '',
      actionDueDate: '',
      actionAmount: '',
    })
  }

  const handleCancelSurveyForm = () => {
    setShowSurveyForm(false)
    setEditingSurvey(null)
    setSurveyForm({ question: '', options: ['', ''], targetClass: 'Whole School' })
  }

  // Staff handlers
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      if (editingStaff) {
        await api.staff.update(editingStaff.id, {
          name: staffForm.name,
          email: staffForm.email,
          role: staffForm.role,
          assignedClassIds: staffForm.assignedClassIds,
        })
        setEditingStaff(null)
      } else {
        await api.staff.create({
          name: staffForm.name,
          email: staffForm.email,
          role: staffForm.role,
          assignedClassIds: staffForm.assignedClassIds,
        })
      }
      setStaffForm({ name: '', email: '', role: 'STAFF', assignedClassIds: [] })
      setShowStaffForm(false)
      refetchStaff()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save staff member: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditStaff = (staffMember: StaffMember) => {
    setStaffForm({
      name: staffMember.name,
      email: staffMember.email,
      role: staffMember.role,
      assignedClassIds: staffMember.assignedClasses.map(c => c.id),
    })
    setEditingStaff(staffMember)
    setShowStaffForm(true)
  }

  const handleCancelStaffForm = () => {
    setShowStaffForm(false)
    setEditingStaff(null)
    setStaffForm({ name: '', email: '', role: 'STAFF', assignedClassIds: [] })
  }

  // Bulk import handlers
  const parseBulkInput = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim())
    const parsed: Array<{ name: string; email: string; role: 'STAFF' | 'ADMIN' }> = []

    for (const line of lines) {
      // Split by tab or comma
      const parts = line.split(/[\t,]/).map(p => p.trim())

      if (parts.length >= 2) {
        const name = parts[0]
        const email = parts[1]

        if (name && email && email.includes('@')) {
          parsed.push({ name, email, role: 'STAFF' })
        }
      }
    }

    if (parsed.length > 0) {
      setBulkStaffData(parsed)
      setBulkPasteValue('')
      setBulkImportResult(null)
    }
  }

  const handleBulkRoleChange = (index: number, role: 'STAFF' | 'ADMIN') => {
    setBulkStaffData(prev => prev.map((item, i) =>
      i === index ? { ...item, role } : item
    ))
  }

  const handleBulkRemoveRow = (index: number) => {
    setBulkStaffData(prev => prev.filter((_, i) => i !== index))
  }

  const handleBulkImport = async () => {
    if (bulkStaffData.length === 0) return

    setIsSubmitting(true)
    try {
      const result = await api.staff.bulkCreate(bulkStaffData)
      setBulkImportResult({ created: result.created, skipped: result.skipped, errors: result.errors })

      if (result.created > 0) {
        refetchStaff()
        // Clear imported rows, keep failed ones
        if (result.errors && result.errors.length > 0) {
          // Keep rows that had errors
          const errorEmails = new Set(
            result.errors
              .filter(e => e.includes(':'))
              .map(e => e.split(':')[0].trim().toLowerCase())
          )
          setBulkStaffData(prev => prev.filter(s => errorEmails.has(s.email.toLowerCase())))
        } else {
          setBulkStaffData([])
        }
      }
    } catch (error) {
      console.error('Error bulk importing staff:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to import staff: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelBulkImport = () => {
    setShowBulkImport(false)
    setBulkPasteValue('')
    setBulkStaffData([])
    setBulkImportResult(null)
  }

  // Event handlers
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        title: eventForm.title,
        description: eventForm.description || undefined,
        date: eventForm.date,
        time: eventForm.time || undefined,
        location: eventForm.location || undefined,
        targetClass: eventForm.targetClass,
        classId: eventForm.classId || undefined,
        yearGroupId: eventForm.yearGroupId || undefined,
        requiresRsvp: eventForm.requiresRsvp,
      }
      if (editingEvent) {
        await api.events.update(editingEvent.id, data)
        setEditingEvent(null)
      } else {
        await api.events.create(data)
      }
      setEventForm({ title: '', description: '', date: '', time: '', location: '', targetClass: 'Whole School', classId: '', yearGroupId: '', requiresRsvp: false })
      setShowEventForm(false)
      refetchEvents()
    } catch (error) {
      console.error('Error saving event:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save event: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditEvent = (event: Event) => {
    setEventForm({
      title: event.title,
      description: event.description || '',
      date: event.date.split('T')[0],
      time: event.time || '',
      location: event.location || '',
      targetClass: event.targetClass,
      classId: event.classId || '',
      yearGroupId: event.yearGroupId || '',
      requiresRsvp: event.requiresRsvp,
    })
    setEditingEvent(event)
    setShowEventForm(true)
  }

  const handleCancelEventForm = () => {
    setShowEventForm(false)
    setEditingEvent(null)
    setEventForm({ title: '', description: '', date: '', time: '', location: '', targetClass: 'Whole School', classId: '', yearGroupId: '', requiresRsvp: false })
  }

  // CSV import handlers
  const parseCsvLine = (line: string): string[] => {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
        else if (ch === '"') { inQuotes = false }
        else { current += ch }
      } else {
        if (ch === '"') { inQuotes = true }
        else if (ch === ',') { fields.push(current.trim()); current = '' }
        else { current += ch }
      }
    }
    fields.push(current.trim())
    return fields
  }

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { alert('CSV must have a header row and at least one data row.'); return }
      // Skip header
      const rows = lines.slice(1).map(parseCsvLine)
      const parsed = rows.map(cols => {
        const [title, description, date, time, location, target, rsvp] = cols
        const targetName = target || 'Whole School'
        let resolvedTarget = 'Whole School'
        let classId = ''
        let yearGroupId = ''
        let error = ''

        if (!title) error = 'Missing title'
        else if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) error = 'Invalid or missing date (need YYYY-MM-DD)'

        if (targetName !== 'Whole School') {
          const ygMatch = yearGroups?.find(yg => yg.name.toLowerCase() === targetName.toLowerCase())
          const clsMatch = classes?.find(c => c.name.toLowerCase() === targetName.toLowerCase())
          if (ygMatch) { resolvedTarget = ygMatch.name; yearGroupId = ygMatch.id }
          else if (clsMatch) { resolvedTarget = clsMatch.name; classId = clsMatch.id }
          else { error = error || `Unrecognised target: "${targetName}"` }
        }

        return {
          title: title || '',
          description: description || '',
          date: date || '',
          time: time || '',
          location: location || '',
          targetClass: resolvedTarget,
          classId,
          yearGroupId,
          requiresRsvp: rsvp?.toLowerCase() === 'yes',
          error,
        }
      })
      setCsvPreview(parsed)
      setCsvProgress({ done: 0, total: 0, errors: [] })
    }
    reader.readAsText(file)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  const handleCsvImport = async () => {
    const valid = csvPreview.filter(r => !r.error)
    if (valid.length === 0) return
    setCsvImporting(true)
    const progress = { done: 0, total: valid.length, errors: [] as string[] }
    setCsvProgress({ ...progress })
    for (const row of valid) {
      try {
        await api.events.create({
          title: row.title,
          description: row.description || undefined,
          date: row.date,
          time: row.time || undefined,
          location: row.location || undefined,
          targetClass: row.targetClass,
          classId: row.classId || undefined,
          yearGroupId: row.yearGroupId || undefined,
          requiresRsvp: row.requiresRsvp,
        })
      } catch (err) {
        progress.errors.push(`"${row.title}": ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
      progress.done++
      setCsvProgress({ ...progress })
    }
    setCsvImporting(false)
    refetchEvents()
    if (progress.errors.length === 0) {
      setCsvPreview([])
      alert(`Successfully imported ${progress.done} event${progress.done !== 1 ? 's' : ''}.`)
    }
  }

  // Weekly message handlers
  const handleCreateWeekly = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        title: weeklyForm.title,
        content: weeklyForm.content,
        weekOf: weeklyForm.weekOf,
        isCurrent: weeklyForm.isCurrent,
      }
      if (editingWeekly) {
        await api.weeklyMessage.update(editingWeekly.id, data)
        setEditingWeekly(null)
      } else {
        await api.weeklyMessage.create(data)
      }
      setWeeklyForm({ title: '', content: '', weekOf: '', isCurrent: true })
      setShowWeeklyForm(false)
      refetchWeekly()
    } catch (error) {
      console.error('Error saving weekly message:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save weekly message: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditWeekly = (weekly: WeeklyMessage) => {
    setWeeklyForm({
      title: weekly.title,
      content: weekly.content,
      weekOf: weekly.weekOf.split('T')[0],
      isCurrent: weekly.isCurrent,
    })
    setEditingWeekly(weekly)
    setShowWeeklyForm(true)
  }

  const handleCancelWeeklyForm = () => {
    setShowWeeklyForm(false)
    setEditingWeekly(null)
    setWeeklyForm({ title: '', content: '', weekOf: '', isCurrent: true })
  }

  // Term date handlers
  const handleCreateTermDate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        term: termDateForm.term,
        termName: termDateForm.termName,
        label: termDateForm.label,
        sublabel: termDateForm.sublabel || undefined,
        date: termDateForm.date,
        endDate: termDateForm.endDate || undefined,
        type: termDateForm.type,
        color: termDateForm.color,
      }
      if (editingTermDate) {
        await api.termDates.update(editingTermDate.id, data)
        setEditingTermDate(null)
      } else {
        await api.termDates.create(data)
      }
      setTermDateForm({ term: 1, termName: 'Term 1', label: '', sublabel: '', date: '', endDate: '', type: 'term-start', color: 'green' })
      setShowTermDateForm(false)
      refetchTermDates()
    } catch (error) {
      console.error('Error saving term date:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save term date: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditTermDate = (termDate: TermDate) => {
    setTermDateForm({
      term: termDate.term,
      termName: termDate.termName,
      label: termDate.label,
      sublabel: termDate.sublabel || '',
      date: termDate.date,
      endDate: termDate.endDate || '',
      type: termDate.type,
      color: termDate.color,
    })
    setEditingTermDate(termDate)
    setShowTermDateForm(true)
  }

  const handleCancelTermDateForm = () => {
    setShowTermDateForm(false)
    setEditingTermDate(null)
    setTermDateForm({ term: 1, termName: 'Term 1', label: '', sublabel: '', date: '', endDate: '', type: 'term-start', color: 'green' })
  }

  // Pulse survey handlers
  const handleCreatePulse = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        halfTermName: pulseForm.halfTermName,
        opensAt: pulseForm.opensAt,
        closesAt: pulseForm.closesAt,
      }
      if (editingPulse) {
        await api.pulse.update(editingPulse.id, data)
        setEditingPulse(null)
      } else {
        await api.pulse.create(data)
      }
      setPulseForm({ halfTermName: '', opensAt: '', closesAt: '' })
      setShowPulseForm(false)
      refetchPulse()
    } catch (error) {
      console.error('Error saving pulse survey:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save pulse survey: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditPulse = (pulse: PulseSurvey) => {
    setPulseForm({
      halfTermName: pulse.halfTermName,
      opensAt: pulse.opensAt.split('T')[0],
      closesAt: pulse.closesAt.split('T')[0],
    })
    setEditingPulse(pulse)
    setShowPulseForm(true)
  }

  const handleCancelPulseForm = () => {
    setShowPulseForm(false)
    setEditingPulse(null)
    setPulseForm({ halfTermName: '', opensAt: '', closesAt: '' })
  }

  const handleSendPulse = async (id: string) => {
    try {
      await api.pulse.send(id)
      refetchPulse()
    } catch (error) {
      console.error('Error sending pulse:', error)
      alert('Failed to send pulse survey')
    }
  }

  const handleClosePulse = async (id: string) => {
    try {
      await api.pulse.close(id)
      refetchPulse()
    } catch (error) {
      console.error('Error closing pulse:', error)
      alert('Failed to close pulse survey')
    }
  }

  // Class handlers
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const data = {
        name: classForm.name,
        colorBg: classForm.colorBg,
        colorText: classForm.colorText,
        staffIds: classForm.staffIds,
        yearGroupId: classForm.yearGroupId || undefined,
      }
      if (editingClass) {
        await api.classes.update(editingClass.id, data)
        setEditingClass(null)
      } else {
        await api.classes.create(data)
      }
      setClassForm({ name: '', colorBg: 'bg-gray-600', colorText: 'text-white', staffIds: [], yearGroupId: '' })
      setShowClassForm(false)
      refetchClasses()
    } catch (error) {
      console.error('Error saving class:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save class: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditClass = (cls: ClassWithDetails) => {
    setClassForm({
      name: cls.name,
      colorBg: cls.colorBg,
      colorText: cls.colorText,
      staffIds: cls.assignedStaff.map(s => s.id),
      yearGroupId: cls.yearGroupId || '',
    })
    setEditingClass(cls)
    setShowClassForm(true)
  }

  const handleCancelClassForm = () => {
    setShowClassForm(false)
    setEditingClass(null)
    setClassForm({ name: '', colorBg: 'bg-gray-600', colorText: 'text-white', staffIds: [], yearGroupId: '' })
  }

  // Year group handlers
  const handleCreateYearGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      if (editingYearGroup) {
        await api.yearGroups.update(editingYearGroup.id, { name: yearGroupForm.name, order: editingYearGroup.order })
        setEditingYearGroup(null)
      } else {
        await api.yearGroups.create({ name: yearGroupForm.name, order: yearGroups?.length ?? 0 })
      }
      setYearGroupForm({ name: '' })
      setShowYearGroupForm(false)
      refetchYearGroups()
    } catch (error) {
      console.error('Error saving year group:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save year group: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditYearGroup = (yg: YearGroup) => {
    setYearGroupForm({ name: yg.name })
    setEditingYearGroup(yg)
    setShowYearGroupForm(true)
  }

  const handleCancelYearGroupForm = () => {
    setShowYearGroupForm(false)
    setEditingYearGroup(null)
    setYearGroupForm({ name: '' })
  }

  // Build audience options: Whole School, then year groups with nested classes
  const audienceOptions: AudienceOption[] = [
    { value: 'Whole School', type: 'school' },
    ...(yearGroups || []).flatMap(yg => {
      const ygClasses = (classes || []).filter(c => c.yearGroupId === yg.id)
      return [
        { value: yg.name, type: 'yearGroup' as const, id: yg.id },
        ...ygClasses.map(c => ({ value: c.name, type: 'class' as const, id: c.id })),
      ]
    }),
    // Classes not assigned to any year group
    ...(classes || []).filter(c => !c.yearGroupId).map(c => ({
      value: c.name, type: 'class' as const, id: c.id,
    })),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-bold" style={{ color: theme.colors.brandColor }}>
          Admin Dashboard
        </h2>
        <p className="text-gray-600 mt-1">
          Welcome back, {user?.name}. Manage school communications.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: theme.colors.brandColorLight }}
            >
              <Send className="h-6 w-6" style={{ color: theme.colors.brandColor }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{messages?.length || 0}</p>
              <p className="text-sm text-gray-500">Messages Sent</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: `${theme.colors.accentColor}40` }}
            >
              <BarChart3 className="h-6 w-6" style={{ color: theme.colors.brandColor }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{surveys?.length || 0}</p>
              <p className="text-sm text-gray-500">Active Surveys</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-lg bg-green-100">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{classes?.length || 0}</p>
              <p className="text-sm text-gray-500">Classes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
            {([
              { key: 'messages', label: 'Messages' },
              { key: 'surveys', label: 'Surveys' },
              { key: 'events', label: 'Events' },
              { key: 'weekly', label: 'Weekly Updates' },
              { key: 'termDates', label: 'Term Dates' },
              { key: 'pulse', label: 'Parent Pulse' },
              { key: 'yearGroups', label: 'Year Groups' },
              { key: 'classes', label: 'Classes' },
              { key: 'staff', label: 'Staff' },
              { key: 'policies', label: 'Policies' },
              { key: 'analytics', label: 'Analytics' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-burgundy text-burgundy'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                style={activeTab === tab.key ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'messages' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Messages</h3>
                <button
                  onClick={() => showMessageForm ? handleCancelMessageForm() : setShowMessageForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showMessageForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showMessageForm ? 'Cancel' : 'New Message'}</span>
                </button>
              </div>

              {showMessageForm && (
                <MessageForm
                  formData={messageForm}
                  onChange={setMessageForm}
                  onSubmit={handleCreateMessage}
                  audienceOptions={audienceOptions}
                  isSubmitting={isSubmitting}
                  submitLabel={editingMessage ? 'Update Message' : 'Send Message'}
                />
              )}

              <div className="space-y-4">
                {messages?.map((message) => (
                  <div key={message.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs px-2 py-1 rounded-full bg-burgundy text-white" style={{ backgroundColor: theme.colors.brandColor }}>
                            {message.targetClass}
                          </span>
                          {message.isPinned && (
                            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">Pinned</span>
                          )}
                          {message.isUrgent && (
                            <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">Urgent</span>
                          )}
                        </div>
                        <h4 className="font-medium mt-2">{message.title}</h4>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{message.content}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span>{new Date(message.createdAt).toLocaleDateString()}</span>
                          {message.acknowledgmentCount !== undefined && (
                            <span>{message.acknowledgmentCount} acknowledged</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleEditMessage(message)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit message"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'message', id: message.id, title: message.title })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete message"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'surveys' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Surveys</h3>
                <button
                  onClick={() => showSurveyForm ? handleCancelSurveyForm() : setShowSurveyForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showSurveyForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showSurveyForm ? 'Cancel' : 'New Survey'}</span>
                </button>
              </div>

              {showSurveyForm && (
                <SurveyForm
                  formData={surveyForm}
                  onChange={setSurveyForm}
                  onSubmit={handleCreateSurvey}
                  audienceOptions={audienceOptions}
                  isSubmitting={isSubmitting}
                  submitLabel={editingSurvey ? 'Update Survey' : 'Create Survey'}
                />
              )}

              <div className="space-y-4">
                {surveys?.map((survey) => (
                  <div key={survey.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs px-2 py-1 rounded-full bg-burgundy text-white" style={{ backgroundColor: theme.colors.brandColor }}>
                            {survey.targetClass}
                          </span>
                          {!survey.active && (
                            <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600">Closed</span>
                          )}
                        </div>
                        <h4 className="font-medium mt-2">{survey.question}</h4>
                        <div className="mt-2 space-y-1">
                          {survey.options.map((option: string) => {
                            const count = survey.responses?.filter((r: { response: string }) => r.response === option).length || 0
                            const total = survey.responses?.length || 0
                            const percentage = total > 0 ? Math.round((count / total) * 100) : 0
                            return (
                              <div key={option} className="text-sm">
                                <div className="flex justify-between">
                                  <span>{option}</span>
                                  <span className="text-gray-500">{count} ({percentage}%)</span>
                                </div>
                                <div className="h-2 bg-gray-200 rounded-full mt-1">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${percentage}%`, backgroundColor: theme.colors.brandColor }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">{survey.responses?.length || 0} responses</p>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleEditSurvey(survey)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit survey"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'survey', id: survey.id, title: survey.question })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete survey"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Events</h3>
                <div className="flex items-center space-x-2">
                  <input type="file" ref={csvFileRef} accept=".csv" className="hidden" onChange={(e) => { handleCsvFile(e); setShowCsvModal(false) }} />
                  <button
                    onClick={() => setShowCsvModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Import CSV</span>
                  </button>
                  <button
                    onClick={() => showEventForm ? handleCancelEventForm() : setShowEventForm(true)}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {showEventForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    <span>{showEventForm ? 'Cancel' : 'New Event'}</span>
                  </button>
                </div>
              </div>

              {showCsvModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCsvModal(false)}>
                  <div className="bg-white rounded-xl shadow-lg max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Import Events from CSV</h3>
                      <button onClick={() => setShowCsvModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">Your CSV file should have a header row with the following columns:</p>
                    <div className="bg-gray-50 rounded-lg p-3 mb-4 overflow-x-auto">
                      <code className="text-xs text-gray-700 whitespace-pre">Title,Description,Date,Time,Location,Target,Requires RSVP</code>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1.5 mb-4">
                      <p><span className="font-medium">Title</span> — required</p>
                      <p><span className="font-medium">Description</span> — optional</p>
                      <p><span className="font-medium">Date</span> — required, YYYY-MM-DD format</p>
                      <p><span className="font-medium">Time</span> — optional, e.g. 09:00-15:00</p>
                      <p><span className="font-medium">Location</span> — optional</p>
                      <p><span className="font-medium">Target</span> — optional, must match a year group or class name (defaults to Whole School)</p>
                      <p><span className="font-medium">Requires RSVP</span> — Yes or No (defaults to No)</p>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">Example row: <code className="bg-gray-100 px-1 rounded">Sports Day,Annual competition,2026-01-24,09:00-15:00,School Field,Whole School,Yes</code></p>
                    <button
                      onClick={() => csvFileRef.current?.click()}
                      className="w-full py-2.5 rounded-lg text-white font-medium flex items-center justify-center space-x-2"
                      style={{ backgroundColor: theme.colors.brandColor }}
                    >
                      <Upload className="h-4 w-4" />
                      <span>Choose CSV File</span>
                    </button>
                  </div>
                </div>
              )}

              {csvPreview.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">CSV Preview — {csvPreview.length} row{csvPreview.length !== 1 ? 's' : ''}</h4>
                    <div className="flex items-center space-x-2">
                      {csvImporting && <span className="text-sm text-gray-500">Importing {csvProgress.done}/{csvProgress.total}...</span>}
                      {!csvImporting && csvProgress.errors.length > 0 && (
                        <span className="text-sm text-red-600">{csvProgress.errors.length} failed</span>
                      )}
                      <button onClick={() => setCsvPreview([])} className="text-sm text-gray-500 hover:text-gray-700">Dismiss</button>
                      <button
                        onClick={handleCsvImport}
                        disabled={csvImporting || csvPreview.filter(r => !r.error).length === 0}
                        className="px-4 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                        style={{ backgroundColor: theme.colors.brandColor }}
                      >
                        Confirm Import ({csvPreview.filter(r => !r.error).length})
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 pr-3">Title</th><th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Time</th>
                        <th className="pb-2 pr-3">Location</th><th className="pb-2 pr-3">Target</th><th className="pb-2 pr-3">RSVP</th><th className="pb-2">Status</th>
                      </tr></thead>
                      <tbody>
                        {csvPreview.map((row, i) => (
                          <tr key={i} className={row.error ? 'text-red-600' : ''}>
                            <td className="py-1 pr-3">{row.title || '—'}</td>
                            <td className="py-1 pr-3">{row.date || '—'}</td>
                            <td className="py-1 pr-3">{row.time || '—'}</td>
                            <td className="py-1 pr-3">{row.location || '—'}</td>
                            <td className="py-1 pr-3">{row.targetClass}</td>
                            <td className="py-1 pr-3">{row.requiresRsvp ? 'Yes' : 'No'}</td>
                            <td className="py-1">{row.error ? <span title={row.error}>⚠ {row.error}</span> : <CheckCircle className="h-4 w-4 text-green-500" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvProgress.errors.length > 0 && (
                    <div className="mt-3 text-sm text-red-600">
                      <p className="font-medium">Import errors:</p>
                      {csvProgress.errors.map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  )}
                </div>
              )}

              {showEventForm && (
                <form onSubmit={handleCreateEvent} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={eventForm.title}
                      onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={eventForm.description}
                      onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={eventForm.date}
                        onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                      <input
                        type="time"
                        value={eventForm.time}
                        onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        value={eventForm.location}
                        onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="e.g. School Hall"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
                      <select
                        value={eventForm.targetClass}
                        onChange={(e) => {
                          const opt = audienceOptions.find(o => o.value === e.target.value)
                          setEventForm({
                            ...eventForm,
                            targetClass: e.target.value,
                            classId: opt?.type === 'class' ? (opt.id || '') : '',
                            yearGroupId: opt?.type === 'yearGroup' ? (opt.id || '') : '',
                          })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        {audienceOptions.map((opt) => (
                          <option key={`${opt.type}-${opt.id || opt.value}`} value={opt.value}>
                            {opt.type === 'class' ? `  └ ${opt.value}` : opt.value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center">
                      <label className="flex items-center space-x-2 cursor-pointer mt-6">
                        <input
                          type="checkbox"
                          checked={eventForm.requiresRsvp}
                          onChange={(e) => setEventForm({ ...eventForm, requiresRsvp: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">Requires RSVP</span>
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? 'Please wait...' : editingEvent ? 'Update Event' : 'Create Event'}
                  </button>
                </form>
              )}

              <div className="space-y-4">
                {events?.map((event) => (
                  <div key={event.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs px-2 py-1 rounded-full bg-burgundy text-white" style={{ backgroundColor: theme.colors.brandColor }}>
                            {event.targetClass}
                          </span>
                          {event.requiresRsvp && (
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">RSVP Required</span>
                          )}
                        </div>
                        <h4 className="font-medium mt-2">{event.title}</h4>
                        {event.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.description}</p>
                        )}
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(event.date).toLocaleDateString()}</span>
                          </span>
                          {event.time && (
                            <span className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{event.time}</span>
                            </span>
                          )}
                          {event.location && (
                            <span className="flex items-center space-x-1">
                              <MapPin className="h-3 w-3" />
                              <span>{event.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleEditEvent(event)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit event"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'event', id: event.id, title: event.title })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete event"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(!events || events.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No events yet. Create your first event above.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'weekly' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Weekly Principal Updates</h3>
                <button
                  onClick={() => showWeeklyForm ? handleCancelWeeklyForm() : setShowWeeklyForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showWeeklyForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showWeeklyForm ? 'Cancel' : 'New Update'}</span>
                </button>
              </div>

              {showWeeklyForm && (
                <form onSubmit={handleCreateWeekly} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={weeklyForm.title}
                      onChange={(e) => setWeeklyForm({ ...weeklyForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g. Week of January 27th"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                    <textarea
                      value={weeklyForm.content}
                      onChange={(e) => setWeeklyForm({ ...weeklyForm, content: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={6}
                      placeholder="Write your weekly message to parents here..."
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Week Of</label>
                      <input
                        type="date"
                        value={weeklyForm.weekOf}
                        onChange={(e) => setWeeklyForm({ ...weeklyForm, weekOf: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                    <div className="flex items-center">
                      <label className="flex items-center space-x-2 cursor-pointer mt-6">
                        <input
                          type="checkbox"
                          checked={weeklyForm.isCurrent}
                          onChange={(e) => setWeeklyForm({ ...weeklyForm, isCurrent: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">Set as current (show to parents)</span>
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? 'Please wait...' : editingWeekly ? 'Update Message' : 'Create Message'}
                  </button>
                </form>
              )}

              <div className="space-y-4">
                {weeklyMessages?.map((weekly) => (
                  <div key={weekly.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-700">
                            Week of {new Date(weekly.weekOf).toLocaleDateString()}
                          </span>
                          {weekly.isCurrent && (
                            <span className="flex items-center space-x-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                              <CheckCircle className="h-3 w-3" />
                              <span>Current</span>
                            </span>
                          )}
                        </div>
                        <h4 className="font-medium mt-2">{weekly.title}</h4>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-3">{weekly.content}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span>{weekly.heartCount || 0} hearts</span>
                          <span>Created {new Date(weekly.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleEditWeekly(weekly)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit message"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'weekly', id: weekly.id, title: weekly.title })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete message"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(!weeklyMessages || weeklyMessages.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No weekly updates yet. Create your first update above.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'termDates' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Term Dates</h3>
                <button
                  onClick={() => showTermDateForm ? handleCancelTermDateForm() : setShowTermDateForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showTermDateForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showTermDateForm ? 'Cancel' : 'Add Date'}</span>
                </button>
              </div>

              {showTermDateForm && (
                <form onSubmit={handleCreateTermDate} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                      <select
                        value={termDateForm.term}
                        onChange={(e) => {
                          const term = parseInt(e.target.value)
                          setTermDateForm({ ...termDateForm, term, termName: `Term ${term}` })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value={1}>Term 1</option>
                        <option value={2}>Term 2</option>
                        <option value={3}>Term 3</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select
                        value={termDateForm.type}
                        onChange={(e) => setTermDateForm({ ...termDateForm, type: e.target.value as TermDateType })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="term-start">Term Start</option>
                        <option value="term-end">Term End</option>
                        <option value="half-term">Half Term</option>
                        <option value="public-holiday">Public Holiday</option>
                        <option value="induction">Induction</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                      <select
                        value={termDateForm.color}
                        onChange={(e) => setTermDateForm({ ...termDateForm, color: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="green">Green</option>
                        <option value="red">Red</option>
                        <option value="blue">Blue</option>
                        <option value="amber">Amber</option>
                        <option value="purple">Purple</option>
                        <option value="gray">Gray</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                      <input
                        type="text"
                        value={termDateForm.label}
                        onChange={(e) => setTermDateForm({ ...termDateForm, label: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="e.g. First Day of Term 1"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sublabel (optional)</label>
                      <input
                        type="text"
                        value={termDateForm.sublabel}
                        onChange={(e) => setTermDateForm({ ...termDateForm, sublabel: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="e.g. Students return"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={termDateForm.date}
                        onChange={(e) => setTermDateForm({ ...termDateForm, date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Date (for date ranges)</label>
                      <input
                        type="date"
                        value={termDateForm.endDate}
                        onChange={(e) => setTermDateForm({ ...termDateForm, endDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? 'Please wait...' : editingTermDate ? 'Update Date' : 'Add Date'}
                  </button>
                </form>
              )}

              {/* Group term dates by term */}
              {[1, 2, 3].map((termNum) => {
                const termItems = termDates?.filter(td => td.term === termNum) || []
                if (termItems.length === 0) return null
                return (
                  <div key={termNum} className="mb-6">
                    <h4 className="font-medium text-gray-700 mb-3">Term {termNum}</h4>
                    <div className="space-y-2">
                      {termItems.map((termDate) => (
                        <div key={termDate.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div
                                className={`w-3 h-3 rounded-full ${
                                  termDate.color === 'green' ? 'bg-green-500' :
                                  termDate.color === 'red' ? 'bg-red-500' :
                                  termDate.color === 'blue' ? 'bg-blue-500' :
                                  termDate.color === 'amber' ? 'bg-amber-500' :
                                  termDate.color === 'purple' ? 'bg-purple-500' :
                                  'bg-gray-500'
                                }`}
                              />
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{termDate.label}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                                    {termDate.type.replace('-', ' ')}
                                  </span>
                                </div>
                                {termDate.sublabel && (
                                  <p className="text-sm text-gray-500">{termDate.sublabel}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-1">
                                  {new Date(termDate.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                  {termDate.endDate && ` - ${new Date(termDate.endDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEditTermDate(termDate)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                                title="Edit date"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm({ type: 'termDate', id: termDate.id, title: termDate.label })}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete date"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {(!termDates || termDates.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <CalendarDays className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No term dates yet. Add your first date above.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'pulse' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Parent Pulse Surveys</h3>
                <button
                  onClick={() => showPulseForm ? handleCancelPulseForm() : setShowPulseForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showPulseForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showPulseForm ? 'Cancel' : 'New Survey'}</span>
                </button>
              </div>

              {showPulseForm && (
                <form onSubmit={handleCreatePulse} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Half Term Name</label>
                    <input
                      type="text"
                      value={pulseForm.halfTermName}
                      onChange={(e) => setPulseForm({ ...pulseForm, halfTermName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g. Term 1 - Half Term 1"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Opens On</label>
                      <input
                        type="date"
                        value={pulseForm.opensAt}
                        onChange={(e) => setPulseForm({ ...pulseForm, opensAt: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Closes On</label>
                      <input
                        type="date"
                        value={pulseForm.closesAt}
                        onChange={(e) => setPulseForm({ ...pulseForm, closesAt: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Survey will be created as a draft. Use "Send Now" to open it for responses.
                  </p>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? 'Please wait...' : editingPulse ? 'Update Survey' : 'Create Survey'}
                  </button>
                </form>
              )}

              <div className="space-y-4">
                {pulseSurveys?.map((pulse) => (
                  <div key={pulse.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            pulse.status === 'DRAFT' ? 'bg-gray-200 text-gray-700' :
                            pulse.status === 'OPEN' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {pulse.status}
                          </span>
                          {pulse.responseCount !== undefined && pulse.responseCount > 0 && (
                            <span className="text-xs text-gray-500">{pulse.responseCount} responses</span>
                          )}
                        </div>
                        <h4 className="font-medium mt-2">{pulse.halfTermName}</h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(pulse.opensAt).toLocaleDateString()} - {new Date(pulse.closesAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        {pulse.status === 'DRAFT' && (
                          <button
                            onClick={() => handleSendPulse(pulse.id)}
                            className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors"
                            title="Send now"
                          >
                            <Play className="h-3 w-3" />
                            <span>Send</span>
                          </button>
                        )}
                        {pulse.status === 'OPEN' && (
                          <button
                            onClick={() => handleClosePulse(pulse.id)}
                            className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors"
                            title="Close survey"
                          >
                            <Square className="h-3 w-3" />
                            <span>Close</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleEditPulse(pulse)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit survey"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'pulse', id: pulse.id, title: pulse.halfTermName })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete survey"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(!pulseSurveys || pulseSurveys.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No pulse surveys yet. Create your first survey above.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'yearGroups' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Year Groups</h3>
                <button
                  onClick={() => showYearGroupForm ? handleCancelYearGroupForm() : setShowYearGroupForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showYearGroupForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showYearGroupForm ? 'Cancel' : 'Add Year Group'}</span>
                </button>
              </div>

              {showYearGroupForm && (
                <form onSubmit={handleCreateYearGroup} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={yearGroupForm.name}
                      onChange={(e) => setYearGroupForm({ ...yearGroupForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g. Reception, Year 1, Year 2"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? 'Please wait...' : editingYearGroup ? 'Update Year Group' : 'Create Year Group'}
                  </button>
                </form>
              )}

              <div className="space-y-1">
                {yearGroups?.map((yg) => (
                  <div
                    key={yg.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedYearGroupId(yg.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      e.currentTarget.classList.add('ring-2', 'ring-blue-400')
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('ring-2', 'ring-blue-400')
                    }}
                    onDrop={async (e) => {
                      e.preventDefault()
                      e.currentTarget.classList.remove('ring-2', 'ring-blue-400')
                      if (!draggedYearGroupId || draggedYearGroupId === yg.id || !yearGroups) return
                      const fromIndex = yearGroups.findIndex(y => y.id === draggedYearGroupId)
                      const toIndex = yearGroups.findIndex(y => y.id === yg.id)
                      if (fromIndex === -1 || toIndex === -1) return
                      const reordered = [...yearGroups]
                      const [moved] = reordered.splice(fromIndex, 1)
                      reordered.splice(toIndex, 0, moved)
                      try {
                        await api.yearGroups.reorder(reordered.map(y => y.id))
                        refetchYearGroups()
                      } catch (err) {
                        console.error('Failed to reorder year groups:', err)
                      }
                      setDraggedYearGroupId(null)
                    }}
                    onDragEnd={() => setDraggedYearGroupId(null)}
                    className={`bg-gray-50 rounded-lg p-4 cursor-grab active:cursor-grabbing transition-opacity ${draggedYearGroupId === yg.id ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900">{yg.name}</span>
                        <span className="text-sm text-gray-500">
                          {yg.classCount || 0} {(yg.classCount || 0) === 1 ? 'class' : 'classes'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditYearGroup(yg)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit year group"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'yearGroup', id: yg.id, title: yg.name })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete year group"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(!yearGroups || yearGroups.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <GraduationCap className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No year groups yet. Create your first year group above.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Classes</h3>
                <button
                  onClick={() => showClassForm ? handleCancelClassForm() : setShowClassForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showClassForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showClassForm ? 'Cancel' : 'Add Class'}</span>
                </button>
              </div>

              {showClassForm && (
                <form onSubmit={handleCreateClass} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
                    <input
                      type="text"
                      value={classForm.name}
                      onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g. Reception, Year 1, Year 2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year Group</label>
                    <select
                      value={classForm.yearGroupId}
                      onChange={(e) => setClassForm({ ...classForm, yearGroupId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">No year group</option>
                      {yearGroups?.map((yg) => (
                        <option key={yg.id} value={yg.id}>{yg.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chip Colour</label>
                    <div className="flex flex-wrap gap-2">
                      {CLASS_COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.bg}
                          type="button"
                          onClick={() => setClassForm({ ...classForm, colorBg: preset.bg, colorText: preset.text })}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            classForm.colorBg === preset.bg ? 'border-gray-900 scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: preset.hex }}
                          title={preset.label}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center space-x-2">
                      <span className="text-xs text-gray-500">Preview:</span>
                      <span
                        className={`text-xs px-3 py-1 rounded-full text-white font-medium`}
                        style={{ backgroundColor: CLASS_COLOR_PRESETS.find(p => p.bg === classForm.colorBg)?.hex || '#4B5563' }}
                      >
                        {classForm.name || 'Class Name'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assign Staff</label>
                    <div className="flex flex-wrap gap-2">
                      {staffList?.map((s) => (
                        <label key={s.id} className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-200">
                          <input
                            type="checkbox"
                            checked={classForm.staffIds.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setClassForm({ ...classForm, staffIds: [...classForm.staffIds, s.id] })
                              } else {
                                setClassForm({ ...classForm, staffIds: classForm.staffIds.filter(id => id !== s.id) })
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">{s.name}</span>
                          <span className="text-xs text-gray-400">({s.role === 'ADMIN' ? 'Admin' : 'Staff'})</span>
                        </label>
                      ))}
                      {(!staffList || staffList.length === 0) && (
                        <p className="text-sm text-gray-500">No staff members yet. Add staff first.</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? 'Please wait...' : editingClass ? 'Update Class' : 'Create Class'}
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {classesDetailed?.map((cls) => (
                  <div key={cls.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span
                          className="text-xs px-3 py-1 rounded-full font-medium text-white"
                          style={{ backgroundColor: CLASS_COLOR_PRESETS.find(p => p.bg === cls.colorBg)?.hex || '#4B5563' }}
                        >
                          {cls.name}
                        </span>
                        {cls.yearGroup && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                            {cls.yearGroup.name}
                          </span>
                        )}
                        <span className="text-sm text-gray-500">
                          {cls.studentCount} {cls.studentCount === 1 ? 'student' : 'students'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditClass(cls)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit class"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'class', id: cls.id, title: cls.name })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete class"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {cls.assignedStaff.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {cls.assignedStaff.map(s => (
                          <span key={s.id} className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {(!classesDetailed || classesDetailed.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No classes yet. Create your first class above.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'staff' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Staff Members</h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      if (showBulkImport) {
                        handleCancelBulkImport()
                      } else {
                        setShowBulkImport(true)
                        setShowStaffForm(false)
                      }
                    }}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg border ${
                      showBulkImport
                        ? 'bg-gray-100 border-gray-300 text-gray-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {showBulkImport ? <X className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                    <span>{showBulkImport ? 'Cancel' : 'Bulk Import'}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (showStaffForm) {
                        handleCancelStaffForm()
                      } else {
                        setShowStaffForm(true)
                        setShowBulkImport(false)
                      }
                    }}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {showStaffForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    <span>{showStaffForm ? 'Cancel' : 'Add Staff'}</span>
                  </button>
                </div>
              </div>

              {/* Bulk Import UI */}
              {showBulkImport && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Bulk Import Staff</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Copy staff names and emails from Excel (two columns: Name, Email) and paste below.
                    </p>
                    {bulkStaffData.length === 0 ? (
                      <div className="space-y-2">
                        <textarea
                          className="w-full h-32 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg font-mono text-sm focus:border-gray-400 focus:outline-none"
                          placeholder={"Paste from Excel or CSV here...\n\nName\tEmail\nJohn Smith\tjohn@school.com\nJane Doe\tjane@school.com"}
                          value={bulkPasteValue}
                          onChange={(e) => setBulkPasteValue(e.target.value)}
                        />
                        {bulkPasteValue.trim() && (
                          <button
                            onClick={() => parseBulkInput(bulkPasteValue)}
                            className="px-4 py-2 rounded-lg text-white font-medium text-sm"
                            style={{ backgroundColor: theme.colors.brandColor }}
                          >
                            Parse {bulkPasteValue.split('\n').filter(l => l.trim()).length} rows
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="border border-gray-300 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700">Name</th>
                              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700">Email</th>
                              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700">Role</th>
                              <th className="w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {bulkStaffData.map((row, index) => (
                              <tr key={index} className="bg-white">
                                <td className="px-3 py-2 text-sm">{row.name}</td>
                                <td className="px-3 py-2 text-sm text-gray-600">{row.email}</td>
                                <td className="px-3 py-2">
                                  <select
                                    value={row.role}
                                    onChange={(e) => handleBulkRoleChange(index, e.target.value as 'STAFF' | 'ADMIN')}
                                    className="text-sm px-2 py-1 border border-gray-300 rounded"
                                  >
                                    <option value="STAFF">Staff</option>
                                    <option value="ADMIN">Admin</option>
                                  </select>
                                </td>
                                <td className="px-2 py-2">
                                  <button
                                    onClick={() => handleBulkRemoveRow(index)}
                                    className="text-gray-400 hover:text-red-600"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {bulkImportResult && (
                    <div className={`p-3 rounded-lg ${bulkImportResult.errors?.length ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                      <p className="text-sm font-medium">
                        {bulkImportResult.created} staff member{bulkImportResult.created !== 1 ? 's' : ''} imported
                        {bulkImportResult.skipped > 0 && `, ${bulkImportResult.skipped} skipped`}
                      </p>
                      {bulkImportResult.errors && bulkImportResult.errors.length > 0 && (
                        <ul className="mt-2 text-xs text-amber-700 space-y-1">
                          {bulkImportResult.errors.slice(0, 5).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {bulkImportResult.errors.length > 5 && (
                            <li>...and {bulkImportResult.errors.length - 5} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}

                  {bulkStaffData.length > 0 && (
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          setBulkStaffData([])
                          setBulkImportResult(null)
                        }}
                        className="text-sm text-gray-600 hover:text-gray-800"
                      >
                        Clear all
                      </button>
                      <button
                        onClick={handleBulkImport}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
                        style={{ backgroundColor: theme.colors.brandColor }}
                      >
                        {isSubmitting ? 'Importing...' : `Import ${bulkStaffData.length} Staff`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showStaffForm && (
                <form onSubmit={handleCreateStaff} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={staffForm.name}
                        onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={staffForm.email}
                        onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={staffForm.role}
                      onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value as 'STAFF' | 'ADMIN' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="STAFF">Staff (can message assigned classes)</option>
                      <option value="ADMIN">Admin (full access)</option>
                    </select>
                  </div>
                  {staffForm.role === 'STAFF' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Classes</label>
                      <div className="flex flex-wrap gap-2">
                        {classes?.map((cls) => (
                          <label key={cls.id} className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-200">
                            <input
                              type="checkbox"
                              checked={staffForm.assignedClassIds.includes(cls.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setStaffForm({ ...staffForm, assignedClassIds: [...staffForm.assignedClassIds, cls.id] })
                                } else {
                                  setStaffForm({ ...staffForm, assignedClassIds: staffForm.assignedClassIds.filter(id => id !== cls.id) })
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm">{cls.name}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Staff can only send messages to their assigned classes</p>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? 'Please wait...' : editingStaff ? 'Update Staff' : 'Add Staff'}
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {staffList?.map((staffMember) => (
                  <div key={staffMember.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                          style={{ backgroundColor: staffMember.role === 'ADMIN' ? theme.colors.brandColor : '#6B7280' }}
                        >
                          {staffMember.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium">{staffMember.name}</h4>
                            {staffMember.role === 'ADMIN' ? (
                              <span className="flex items-center space-x-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                <Shield className="h-3 w-3" />
                                <span>Admin</span>
                              </span>
                            ) : (
                              <span className="flex items-center space-x-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                <GraduationCap className="h-3 w-3" />
                                <span>Staff</span>
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{staffMember.email}</p>
                          {staffMember.role === 'STAFF' && staffMember.assignedClasses.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {staffMember.assignedClasses.map(cls => (
                                <span key={cls.id} className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                                  {cls.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditStaff(staffMember)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit staff"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'staff', id: staffMember.id, title: staffMember.name })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete staff"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(!staffList || staffList.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <UserCog className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No staff members yet. Add your first staff member above.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'policies' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Policies</h3>
                <button
                  onClick={() => {
                    if (showPolicyForm) {
                      setShowPolicyForm(false)
                      setEditingPolicy(null)
                      setPolicyName('')
                      setPolicyDescription('')
                      setPolicyFile(null)
                    } else {
                      setShowPolicyForm(true)
                    }
                  }}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showPolicyForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showPolicyForm ? 'Cancel' : 'New Policy'}</span>
                </button>
              </div>

              {showPolicyForm && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setIsSubmitting(true)
                    try {
                      const formData = new FormData()
                      formData.append('name', policyName)
                      if (policyDescription) formData.append('description', policyDescription)
                      if (policyFile) formData.append('file', policyFile)

                      if (editingPolicy) {
                        await api.policies.update(editingPolicy.id, formData)
                      } else {
                        await api.policies.create(formData)
                      }
                      refetchPolicies()
                      setShowPolicyForm(false)
                      setEditingPolicy(null)
                      setPolicyName('')
                      setPolicyDescription('')
                      setPolicyFile(null)
                    } catch (error) {
                      console.error('Error saving policy:', error)
                      alert(error instanceof Error ? error.message : 'Failed to save policy')
                    } finally {
                      setIsSubmitting(false)
                    }
                  }}
                  className="bg-gray-50 rounded-lg p-4 mb-4 space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Policy Name</label>
                    <input
                      type="text"
                      value={policyName}
                      onChange={(e) => setPolicyName(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-burgundy"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={policyDescription}
                      onChange={(e) => setPolicyDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-burgundy"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      PDF File {editingPolicy ? '(leave empty to keep current)' : ''}
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setPolicyFile(e.target.files?.[0] || null)}
                      required={!editingPolicy}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    {isSubmitting ? 'Saving...' : editingPolicy ? 'Update Policy' : 'Create Policy'}
                  </button>
                </form>
              )}

              <div className="space-y-4">
                {policiesList?.map((policy) => (
                  <div key={policy.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-gray-500" />
                          <h4 className="font-medium">{policy.name}</h4>
                        </div>
                        {policy.description && (
                          <p className="text-sm text-gray-600 mt-1">{policy.description}</p>
                        )}
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          {policy.fileSize && (
                            <span>{(policy.fileSize / 1024).toFixed(0)} KB</span>
                          )}
                          <span>Updated {new Date(policy.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => {
                            setEditingPolicy(policy)
                            setPolicyName(policy.name)
                            setPolicyDescription(policy.description || '')
                            setPolicyFile(null)
                            setShowPolicyForm(true)
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Edit policy"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'policy', id: policy.id, title: policy.name })}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete policy"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(!policiesList || policiesList.length === 0) && (
                  <p className="text-gray-500 text-center py-8">No policies yet. Click "New Policy" to add one.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Analytics dashboard coming soon</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <ConfirmModal
          title={`Delete ${
            deleteConfirm.type === 'message' ? 'Message' :
            deleteConfirm.type === 'survey' ? 'Survey' :
            deleteConfirm.type === 'event' ? 'Event' :
            deleteConfirm.type === 'weekly' ? 'Weekly Update' :
            deleteConfirm.type === 'termDate' ? 'Term Date' :
            deleteConfirm.type === 'pulse' ? 'Pulse Survey' :
            deleteConfirm.type === 'class' ? 'Class' :
            deleteConfirm.type === 'policy' ? 'Policy' :
            'Staff Member'
          }?`}
          message={`Are you sure you want to delete "${deleteConfirm.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          isLoading={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
