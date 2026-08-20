import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Upload, Users, Search, Trash2, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { useTheme, useApi, api, useToast } from '@wasil/shared'
import type { Class, ReportUploadResult } from '@wasil/shared'
import { HubSyncBanner } from '../components/HubSyncBanner'
import { HubChip } from '../components/HubChip'

interface BulkImportResult {
  created: number
  skipped: number
  errors?: string[]
}

export function StudentsPage() {
  const theme = useTheme()
  const toast = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data: studentsData, refetch: refetchStudents } = useApi(
    () => api.students.list({ search: searchQuery, classId: classFilter || undefined, page, limit: 50 }),
    [searchQuery, classFilter, page]
  )
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])

  // Report card upload (Connect-owned; the only remaining mutation on this page)
  const [showReportUpload, setShowReportUpload] = useState(false)
  const [reportFiles, setReportFiles] = useState<File[]>([])
  const [reportPeriod, setReportPeriod] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [isUploadingReports, setIsUploadingReports] = useState(false)
  const [reportResult, setReportResult] = useState<ReportUploadResult | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const reportFileInputRef = useRef<HTMLInputElement>(null)
  const [existingReports, setExistingReports] = useState<any[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)

  // Load existing reports when panel opens
  useEffect(() => {
    if (showReportUpload) {
      setLoadingReports(true)
      api.students.allReports()
        .then(setExistingReports)
        .catch(() => setExistingReports([]))
        .finally(() => setLoadingReports(false))
    }
  }, [showReportUpload])

  const handleReportUpload = async () => {
    if (reportFiles.length === 0) return
    setIsUploadingReports(true)
    try {
      const result = await api.students.uploadReports(reportFiles, reportPeriod || undefined, academicYear || undefined)
      setReportResult(result)
      if (result.matched > 0) {
        toast.success(`${result.matched} report${result.matched !== 1 ? 's' : ''} matched and uploaded`)
      }
      if (result.unmatched > 0) {
        toast.warning(`${result.unmatched} file${result.unmatched !== 1 ? 's' : ''} could not be matched`)
      }
      setReportFiles([])
      api.students.allReports().then(setExistingReports).catch(() => {})
    } catch (error) {
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploadingReports(false)
    }
  }

  const handleReportFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    if (droppedFiles.length === 0) {
      toast.warning('Only PDF files are accepted')
      return
    }
    setReportFiles(prev => [...prev, ...droppedFiles])
  }, [toast])

  const handleReportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).filter(f => f.type === 'application/pdf')
      setReportFiles(prev => [...prev, ...selected])
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    setDeletingReportId(reportId)
    try {
      await api.students.deleteReport(reportId)
      setExistingReports(prev => prev.filter(r => r.id !== reportId))
      toast.success('Report deleted')
    } catch {
      toast.error('Failed to delete report')
    } finally {
      setDeletingReportId(null)
    }
  }

  const students = studentsData?.students || []
  const pagination = studentsData?.pagination

  return (
    <div>
      <HubSyncBanner noun="Pupils" onSynced={refetchStudents} />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Students</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setShowReportUpload(!showReportUpload); setReportResult(null) }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg border ${showReportUpload ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            <FileText className="h-4 w-4" />
            <span>Upload Report Cards</span>
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

      {/* Report Card Upload Panel */}
      {showReportUpload && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <FileText className="h-5 w-5" style={{ color: theme.colors.brandColor }} />
                Upload Report Cards
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Name PDF files with the student's UPN/ID (e.g., A123456789.pdf). Files will be automatically matched to students.
              </p>
            </div>
          </div>

          {/* File drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true) }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleReportFileDrop}
            onClick={() => reportFileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDraggingOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">
              Drop PDF files here or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Multiple PDFs accepted
            </p>
            <input
              ref={reportFileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleReportFileSelect}
            />
          </div>

          {/* Selected files list */}
          {reportFiles.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium text-gray-700">{reportFiles.length} file{reportFiles.length !== 1 ? 's' : ''} selected</p>
              <div className="flex flex-wrap gap-2">
                {reportFiles.map((file, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full px-3 py-1 text-gray-600">
                    <FileText className="h-3 w-3" />
                    {file.name}
                    <button
                      onClick={(e) => { e.stopPropagation(); setReportFiles(prev => prev.filter((_, idx) => idx !== i)) }}
                      className="ml-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Period (optional)</label>
              <input
                type="text"
                value={reportPeriod}
                onChange={e => setReportPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Term 2 2025-26"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year (optional)</label>
              <input
                type="text"
                value={academicYear}
                onChange={e => setAcademicYear(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 2025-26"
              />
            </div>
          </div>

          {/* Upload button */}
          <div className="flex justify-end">
            <button
              onClick={handleReportUpload}
              disabled={isUploadingReports || reportFiles.length === 0}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              <Upload className="h-4 w-4" />
              <span>{isUploadingReports ? 'Uploading...' : 'Upload Report Cards'}</span>
            </button>
          </div>

          {/* Upload results */}
          {reportResult && (
            <div className="space-y-3">
              {reportResult.matched > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-green-800">
                    {reportResult.matched} report{reportResult.matched !== 1 ? 's' : ''} matched and uploaded
                  </span>
                </div>
              )}
              {reportResult.unmatched > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-amber-800">
                      {reportResult.unmatched} file{reportResult.unmatched !== 1 ? 's' : ''} could not be matched
                    </span>
                  </div>
                  <ul className="mt-2 ml-7 text-sm text-amber-700 space-y-0.5">
                    {reportResult.unmatchedFiles.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {reportResult.reports.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-gray-700">Student Name</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-700">Filename</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportResult.reports.map((m, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="px-4 py-2 text-gray-900">{m.studentName}</td>
                          <td className="px-4 py-2 text-gray-500">{m.fileName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Existing Reports */}
          <div className="border-t border-slate-200 pt-4 mt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              Uploaded Reports ({existingReports.length})
            </h4>
            {loadingReports ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : existingReports.length === 0 ? (
              <p className="text-sm text-slate-400">No reports uploaded yet.</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">Student</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">Class</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">File</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">Period</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">Uploaded</th>
                      <th className="px-3 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingReports.map(report => (
                      <tr key={report.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{report.studentName}</td>
                        <td className="px-3 py-2 text-gray-500">{report.className}</td>
                        <td className="px-3 py-2">
                          <a href={report.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block max-w-[200px]">
                            {report.fileName}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{report.reportPeriod || report.academicYear || '-'}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{new Date(report.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleDeleteReport(report.id)}
                            disabled={deletingReportId === report.id}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                            title="Delete report"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Students Table (read-only — sourced from Hub) */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Class</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Student ID</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Parents</th>
            </tr>
          </thead>
          <tbody>
            {students.map(student => (
              <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{student.fullName}</span>
                    {student.fromHub && <HubChip />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const cls = classes?.find(c => c.name === student.className)
                    const COLOR_MAP: Record<string, { bg: string; text: string }> = {
                      'bg-blue-600': { bg: '#DBEAFE', text: '#1E40AF' },
                      'bg-blue-500': { bg: '#DBEAFE', text: '#1D4ED8' },
                      'bg-red-600': { bg: '#FEE2E2', text: '#991B1B' },
                      'bg-green-600': { bg: '#DCFCE7', text: '#166534' },
                      'bg-purple-600': { bg: '#F3E8FF', text: '#6B21A8' },
                      'bg-amber-500': { bg: '#FEF3C7', text: '#92400E' },
                      'bg-teal-600': { bg: '#CCFBF1', text: '#115E59' },
                      'bg-pink-600': { bg: '#FCE7F3', text: '#9D174D' },
                      'bg-orange-600': { bg: '#FFEDD5', text: '#9A3412' },
                      'bg-indigo-600': { bg: '#E0E7FF', text: '#3730A3' },
                      'bg-gray-600': { bg: '#F3F4F6', text: '#374151' },
                      'bg-yellow-500': { bg: '#FEF9C3', text: '#854D0E' },
                    }
                    const colors = cls ? (COLOR_MAP[cls.colorBg] || { bg: '#F3F4F6', text: '#374151' }) : { bg: '#DBEAFE', text: '#1E40AF' }
                    return (
                      <span
                        className="text-sm px-2.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        {student.className}
                      </span>
                    )
                  })()}
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
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No students found.</p>
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
    </div>
  )
}
