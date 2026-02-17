import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, BookOpen } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { Class, YearGroup } from '@wasil/shared'
import type { ClassWithDetails, StaffMember } from '@wasil/shared'

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

export function ClassesPage() {
  const theme = useTheme()
  const { data: classesDetailed, refetch: refetchClasses } = useApi<ClassWithDetails[]>(() => api.classes.listAll(), [])
  const { data: staffList } = useApi<StaffMember[]>(() => api.staff.list(), [])
  const { data: yearGroups } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassWithDetails | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)

  const [name, setName] = useState('')
  const [yearGroupId, setYearGroupId] = useState('')
  const [colorBg, setColorBg] = useState('bg-blue-600')
  const [colorText, setColorText] = useState('text-white')
  const [selectedColorHex, setSelectedColorHex] = useState('#2563EB')
  const [staffIds, setStaffIds] = useState<string[]>([])

  const resetForm = () => {
    setShowForm(false)
    setEditingClass(null)
    setName('')
    setYearGroupId('')
    setColorBg('bg-blue-600')
    setColorText('text-white')
    setSelectedColorHex('#2563EB')
    setStaffIds([])
  }

  const handleEdit = (cls: ClassWithDetails) => {
    setName(cls.name)
    setYearGroupId(cls.yearGroupId || '')
    setColorBg(cls.colorBg)
    setColorText(cls.colorText)
    const preset = CLASS_COLOR_PRESETS.find(p => p.bg === cls.colorBg)
    setSelectedColorHex(preset?.hex || '#2563EB')
    setStaffIds(cls.assignedStaff.map(s => s.id))
    setEditingClass(cls)
    setShowForm(true)
  }

  const selectColor = (preset: typeof CLASS_COLOR_PRESETS[0]) => {
    setColorBg(preset.bg)
    setColorText(preset.text)
    setSelectedColorHex(preset.hex)
  }

  const toggleStaff = (id: string) => {
    setStaffIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsSubmitting(true)
    try {
      const data = {
        name: name.trim(),
        colorBg,
        colorText,
        staffIds,
        yearGroupId: yearGroupId || undefined,
      }
      if (editingClass) {
        await api.classes.update(editingClass.id, data)
      } else {
        await api.classes.create(data)
      }
      resetForm()
      refetchClasses()
    } catch (error) {
      alert(`Failed to save class: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await api.classes.delete(deleteConfirm.id)
      refetchClasses()
      setDeleteConfirm(null)
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Classes</h2>
        <button
          onClick={() => showForm ? resetForm() : setShowForm(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showForm ? 'Cancel' : 'New Class'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Reception Oak"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year Group</label>
            <select
              value={yearGroupId}
              onChange={e => setYearGroupId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">No year group</option>
              {yearGroups?.map(yg => (
                <option key={yg.id} value={yg.id}>{yg.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chip Colour</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {CLASS_COLOR_PRESETS.map(preset => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => selectColor(preset)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${selectedColorHex === preset.hex ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: preset.hex }}
                  title={preset.label}
                />
              ))}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Preview:</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium text-white`}
                style={{ backgroundColor: selectedColorHex }}
              >
                {name || 'Class Name'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Staff</label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {staffList?.map(member => (
                <label key={member.id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffIds.includes(member.id)}
                    onChange={() => toggleStaff(member.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{member.name}</span>
                  <span className="text-xs text-gray-400">({member.role})</span>
                </label>
              ))}
              {(!staffList || staffList.length === 0) && (
                <p className="text-sm text-gray-400">No staff members found</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isSubmitting ? 'Saving...' : editingClass ? 'Update Class' : 'Create Class'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {classesDetailed?.map(cls => {
          const preset = CLASS_COLOR_PRESETS.find(p => p.bg === cls.colorBg)
          const chipColor = preset?.hex || '#2563EB'
          return (
            <div key={cls.id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: chipColor }}
                  >
                    {cls.name}
                  </span>
                  {cls.yearGroup && (
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                      {cls.yearGroup.name}
                    </span>
                  )}
                  <span className="text-sm text-gray-500 flex items-center space-x-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{cls.studentCount} student{cls.studentCount !== 1 ? 's' : ''}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {cls.assignedStaff.map(s => (
                    <span key={s.id} className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                      {s.name}
                    </span>
                  ))}
                  <button onClick={() => handleEdit(cls)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteConfirm({ id: cls.id, name: cls.name })} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {(!classesDetailed || classesDetailed.length === 0) && (
          <div className="text-center py-12 text-gray-500">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No classes yet. Create your first class above.</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title="Delete Class?"
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
