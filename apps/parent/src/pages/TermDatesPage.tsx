import React, { useMemo } from 'react'
import { useApi } from '@wasil/shared'
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { TermDate } from '@wasil/shared'

const DOT_COLORS: Record<string, string> = {
  purple: '#9333ea',
  blue: '#3b82f6',
  green: '#22c55e',
  burgundy: '#7f0029',
  orange: '#f97316',
  red: '#ef4444',
  amber: '#f59e0b',
  gray: '#6b7280',
}

export function TermDatesPage() {
  const theme = useTheme()
  const { user } = useAuth()
  const academicYear = user?.school?.academicYear || '2025/26'

  const { data: termDates, isLoading } = useApi<TermDate[]>(
    () => api.termDates.list(),
    []
  )

  // Group term dates by term
  const groupedByTerm = useMemo(() => {
    if (!termDates) return []

    const groups: Record<string, { termName: string; dates: TermDate[] }> = {}

    termDates.forEach((td) => {
      const key = `term-${td.term}`
      if (!groups[key]) {
        groups[key] = { termName: td.termName, dates: [] }
      }
      groups[key].dates.push(td)
    })

    // Sort dates within each group
    Object.values(groups).forEach((group) => {
      group.dates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    })

    // Return sorted by term number
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, group]) => group)
  }, [termDates])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }

  const formatDateRange = (startStr: string, endStr?: string) => {
    if (!endStr) return formatDate(startStr)

    const start = new Date(startStr)
    const end = new Date(endStr)

    const startFormatted = start.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

    const endFormatted = end.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

    return `${startFormatted} - ${endFormatted}`
  }

  const showDot = (type: string) => {
    // Show colored dot for all term date types
    return true
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-burgundy border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: theme.colors.brandColor }}>
          Term Dates {academicYear}
        </h1>
      </div>

      {/* Term Sections */}
      <div className="space-y-6">
        {groupedByTerm.map((group) => (
          <div
            key={group.termName}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            {/* Term Header */}
            <div
              className="px-4 py-3"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              <h2 className="text-white font-semibold">{group.termName}</h2>
            </div>

            {/* Term Dates */}
            <div className="divide-y divide-gray-100">
              {group.dates.map((td) => (
                <div
                  key={td.id}
                  className="px-4 py-4 flex items-start justify-between"
                >
                  <div className="flex items-start space-x-3">
                    {/* Colored Dot */}
                    {showDot(td.type) ? (
                      <div
                        className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: DOT_COLORS[td.color] || (td.color?.startsWith('#') ? td.color : DOT_COLORS.burgundy) }}
                      />
                    ) : (
                      <div className="w-3 flex-shrink-0" />
                    )}

                    {/* Label and Sublabel */}
                    <div>
                      <p
                        className="font-semibold"
                        style={{
                          color: showDot(td.type) ? (DOT_COLORS[td.color] || (td.color?.startsWith('#') ? td.color : '#111')) : '#111',
                        }}
                      >
                        {td.label}
                      </p>
                      {td.sublabel && (
                        <p className="text-sm text-gray-500 italic">{td.sublabel}</p>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <p className="text-gray-700 text-right whitespace-nowrap ml-4">
                    {formatDateRange(td.date, td.endDate || undefined)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
