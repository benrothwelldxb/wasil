import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, Calendar, RotateCcw, CalendarDays, Pause, Play } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { ScheduleItem, Class, YearGroup } from '@wasil/shared'

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
]

const RECURRING_TYPES = [
  { value: 'pe', label: 'PE Day', icon: '🏃', description: 'Please wear PE kit' },
  { value: 'swimming', label: 'Swimming', icon: '🏊', description: 'Remember swimwear, towel & goggles' },
  { value: 'library', label: 'Library Day', icon: '📚', description: 'Return library books' },
  { value: 'forest-school', label: 'Forest School', icon: '🌲', description: 'Wear old clothes and wellies' },
  { value: 'music', label: 'Music Lesson', icon: '🎵', description: 'Bring instrument' },
]

const ONEOFF_TYPES = [
  { value: 'trip', label: 'Field Trip', icon: '🚌', description: 'Packed lunch needed' },
  { value: 'early-finish', label: 'Early Finish', icon: '🕐', description: 'School ends early' },
  { value: 'non-uniform', label: 'Non-Uniform Day', icon: '👕', description: '' },
  { value: 'sports-day', label: 'Sports Day', icon: '🏆', description: 'Wear PE kit and bring water' },
  { value: 'performance', label: 'Performance', icon: '🎭', description: '' },
]

export function SchedulePage() {
  const theme = useTheme()
  const { data: scheduleItems, refetch } = useApi<ScheduleItem[]>(() => api.schedule.listAll(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])
  const { data: yearGroups } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])

  const [activeTab, setActiveTab] = useState<'recurring' | 'oneoff'>('recurring')
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; label: string } | null>(null)

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
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const toggleActive = async (item: ScheduleItem) => {
    try {
      await api.schedule.update(item.id, { active: !item.active })
      refetch()
    } catch (error) {
      alert(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const getDayLabel = (day: number) => DAYS_OF_WEEK.find(d => d.value === day)?.label || ''

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule & Reminders</h1>
          <p className="text-gray-600 mt-1">Set up recurring reminders (PE kit, swimming) and one-off events</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <Plus className="w-5 h-5" />
          <span>Add Item</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('recurring')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'recurring' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Weekly Recurring</span>
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
      </div>

      {/* Recurring Items */}
      {activeTab === 'recurring' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Weekly Recurring Items</h2>
            <p className="text-sm text-gray-500">These repeat every week on the specified day</p>
          </div>
          {recurringItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No recurring items yet. Add PE days, swimming lessons, etc.
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
                      <option key={d.value} value={d.value}>{d.label}</option>
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
    </div>
  )
}
