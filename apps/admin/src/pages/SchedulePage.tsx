import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Plus, X, Pencil, Trash2, RotateCcw, CalendarDays, Pause, Play, Grid3X3, Save, Check, Bell } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type {
  ScheduleItem,
  Class,
  YearGroup,
  SubjectReminder,
  TimetableGrid,
  TimetableGridSubject,
  TimetableOverride,
} from '@wasil/shared'

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon', fullLabel: 'Monday' },
  { value: 2, label: 'Tue', fullLabel: 'Tuesday' },
  { value: 3, label: 'Wed', fullLabel: 'Wednesday' },
  { value: 4, label: 'Thu', fullLabel: 'Thursday' },
  { value: 5, label: 'Fri', fullLabel: 'Friday' },
]

const GRID_TYPES = [
  { value: '', label: '', icon: '', color: 'bg-gray-50' },
  { value: 'pe', label: 'PE', icon: '🏃', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'swimming', label: 'Swim', icon: '🏊', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'library', label: 'Lib', icon: '📚', color: 'bg-amber-100 text-amber-800 border-amber-300' },
]

const TYPE_INFO: Record<string, { label: string; icon: string; description: string }> = {
  'pe': { label: 'PE Day', icon: '🏃', description: 'Please wear PE kit' },
  'swimming': { label: 'Swimming', icon: '🏊', description: 'Remember swimwear, towel & goggles' },
  'library': { label: 'Library Day', icon: '📚', description: 'Return library books' },
}

const RECURRING_TYPES = [
  { value: 'pe', label: 'PE Day', icon: '🏃', description: 'Please wear PE kit' },
  { value: 'swimming', label: 'Swimming', icon: '🏊', description: 'Remember swimwear, towel & goggles' },
  { value: 'library', label: 'Library Day', icon: '📚', description: 'Return library books' },
  { value: 'music', label: 'Music Lesson', icon: '🎵', description: 'Bring instrument' },
  { value: 'custom', label: 'Custom...', icon: '📌', description: '' },
]

const ONEOFF_TYPES = [
  { value: 'trip', label: 'Trip', icon: '🚌', description: 'Packed lunch needed' },
  { value: 'early-finish', label: 'Early Finish', icon: '🕐', description: 'School ends early' },
  { value: 'non-uniform', label: 'Non-Uniform Day', icon: '👕', description: '' },
  { value: 'sports-day', label: 'Sports Day', icon: '🏆', description: 'Wear PE kit and bring water' },
  { value: 'performance', label: 'Performance', icon: '🎭', description: '' },
  { value: 'custom', label: 'Custom...', icon: '📌', description: '' },
]

// Grid cell state type - now supports multiple selections
type GridCell = {
  pe: boolean
  swimming: boolean
  library: boolean
}

// Grid state: classId -> dayOfWeek -> selections
type GridState = Record<string, Record<number, GridCell>>

const emptyCell: GridCell = { pe: false, swimming: false, library: false }

// Add `days` to a YYYY-MM-DD string without falling prey to local-timezone
// shifting (we only ever care about the calendar date, so do the math in UTC).
const addDaysToDateStr = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().split('T')[0]
}

// weekday: 1=Mon..5=Fri, relative to the Monday `weekOf` date the grid returns.
const dateForWeekday = (weekOf: string, weekday: number): string => addDaysToDateStr(weekOf, weekday - 1)

export function SchedulePage() {
  const theme = useTheme()
  const toast = useToast()
  const { data: scheduleItems, refetch } = useApi<ScheduleItem[]>(() => api.schedule.listAll(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])
  const { data: yearGroups } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])
  const { data: reminderRows, refetch: refetchReminders } = useApi<SubjectReminder[]>(
    () => api.schedule.reminders.list(),
    [],
  )
  // Hub-sourced read-only timetable. When Hub has an answer for the current
  // week, the Quick Setup grid becomes a confirmation view instead of a
  // manual editor — the manual grid below remains as a fallback only.
  const { data: hubGrid, refetch: refetchHubGrid } = useApi<TimetableGrid>(() => api.timetable.grid(), [])

  // This-week overrides (cancel/move/add) for the Hub-backed grid. Fetched for
  // the same Mon–Fri window the grid is showing, so we can match a row back
  // to its override id (needed for Undo/Remove) and know which weekday to
  // stamp new overrides with.
  const { data: timetableOverrides, refetch: refetchOverrides } = useApi<TimetableOverride[]>(() => {
    if (!hubGrid?.weekOf) return Promise.resolve([])
    return api.timetable.overrides.list(hubGrid.weekOf, dateForWeekday(hubGrid.weekOf, 5))
  }, [hubGrid?.weekOf])

  // Editable copy of the reminder map (subject → emoji + wording for the Hub
  // "today" helper). Synced from the API; each row saves individually.
  const [reminderDrafts, setReminderDrafts] = useState<SubjectReminder[]>([])
  const [savingReminderId, setSavingReminderId] = useState<string | null>(null)
  const [newReminder, setNewReminder] = useState({ subject: '', emoji: '', reminder: '' })
  const [addingReminder, setAddingReminder] = useState(false)
  const [reminderDeleteConfirm, setReminderDeleteConfirm] = useState<{ id: string; label: string } | null>(null)

  useEffect(() => {
    if (reminderRows) setReminderDrafts(reminderRows.map(r => ({ ...r })))
  }, [reminderRows])

  const setReminderField = (id: string, field: 'subject' | 'emoji' | 'reminder', value: string) => {
    setReminderDrafts(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const reminderIsDirty = (row: SubjectReminder) => {
    const original = reminderRows?.find(r => r.id === row.id)
    if (!original) return false
    return (
      original.subject !== row.subject ||
      original.emoji !== row.emoji ||
      original.reminder !== row.reminder ||
      original.active !== row.active
    )
  }

  const saveReminder = async (row: SubjectReminder) => {
    if (!row.subject.trim() || !row.emoji.trim() || !row.reminder.trim()) {
      toast.error('Subject, emoji and reminder are all required')
      return
    }
    setSavingReminderId(row.id)
    try {
      await api.schedule.reminders.update(row.id, {
        subject: row.subject.trim(),
        emoji: row.emoji.trim(),
        reminder: row.reminder.trim(),
        active: row.active,
      })
      await refetchReminders()
      toast.success('Reminder saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save reminder')
    } finally {
      setSavingReminderId(null)
    }
  }

  const toggleReminderActive = async (row: SubjectReminder) => {
    setSavingReminderId(row.id)
    try {
      await api.schedule.reminders.update(row.id, { active: !row.active })
      await refetchReminders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update reminder')
    } finally {
      setSavingReminderId(null)
    }
  }

  const addReminder = async () => {
    if (!newReminder.subject.trim() || !newReminder.emoji.trim() || !newReminder.reminder.trim()) {
      toast.error('Subject, emoji and reminder are all required')
      return
    }
    setAddingReminder(true)
    try {
      await api.schedule.reminders.create({
        subject: newReminder.subject.trim(),
        emoji: newReminder.emoji.trim(),
        reminder: newReminder.reminder.trim(),
      })
      setNewReminder({ subject: '', emoji: '', reminder: '' })
      await refetchReminders()
      toast.success('Reminder added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add reminder')
    } finally {
      setAddingReminder(false)
    }
  }

  const deleteReminder = async (id: string) => {
    try {
      await api.schedule.reminders.remove(id)
      await refetchReminders()
      toast.success('Reminder deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete reminder')
    }
  }

  const [activeTab, setActiveTab] = useState<'grid' | 'recurring' | 'oneoff' | 'reminders'>('grid')
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string } | null>(null)

  // Hub grid this-week override UI state (cancel / move / add a session).
  // `menuTarget` addresses the "Cancel this week / Move to…" popover for a
  // normal (non-overridden) subject chip; `addTarget` addresses the "+ Add"
  // popover for a cell. `overrideBusy` disables the relevant control while a
  // create/remove call for that subject is in flight.
  const [menuTarget, setMenuTarget] = useState<{ classId: string; day: number; subjectIdx: number } | null>(null)
  const [addTarget, setAddTarget] = useState<{ classId: string; day: number } | null>(null)
  const [addSubjectValue, setAddSubjectValue] = useState('')
  const [customSubject, setCustomSubject] = useState('')
  const [customEmoji, setCustomEmoji] = useState('')
  const [overrideBusy, setOverrideBusy] = useState<string | null>(null)

  // Grid state
  const [gridState, setGridState] = useState<GridState>({})
  const [originalGridState, setOriginalGridState] = useState<GridState>({})
  const [isSavingGrid, setIsSavingGrid] = useState(false)
  const [gridSaved, setGridSaved] = useState(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gridStateRef = useRef<GridState>({})
  const originalGridStateRef = useRef<GridState>({})

  // Form state
  const [targetClass, setTargetClass] = useState('Whole School')
  const [classId, setClassId] = useState('')
  const [yearGroupId, setYearGroupId] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [date, setDate] = useState('')
  const [type, setType] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')

  const recurringItems = scheduleItems?.filter(i => i.isRecurring) || []
  const oneoffItems = scheduleItems?.filter(i => !i.isRecurring) || []

  // Sort classes by year group order then by name
  const sortedClasses = useMemo(() => {
    if (!classes || !yearGroups) return []
    const ygOrder = new Map(yearGroups.map((yg, i) => [yg.id, i]))
    return [...classes].sort((a, b) => {
      const aOrder = ygOrder.get(a.yearGroupId || '') ?? 999
      const bOrder = ygOrder.get(b.yearGroupId || '') ?? 999
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.name.localeCompare(b.name)
    })
  }, [classes, yearGroups])

  // Initialize grid state from schedule items
  useEffect(() => {
    if (!scheduleItems || !classes) return

    const newState: GridState = {}

    // Initialize all classes with empty days
    classes.forEach(cls => {
      newState[cls.id] = {
        1: { ...emptyCell },
        2: { ...emptyCell },
        3: { ...emptyCell },
        4: { ...emptyCell },
        5: { ...emptyCell },
      }
    })

    // Fill in from existing schedule items (only PE, Swimming, Library for grid)
    recurringItems.forEach(item => {
      if (item.classId && item.dayOfWeek && ['pe', 'swimming', 'library'].includes(item.type)) {
        if (newState[item.classId]) {
          newState[item.classId][item.dayOfWeek][item.type as keyof GridCell] = true
        }
      }
    })

    setGridState(newState)
    setOriginalGridState(JSON.parse(JSON.stringify(newState)))
  }, [scheduleItems, classes])

  // Keep refs in sync with state so saveGrid always reads latest
  useEffect(() => { gridStateRef.current = gridState }, [gridState])
  useEffect(() => { originalGridStateRef.current = originalGridState }, [originalGridState])

  const hasGridChanges = useMemo(() => {
    return JSON.stringify(gridState) !== JSON.stringify(originalGridState)
  }, [gridState, originalGridState])

  const toggleCellType = (classId: string, day: number, type: keyof GridCell) => {
    setGridState(prev => {
      const current = prev[classId]?.[day] || { ...emptyCell }
      return {
        ...prev,
        [classId]: {
          ...prev[classId],
          [day]: {
            ...current,
            [type]: !current[type],
          },
        },
      }
    })
    setGridSaved(false)

    // Auto-save after a short debounce (allows rapid toggling)
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveGrid()
    }, 800)
  }

  const saveGrid = async () => {
    // Read from refs to always get the latest state (not stale closure)
    const currentGrid = gridStateRef.current
    const originalGrid = originalGridStateRef.current

    setIsSavingGrid(true)
    try {
      const toCreate: { classId: string; day: number; type: string }[] = []
      const toDelete: string[] = []

      // Compare grid states for each class, day, and type
      for (const classId of Object.keys(currentGrid)) {
        for (const day of [1, 2, 3, 4, 5]) {
          for (const type of ['pe', 'swimming', 'library'] as const) {
            const newVal = currentGrid[classId]?.[day]?.[type] || false
            const oldVal = originalGrid[classId]?.[day]?.[type] || false

            if (newVal !== oldVal) {
              // Find existing item
              const existingItem = recurringItems.find(
                i => i.classId === classId && i.dayOfWeek === day && i.type === type
              )

              if (oldVal && !newVal && existingItem) {
                // Was on, now off - delete
                toDelete.push(existingItem.id)
              } else if (!oldVal && newVal) {
                // Was off, now on - create
                toCreate.push({ classId, day, type })
              }
            }
          }
        }
      }

      // Execute deletes
      for (const id of toDelete) {
        await api.schedule.delete(id)
      }

      // Execute creates
      for (const item of toCreate) {
        const cls = classes?.find(c => c.id === item.classId)
        const info = TYPE_INFO[item.type]
        await api.schedule.create({
          targetClass: cls?.name || '',
          classId: item.classId,
          isRecurring: true,
          dayOfWeek: item.day,
          type: item.type,
          label: info.label,
          description: info.description,
          icon: info.icon,
        })
      }

      await refetch()
      setGridSaved(true)
      setTimeout(() => setGridSaved(false), 2000)
    } catch (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSavingGrid(false)
    }
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingItem(null)
    setTargetClass('Whole School')
    setClassId('')
    setYearGroupId('')
    setDayOfWeek(1)
    setDate('')
    setType('')
    setLabel('')
    setDescription('')
    setIcon('')
  }

  const handleTypeChange = (newType: string) => {
    setType(newType)
    const types = activeTab === 'recurring' ? RECURRING_TYPES : ONEOFF_TYPES
    const typeInfo = types.find(t => t.value === newType)
    if (typeInfo) {
      setLabel(typeInfo.label)
      setDescription(typeInfo.description)
      setIcon(typeInfo.icon)
    }
  }

  const handleTargetChange = (value: string) => {
    if (value === 'whole-school') {
      setTargetClass('Whole School')
      setClassId('')
      setYearGroupId('')
    } else if (value.startsWith('class-')) {
      const id = value.replace('class-', '')
      const cls = classes?.find(c => c.id === id)
      setTargetClass(cls?.name || '')
      setClassId(id)
      setYearGroupId('')
    } else if (value.startsWith('year-')) {
      const id = value.replace('year-', '')
      const yg = yearGroups?.find(y => y.id === id)
      setTargetClass(yg?.name || '')
      setClassId('')
      setYearGroupId(id)
    }
  }

  const getTargetValue = () => {
    if (classId) return `class-${classId}`
    if (yearGroupId) return `year-${yearGroupId}`
    return 'whole-school'
  }

  const handleEdit = (item: ScheduleItem) => {
    setEditingItem(item)
    setTargetClass(item.targetClass)
    setClassId(item.classId || '')
    setYearGroupId(item.yearGroupId || '')
    setDayOfWeek(item.dayOfWeek || 1)
    setDate(item.date ? new Date(item.date).toISOString().split('T')[0] : '')
    setType(item.type)
    setLabel(item.label)
    setDescription(item.description || '')
    setIcon(item.icon || '')
    setActiveTab(item.isRecurring ? 'recurring' : 'oneoff')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!type || !label) return

    setIsSubmitting(true)
    try {
      const isRecurring = activeTab === 'recurring'
      const data = {
        targetClass,
        classId: classId || undefined,
        yearGroupId: yearGroupId || undefined,
        isRecurring,
        dayOfWeek: isRecurring ? dayOfWeek : undefined,
        date: !isRecurring && date ? new Date(date).toISOString() : undefined,
        type,
        label,
        description: description || undefined,
        icon: icon || undefined,
      }

      if (editingItem) {
        await api.schedule.update(editingItem.id, data)
      } else {
        await api.schedule.create(data)
      }
      resetForm()
      refetch()
    } catch (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await api.schedule.delete(deleteConfirm.id)
      setDeleteConfirm(null)
      refetch()
    } catch (error) {
      toast.error(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const toggleActive = async (item: ScheduleItem) => {
    try {
      await api.schedule.update(item.id, { active: !item.active })
      refetch()
    } catch (error) {
      toast.error(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const getDayLabel = (day: number) => DAYS_OF_WEEK.find(d => d.value === day)?.fullLabel || ''

  // Hub can answer for the current week once it returns at least one class
  // with allocations; otherwise (no link, no data) we fall back to the
  // manual grid below so nothing appears to silently vanish.
  const isHubBacked = !!hubGrid?.hubAvailable && hubGrid.classes.length > 0

  // Match a Hub subject name to the same colour used for that type in the
  // manual grid legend, so read-only chips look consistent with GRID_TYPES.
  const subjectChipColor = (subject: string): string => {
    const key = subject.trim().toLowerCase()
    if (key === 'pe' || key.includes('physical education')) return GRID_TYPES.find(t => t.value === 'pe')!.color
    if (key.includes('swim')) return GRID_TYPES.find(t => t.value === 'swimming')!.color
    if (key.includes('librar')) return GRID_TYPES.find(t => t.value === 'library')!.color
    return 'bg-gray-100 text-gray-700 border-gray-300'
  }

  // Subjects already known to the school (whatever the Hub grid currently
  // shows), offered as quick picks in the "+ Add" popover. Deduped by name.
  const knownSubjects = useMemo(() => {
    const byKey = new Map<string, { subject: string; emoji: string }>()
    hubGrid?.classes.forEach(c => {
      Object.values(c.allocations).forEach(subs => {
        subs.forEach(s => {
          const key = s.subject.trim().toLowerCase()
          if (!byKey.has(key)) byKey.set(key, { subject: s.subject, emoji: s.emoji })
        })
      })
    })
    return Array.from(byKey.values()).sort((a, b) => a.subject.localeCompare(b.subject))
  }, [hubGrid])

  // A grid cell only tells us a subject is cancelled/added — not the override
  // row id we need to undo it. Match back to `timetableOverrides` by
  // classId + this weekday's date + subject name (the same subject text we
  // send when we create the override, so it always round-trips).
  const findOverrideRow = (classId: string, date: string, subject: string, action: 'CANCELLED' | 'ADDED') => {
    const norm = subject.trim().toLowerCase()
    return timetableOverrides?.find(
      o =>
        o.classId === classId &&
        o.date.slice(0, 10) === date &&
        o.action === action &&
        o.subject.trim().toLowerCase() === norm,
    )
  }

  const refreshAfterOverride = async () => {
    await Promise.all([refetchHubGrid(), refetchOverrides()])
  }

  const cancelSubject = async (classId: string, day: number, subject: TimetableGridSubject) => {
    if (!hubGrid?.weekOf) return
    const key = `${classId}-${day}-${subject.subject}`
    setOverrideBusy(key)
    try {
      await api.timetable.overrides.create({
        classId,
        date: dateForWeekday(hubGrid.weekOf, day),
        subject: subject.subject,
        action: 'CANCELLED',
      })
      await refreshAfterOverride()
      toast.success(`${subject.subject} cancelled for this week`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel session')
    } finally {
      setOverrideBusy(null)
      setMenuTarget(null)
    }
  }

  const moveSubject = async (classId: string, fromDay: number, subject: TimetableGridSubject, toDay: number) => {
    if (!hubGrid?.weekOf) return
    const key = `${classId}-${fromDay}-${subject.subject}`
    setOverrideBusy(key)
    try {
      await Promise.all([
        api.timetable.overrides.create({
          classId,
          date: dateForWeekday(hubGrid.weekOf, fromDay),
          subject: subject.subject,
          action: 'CANCELLED',
        }),
        api.timetable.overrides.create({
          classId,
          date: dateForWeekday(hubGrid.weekOf, toDay),
          subject: subject.subject,
          action: 'ADDED',
          emoji: subject.emoji,
        }),
      ])
      await refreshAfterOverride()
      toast.success(`${subject.subject} moved to ${getDayLabel(toDay)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move session')
    } finally {
      setOverrideBusy(null)
      setMenuTarget(null)
    }
  }

  const undoOverrideRow = async (overrideId: string, key: string) => {
    setOverrideBusy(key)
    try {
      await api.timetable.overrides.remove(overrideId)
      await refreshAfterOverride()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to undo override')
    } finally {
      setOverrideBusy(null)
    }
  }

  const submitAddOverride = async (classId: string, day: number) => {
    if (!hubGrid?.weekOf) return
    let subject: string
    let emoji: string
    if (addSubjectValue === '__custom') {
      subject = customSubject.trim()
      emoji = customEmoji.trim()
      if (!subject) {
        toast.error('Enter a subject name')
        return
      }
    } else {
      const known = knownSubjects.find(k => k.subject === addSubjectValue)
      if (!known) {
        toast.error('Choose a subject')
        return
      }
      subject = known.subject
      emoji = known.emoji
    }
    const key = `${classId}-${day}-__add`
    setOverrideBusy(key)
    try {
      await api.timetable.overrides.create({
        classId,
        date: dateForWeekday(hubGrid.weekOf, day),
        subject,
        action: 'ADDED',
        ...(emoji ? { emoji } : {}),
      })
      await refreshAfterOverride()
      setAddTarget(null)
      setAddSubjectValue('')
      setCustomSubject('')
      setCustomEmoji('')
      toast.success(`${subject} added for this week`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add session')
    } finally {
      setOverrideBusy(null)
    }
  }

  const renderHubCell = (cls: Class, day: number) => {
    const hubClass = hubGrid?.classes.find(c => c.classId === cls.id)
    const subjects = hubClass?.allocations[day] || []
    const dateStr = hubGrid?.weekOf ? dateForWeekday(hubGrid.weekOf, day) : ''
    const isAddOpen = addTarget?.classId === cls.id && addTarget.day === day
    const addBusy = overrideBusy === `${cls.id}-${day}-__add`

    return (
      <div className="relative">
        {(menuTarget || addTarget) && (
          <div
            className="fixed inset-0 z-0"
            onClick={() => {
              setMenuTarget(null)
              setAddTarget(null)
            }}
          />
        )}
        <div className="flex flex-wrap gap-1 justify-center items-center">
          {subjects.length === 0 && (
            <div className="flex justify-center text-gray-300 text-sm select-none min-h-[1.75rem] items-center">–</div>
          )}
          {subjects.map((s, i) => {
            const busyKey = `${cls.id}-${day}-${s.subject}`
            const isBusy = overrideBusy === busyKey

            if (s.cancelled) {
              const ov = findOverrideRow(cls.id, dateStr, s.subject, 'CANCELLED')
              return (
                <span
                  key={`${s.subject}-${i}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium bg-gray-50 text-gray-400 border-gray-200"
                >
                  <span className="opacity-60 line-through">{s.emoji}</span>
                  <span className="line-through">{s.subject}</span>
                  {ov && (
                    <button
                      onClick={() => undoOverrideRow(ov.id, busyKey)}
                      disabled={isBusy}
                      className="ml-1 text-[10px] font-semibold text-blue-500 hover:text-blue-700 disabled:opacity-40"
                      title="Undo cancellation"
                    >
                      {isBusy ? '…' : 'Undo'}
                    </button>
                  )}
                </span>
              )
            }

            if (s.added) {
              const ov = findOverrideRow(cls.id, dateStr, s.subject, 'ADDED')
              return (
                <span
                  key={`${s.subject}-${i}`}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium ${subjectChipColor(s.subject)}`}
                >
                  <span>{s.emoji}</span>
                  <span>{s.subject}</span>
                  <span className="text-[9px] uppercase tracking-wide bg-white/60 px-1 rounded">added</span>
                  {ov && (
                    <button
                      onClick={() => undoOverrideRow(ov.id, busyKey)}
                      disabled={isBusy}
                      className="ml-1 text-[10px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-40"
                      title="Remove this addition"
                    >
                      {isBusy ? '…' : 'Remove'}
                    </button>
                  )}
                </span>
              )
            }

            const isMenuOpen = menuTarget?.classId === cls.id && menuTarget.day === day && menuTarget.subjectIdx === i
            return (
              <span key={`${s.subject}-${i}`} className="relative z-10">
                <button
                  onClick={() => setMenuTarget(isMenuOpen ? null : { classId: cls.id, day, subjectIdx: i })}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium ${subjectChipColor(s.subject)} hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-shadow`}
                  title="Cancel or move this session (this week only)"
                >
                  <span>{s.emoji}</span>
                  <span>{s.subject}</span>
                </button>
                {isMenuOpen && (
                  <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-40 text-left">
                    <button
                      onClick={() => cancelSubject(cls.id, day, s)}
                      disabled={isBusy}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-red-50 text-red-600 disabled:opacity-40"
                    >
                      {isBusy ? 'Working…' : 'Cancel this week'}
                    </button>
                    <div className="mt-1 pt-1 border-t border-gray-100">
                      <div className="px-2 py-1 text-[10px] uppercase text-gray-400 font-semibold">Move to…</div>
                      {DAYS_OF_WEEK.filter(d => d.value !== day).map(d => (
                        <button
                          key={d.value}
                          onClick={() => moveSubject(cls.id, day, s, d.value)}
                          disabled={isBusy}
                          className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-blue-50 text-gray-700 disabled:opacity-40"
                        >
                          {d.fullLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </span>
            )
          })}

          <button
            onClick={() => {
              setAddTarget(isAddOpen ? null : { classId: cls.id, day })
              setAddSubjectValue('')
              setCustomSubject('')
              setCustomEmoji('')
            }}
            className="relative z-10 text-gray-300 hover:text-gray-500 text-xs px-1.5 py-1 rounded border border-dashed border-gray-200 hover:border-gray-400 transition-colors"
            title="Add a session for this day"
          >
            + Add
          </button>
        </div>

        {isAddOpen && (
          <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-48 text-left space-y-2">
            <div className="text-[10px] uppercase text-gray-400 font-semibold px-1">Add session ({getDayLabel(day)})</div>
            <select
              value={addSubjectValue}
              onChange={e => setAddSubjectValue(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1"
            >
              <option value="">Choose subject…</option>
              {knownSubjects.map(ks => (
                <option key={ks.subject} value={ks.subject}>
                  {ks.emoji} {ks.subject}
                </option>
              ))}
              <option value="__custom">Custom…</option>
            </select>
            {addSubjectValue === '__custom' && (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={customEmoji}
                  onChange={e => setCustomEmoji(e.target.value)}
                  placeholder="🎵"
                  maxLength={4}
                  className="w-10 text-center text-sm border border-gray-200 rounded px-1 py-1"
                  aria-label="Emoji"
                />
                <input
                  type="text"
                  value={customSubject}
                  onChange={e => setCustomSubject(e.target.value)}
                  placeholder="Subject name"
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1"
                  aria-label="Subject name"
                />
              </div>
            )}
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => setAddTarget(null)}
                className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => submitAddOverride(cls.id, day)}
                disabled={addBusy || !addSubjectValue}
                className="px-2 py-1 text-xs rounded text-white disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {addBusy ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderCell = (classId: string, day: number) => {
    const cell = gridState[classId]?.[day] || emptyCell
    return (
      <div className="flex gap-1 justify-center">
        {GRID_TYPES.filter(t => t.value).map(t => {
          const isActive = cell[t.value as keyof GridCell]
          return (
            <button
              key={t.value}
              onClick={() => toggleCellType(classId, day, t.value as keyof GridCell)}
              className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-110 flex items-center justify-center text-lg ${
                isActive
                  ? t.color + ' border-current'
                  : 'bg-gray-50 border-dashed border-gray-200 opacity-40 hover:opacity-70'
              }`}
              title={t.label}
            >
              {t.icon}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule & Reminders</h1>
          <p className="text-gray-600 mt-1">Set up recurring reminders (PE kit, swimming) and one-off events</p>
        </div>
        {(activeTab === 'recurring' || activeTab === 'oneoff') && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-5 h-5" />
            <span>Add Item</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('grid')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'grid' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Grid3X3 className="w-4 h-4" />
          <span>Timetable</span>
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'recurring' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>All Recurring</span>
        </button>
        <button
          onClick={() => setActiveTab('oneoff')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'oneoff' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>One-Off Events</span>
        </button>
        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'reminders' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Reminder Wording</span>
        </button>
      </div>

      {/* Grid View */}
      {activeTab === 'grid' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {isHubBacked ? (
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Weekly Timetable</h2>
                <p className="text-sm text-gray-500">
                  From the school timetable — managed in Wasil Hub (read-only)
                  {hubGrid?.weekOf && (
                    <>
                      {' • '}
                      Week of {new Date(hubGrid.weekOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </>
                  )}
                </p>
                {hubGrid?.weekOf && (
                  <p className="text-xs text-amber-600 mt-1">
                    Cancel, move or add a session below — overrides apply to the week of {hubGrid.weekOf} only.
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2 text-sm">
                {GRID_TYPES.filter(t => t.value).map(t => (
                  <span key={t.value} className={`px-2 py-1 rounded ${t.color} border`}>
                    {t.icon} {t.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Weekly Schedule Grid</h2>
                <p className="text-sm text-gray-500">Click icons to toggle on/off for each class and day</p>
              </div>
              <div className="flex items-center space-x-3">
                {/* Legend */}
                <div className="flex items-center space-x-2 text-sm">
                  {GRID_TYPES.filter(t => t.value).map(t => (
                    <span key={t.value} className={`px-2 py-1 rounded ${t.color} border`}>
                      {t.icon} {t.label}
                    </span>
                  ))}
                </div>
                <div className="flex items-center space-x-2 text-sm font-medium">
                  {isSavingGrid ? (
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                      Saving...
                    </span>
                  ) : gridSaved ? (
                    <span className="flex items-center gap-1.5 text-green-600">
                      <Check className="w-4 h-4" />
                      Saved
                    </span>
                  ) : hasGridChanges ? (
                    <span className="flex items-center gap-1.5 text-amber-500">
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                      Unsaved
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-gray-300">
                      <Check className="w-4 h-4" />
                      Up to date
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-40">Class</th>
                  {DAYS_OF_WEEK.map(day => (
                    <th key={day.value} className="px-2 py-3 text-center text-sm font-semibold text-gray-700 w-36">
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedClasses.map(cls => (
                  <tr key={cls.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2">
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cls.colorBg?.replace('bg-', '').includes('-') ? undefined : cls.colorBg }}
                        />
                        <span className="font-medium text-gray-900">{cls.name}</span>
                      </div>
                    </td>
                    {DAYS_OF_WEEK.map(day => (
                      <td key={day.value} className="px-2 py-2">
                        {isHubBacked ? renderHubCell(cls, day.value) : renderCell(cls.id, day.value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sortedClasses.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No classes found. Add classes first to set up schedules.
            </div>
          )}
        </div>
      )}

      {/* Recurring Items */}
      {activeTab === 'recurring' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Weekly Recurring Items</h2>
            <p className="text-sm text-gray-500">These repeat every week on the specified day</p>
          </div>
          {recurringItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No recurring items yet. Use Quick Setup or add manually.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recurringItems.map(item => (
                <div key={item.id} className={`p-4 flex items-center justify-between ${!item.active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <div className="font-medium text-gray-900">{item.label}</div>
                      <div className="text-sm text-gray-500">
                        {getDayLabel(item.dayOfWeek!)} • {item.targetClass}
                      </div>
                      {item.description && (
                        <div className="text-sm text-gray-400">{item.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleActive(item)}
                      className={`p-2 rounded-lg ${item.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                      title={item.active ? 'Pause' : 'Activate'}
                    >
                      {item.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: item.id, label: item.label })}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* One-Off Items */}
      {activeTab === 'oneoff' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">One-Off Events</h2>
            <p className="text-sm text-gray-500">Single events on specific dates</p>
          </div>
          {oneoffItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No one-off events. Add trips, early finishes, non-uniform days, etc.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {oneoffItems.map(item => (
                <div key={item.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <div className="font-medium text-gray-900">{item.label}</div>
                      <div className="text-sm text-gray-500">
                        {item.date ? new Date(item.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''} • {item.targetClass}
                      </div>
                      {item.description && (
                        <div className="text-sm text-gray-400">{item.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: item.id, label: item.label })}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reminder Wording */}
      {activeTab === 'reminders' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Reminder Wording</h2>
            <p className="text-sm text-gray-500">
              The nudge parents see when their child has this subject on the timetable, e.g.
              “Swimming — remember swimwear”. The days come from the school timetable automatically;
              here you only set the wording. Subjects are matched by name.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {reminderDrafts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No reminder wording yet — add a subject below.
              </div>
            ) : (
              reminderDrafts.map(row => (
                <div key={row.id} className="p-4 flex items-center gap-3">
                  <input
                    type="text"
                    value={row.emoji}
                    onChange={e => setReminderField(row.id, 'emoji', e.target.value)}
                    className="w-14 text-center text-xl px-2 py-2 border border-gray-200 rounded-lg"
                    aria-label="Emoji"
                  />
                  <input
                    type="text"
                    value={row.subject}
                    onChange={e => setReminderField(row.id, 'subject', e.target.value)}
                    placeholder="Subject"
                    className="w-40 px-3 py-2 border border-gray-200 rounded-lg font-medium text-gray-900"
                    aria-label="Subject"
                  />
                  <input
                    type="text"
                    value={row.reminder}
                    onChange={e => setReminderField(row.id, 'reminder', e.target.value)}
                    placeholder="What to bring / do"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-gray-700"
                    aria-label="Reminder text"
                  />
                  <button
                    onClick={() => toggleReminderActive(row)}
                    disabled={savingReminderId === row.id}
                    title={row.active ? 'Active — parents see this' : 'Hidden — parents will not see this'}
                    className={`p-2 rounded-lg ${row.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    {row.active ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => saveReminder(row)}
                    disabled={savingReminderId === row.id || !reminderIsDirty(row)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm disabled:opacity-40"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => setReminderDeleteConfirm({ id: row.id, label: row.subject })}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}

            {/* Add row */}
            <div className="p-4 flex items-center gap-3 bg-gray-50/50">
              <input
                type="text"
                value={newReminder.emoji}
                onChange={e => setNewReminder(prev => ({ ...prev, emoji: e.target.value }))}
                placeholder="🎵"
                className="w-14 text-center text-xl px-2 py-2 border border-gray-200 rounded-lg bg-white"
                aria-label="New emoji"
              />
              <input
                type="text"
                value={newReminder.subject}
                onChange={e => setNewReminder(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="New subject"
                className="w-40 px-3 py-2 border border-gray-200 rounded-lg bg-white"
                aria-label="New subject"
              />
              <input
                type="text"
                value={newReminder.reminder}
                onChange={e => setNewReminder(prev => ({ ...prev, reminder: e.target.value }))}
                placeholder="What to bring / do"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-white"
                aria-label="New reminder text"
                onKeyDown={e => { if (e.key === 'Enter') addReminder() }}
              />
              <button
                onClick={addReminder}
                disabled={addingReminder}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingItem ? 'Edit Item' : `Add ${activeTab === 'recurring' ? 'Recurring' : 'One-Off'} Item`}
              </h2>
              <button onClick={resetForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <select
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select type...</option>
                  {(activeTab === 'recurring' ? RECURRING_TYPES : ONEOFF_TYPES).map(t => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>

              {/* Target Class/Year */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Applies to</label>
                <select
                  value={getTargetValue()}
                  onChange={(e) => handleTargetChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="whole-school">Whole School</option>
                  {yearGroups?.map(yg => (
                    <option key={yg.id} value={`year-${yg.id}`}>{yg.name}</option>
                  ))}
                  {classes?.map(cls => (
                    <option key={cls.id} value={`class-${cls.id}`}>{cls.name}</option>
                  ))}
                </select>
              </div>

              {/* Day of Week (recurring) or Date (one-off) */}
              {activeTab === 'recurring' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Day of Week</label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {DAYS_OF_WEEK.map(d => (
                      <option key={d.value} value={d.value}>{d.fullLabel}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              )}

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. PE Day"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Please wear PE kit"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Icon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Icon (emoji)</label>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="e.g. 🏃"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  maxLength={4}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
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
                  {isSubmitting ? 'Saving...' : editingItem ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Item"
          message={`Are you sure you want to delete "${deleteConfirm.label}"?`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
          variant="danger"
        />
      )}

      {reminderDeleteConfirm && (
        <ConfirmModal
          title="Delete Reminder"
          message={`Delete the reminder wording for "${reminderDeleteConfirm.label}"? Parents will no longer see a nudge for this subject.`}
          confirmLabel="Delete"
          onConfirm={() => {
            const id = reminderDeleteConfirm.id
            setReminderDeleteConfirm(null)
            deleteReminder(id)
          }}
          onCancel={() => setReminderDeleteConfirm(null)}
          variant="danger"
        />
      )}
    </div>
  )
}
