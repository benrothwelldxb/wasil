import React, { useState } from 'react'
import { Plus, X, Upload, Users, Search, Pencil, Trash2 } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { Class, Student } from '@wasil/shared'

interface BulkImportResult {
  created: number
  skipped: number
  errors?: string[]
}

export function StudentsPage() {
  const theme = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data: studentsData, refetch: refetchStudents } = useApi(
    () => api.students.list({ search: searchQuery, classId: classFilter || undefined, page, limit: 50 }),
    [searchQuery, classFilter, page]
  )
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])

  const [showForm, setShowForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Individual form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [classId, setClassId] = useState('')
  const [externalId, setExternalId] = useState('')

  // Bulk import
  const [bulkText, setBulkText] = useState('')
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null)
  const [isBulkImporting, setIsBulkImporting] = useState(false)

  const resetForm = () => {
    setShowForm(false)
    setShowBulkImport(false)
    setEditingStudent(null)
    setFirstName('')
    setLastName('')
    setClassId('')
    setExternalId('')
    setBulkText('')
    setBulkResult(null)
  }

  const startEdit = (student: Student) => {
    setEditingStudent(student)
    setFirstName(student.firstName)
    setLastName(student.lastName)
    setClassId(student.classId)
    setExternalId(student.externalId || '')
    setShowForm(true)
    setShowBulkImport(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !classId) {
      alert('First name, last name, and class are required')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingStudent) {
        await api.students.update(editingStudent.id, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          classId,
          externalId: externalId.trim() || undefined,
        })
      } else {
        await api.students.create({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          classId,
          externalId: externalId.trim() || undefined,
        })
      }
      resetForm()
      refetchStudents()
    } catch (error) {
      alert(`Failed to ${editingStudent ? 'update' : 'create'} student: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return

    // Parse CSV
    const lines = bulkText.trim().split('\n')
    const headerLine = lines[0].toLowerCase()

    // Check if first line is a header
    const hasHeader = headerLine.includes('first') || headerLine.includes('last') || headerLine.includes('class')
    const dataLines = hasHeader ? lines.slice(1) : lines

    const students: Array<{ firstName: string; lastName: string; className: string; externalId?: string }> = []

    for (const line of dataLines) {
      if (!line.trim()) continue
      const parts = line.split(',').map(p => p.trim())
      if (parts.length >= 3) {
        students.push({
          firstName: parts[0],
          lastName: parts[1],
          className: parts[2],
          externalId: parts[3] || undefined,
        })
      }
    }

    if (students.length === 0) {
      alert('No valid rows found in CSV')
      return
    }

    setIsBulkImporting(true)
    try {
      const result = await api.students.bulkCreate(students)
      setBulkResult({ created: result.created, skipped: result.skipped, errors: result.errors })
      refetchStudents()
    } catch (error) {
      alert(`Bulk import failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsBulkImporting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await api.students.delete(deleteConfirm.id)
      refetchStudents()
      setDeleteConfirm(null)
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const students = studentsData?.students || []
  const pagination = studentsData?.pagination

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Students</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setShowBulkImport(!showBulkImport); setShowForm(false); setEditingStudent(null) }}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" />
            <span>Bulk Import</span>
          </button>
          <button
            onClick={() => showForm && !editingStudent ? resetForm() : (setShowForm(true), setShowBulkImport(false), setEditingStudent(null))}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {showForm && !editingStudent ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>{showForm && !editingStudent ? 'Cancel' : 'Add Student'}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4 mb-6">
        <select
          value={classFilter}
          onChange={e => { setClassFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Classes</option>
          {classes?.map(cls => (
            <option key={cls.id} value={cls.id}>{cls.name}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
            placeholder="Search by name or student ID..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Bulk Import Form */}
      {showBulkImport && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6 space-y-4">
          <h3 className="font-medium text-gray-900">Bulk Import Students</h3>
          <p className="text-sm text-gray-500">
            Paste CSV data with headers: First Name, Last Name, Class Name, Student ID (optional)
          </p>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            placeholder={"First Name,Last Name,Class Name,Student ID\nEmma,Smith,Y2 Red,S2025-001\nOliver,Brown,FS1 Blue,"}
          />
          <div className="flex justify-end">
            <button
              onClick={handleBulkImport}
              disabled={isBulkImporting || !bulkText.trim()}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {isBulkImporting ? 'Importing...' : 'Import Students'}
            </button>
          </div>

          {bulkResult && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <p className="font-medium text-gray-900">Import Complete</p>
              <div className="flex items-center space-x-4 mt-2 text-sm">
                <span className="text-green-600">{bulkResult.created} created</span>
                {bulkResult.skipped > 0 && <span className="text-amber-600">{bulkResult.skipped} skipped</span>}
              </div>
              {bulkResult.errors && bulkResult.errors.length > 0 && (
                <ul className="mt-2 text-sm text-red-600 space-y-1">
                  {bulkResult.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                  {bulkResult.errors.length > 5 && (
                    <li>... and {bulkResult.errors.length - 5} more errors</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="font-medium text-gray-900 mb-4">
            {editingStudent ? 'Edit Student' : 'Add New Student'}
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Emma"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Smith"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
              <select
                value={classId}
                onChange={e => setClassId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select class...</option>
                {classes?.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
              <input
                type="text"
                value={externalId}
                onChange={e => setExternalId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="S2025-001"
              />
            </div>
          </div>
          <div className="flex items-center justify-end space-x-3 mt-4">
            {editingStudent && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {isSubmitting ? 'Saving...' : editingStudent ? 'Update Student' : 'Add Student'}
            </button>
          </div>
        </form>
      )}

      {/* Students Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Class</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Student ID</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Parents</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map(student => (
              <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{student.fullName}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    {student.className}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {student.externalId || '-'}
                </td>
                <td className="px-4 py-3">
                  {student.parentCount > 0 ? (
                    <span className="text-sm text-green-600">{student.parentCount} linked</span>
                  ) : (
                    <span className="text-sm text-gray-400">No parents</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end space-x-1">
                    <button
                      onClick={() => startEdit(student)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: student.id, name: student.fullName })}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                      disabled={student.parentCount > 0}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No students found. Add students above or import from CSV.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-gray-600">
              Showing {(page - 1) * pagination.limit + 1} to {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title="Delete Student?"
          message={`Are you sure you want to delete ${deleteConfirm.name}? This action cannot be undone.`}
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
