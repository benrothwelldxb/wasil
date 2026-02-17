import React, { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme, api } from '@wasil/shared'
import type { AuditLog, AuditAction, AuditResourceType, AuditLogListResponse } from '@wasil/shared'

const ACTION_OPTIONS: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE']

const RESOURCE_TYPE_OPTIONS: AuditResourceType[] = [
  'MESSAGE', 'SURVEY', 'EVENT', 'WEEKLY_MESSAGE', 'TERM_DATE',
  'PULSE_SURVEY', 'YEAR_GROUP', 'CLASS', 'STAFF', 'POLICY',
  'FILE', 'FOLDER', 'SCHEDULE_ITEM', 'KNOWLEDGE_CATEGORY',
  'KNOWLEDGE_ARTICLE', 'SCHOOL',
]

const ACTION_COLORS: Record<AuditAction, { bg: string; text: string }> = {
  CREATE: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  UPDATE: { bg: 'bg-blue-100', text: 'text-blue-700' },
  DELETE: { bg: 'bg-red-100', text: 'text-red-700' },
}

function formatResourceType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '—'
  const parts: string[] = []
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'action') {
      parts.push(String(value))
    } else if (value !== null && value !== undefined) {
      parts.push(`${key}: ${String(value)}`)
    }
  }
  return parts.join(', ') || '—'
}

export function AuditLogPage() {
  const theme = useTheme()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [filterAction, setFilterAction] = useState('')
  const [filterResourceType, setFilterResourceType] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  const fetchLogs = useCallback(async (page = 1) => {
    setIsLoading(true)
    try {
      const params: Record<string, string | number> = { page, limit: 50 }
      if (filterAction) params.action = filterAction
      if (filterResourceType) params.resourceType = filterResourceType
      if (filterStartDate) params.startDate = filterStartDate
      if (filterEndDate) params.endDate = filterEndDate

      const result = await api.auditLogs.list(params as any)
      setLogs(result.logs)
      setPagination(result.pagination)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [filterAction, filterResourceType, filterStartDate, filterEndDate])

  useEffect(() => {
    fetchLogs(1)
  }, [fetchLogs])

  const handleClearFilters = () => {
    setFilterAction('')
    setFilterResourceType('')
    setFilterStartDate('')
    setFilterEndDate('')
  }

  const hasActiveFilters = filterAction || filterResourceType || filterStartDate || filterEndDate

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">Track all admin actions across your school</p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-slate-200">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span>
            Filters
            {hasActiveFilters && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Active</span>
            )}
          </span>
          {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {filtersOpen && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                >
                  <option value="">All</option>
                  {ACTION_OPTIONS.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Resource Type</label>
                <select
                  value={filterResourceType}
                  onChange={(e) => setFilterResourceType(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                >
                  <option value="">All</option>
                  {RESOURCE_TYPE_OPTIONS.map(rt => (
                    <option key={rt} value={rt}>{formatResourceType(rt)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="mt-3 text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">User</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Action</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Resource Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Details</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">No audit logs found</td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{log.userName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action].bg} ${ACTION_COLORS[log.action].text}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatResourceType(log.resourceType)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                      {formatMetadata(log.metadata)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{log.ipAddress || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
