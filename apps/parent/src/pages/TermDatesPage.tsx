import React, { useMemo, useState } from 'react'
import { CalendarPlus, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useApi } from '@wasil/shared'
import { useAuth } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { TermDate } from '@wasil/shared'

// Warm-toned dot colours that feel intentional, not random
const DOT_COLORS: Record<string, string> = {
  purple: '#8B6EAE',
  blue: '#5B8EC4',
  green: '#5BA97B',
  burgundy: '#C4506E',
  orange: '#E8785B',
  red: '#D14D4D',
  amber: '#E8A54B',
  gray: '#A8929A',
}

const DOT_BG_COLORS: Record<string, string> = {
  purple: '#F3EEFC',
  blue: '#EDF4FC',
  green: '#EDFAF2',
  burgundy: '#FFF0F3',
  orange: '#FFF4ED',
  red: '#FEF2F2',
  amber: '#FFF7EC',
  gray: '#FAF8F6',
}

export function TermDatesPage() {
  const { user } = useAuth()
  const academicYear = user?.school?.academicYear || '2025/26'

  const { data: termDates, isLoading } = useApi<TermDate[]>(
    () => api.termDates.list(),
    []
  )

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

    Object.values(groups).forEach((group) => {
      group.dates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    })

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, group]) => group)
  }, [termDates])

  // Find the next upcoming date for the countdown
  const nextDate = useMemo(() => {
    if (!termDates) return null
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const upcoming = termDates
      .filter(td => new Date(td.date) >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return upcoming[0] || null
  }, [termDates])

  const daysUntilNext = useMemo(() => {
    if (!nextDate) return null
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const target = new Date(nextDate.date)
    target.setHours(0, 0, 0, 0)
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }, [nextDate])

  // Check if a date is today
  const isToday = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }

  // Check if a date is in the past
  const isPast = (dateStr: string) => {
    const d = new Date(dateStr)
    d.setHours(23, 59, 59)
    return d < new Date()
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  const formatDateRange = (startStr: string, endStr?: string) => {
    if (!endStr) return formatDate(startStr)
    return `${formatDate(startStr)} – ${formatDate(endStr)}`
  }

  const getResolvedColor = (color: string) => {
    if (color?.startsWith('#')) return color
    return DOT_COLORS[color] || DOT_COLORS.burgundy
  }

  const getResolvedBg = (color: string) => {
    if (color?.startsWith('#')) return color + '18'
    return DOT_BG_COLORS[color] || DOT_BG_COLORS.burgundy
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="w-8 h-8 border-4 rounded-full animate-spin"
          style={{ borderColor: '#F0E4E6', borderTopColor: '#C4506E' }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
          Term Dates
        </h1>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm font-medium" style={{ color: '#7A6469' }}>
            Academic Year {academicYear}
          </p>
          <button
            onClick={() => api.termDates.exportCalendar()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
            style={{ backgroundColor: '#FFF0F3', color: '#C4506E' }}
            title="Add all term dates to your calendar"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            <span>Add to Calendar</span>
          </button>
        </div>
      </div>

      {/* Next up countdown card */}
      {nextDate && daysUntilNext !== null && (
        <div
          className="overflow-hidden"
          style={{
            borderRadius: '22px',
            background: 'linear-gradient(135deg, #C4506E, #E8785B)',
            padding: '22px 20px',
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 mb-1">
            Coming up
          </p>
          <h2 className="text-[20px] font-extrabold text-white leading-snug">
            {nextDate.label}
          </h2>
          <p className="text-sm font-semibold text-white/80 mt-1">
            {formatDateRange(nextDate.date, nextDate.endDate || undefined)}
          </p>
          <div
            className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-xl text-[13px] font-bold text-white"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            {daysUntilNext === 0
              ? 'Today'
              : daysUntilNext === 1
                ? 'Tomorrow'
                : `${daysUntilNext} days away`}
          </div>
        </div>
      )}

      {/* Term Sections */}
      {groupedByTerm.map((group) => (
        <div key={group.termName}>
          {/* Term label */}
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#A8929A' }}>
            {group.termName}
          </p>

          {/* Timeline card */}
          <div
            className="bg-white overflow-hidden"
            style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
          >
            {group.dates.map((td, idx) => {
              const dotColor = getResolvedColor(td.color)
              const dotBg = getResolvedBg(td.color)
              const past = isPast(td.date)
              const today = isToday(td.date)
              const isLast = idx === group.dates.length - 1

              return (
                <div
                  key={td.id}
                  style={{
                    borderBottom: isLast ? 'none' : '1px solid #F0E4E6',
                    opacity: past && !today ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-start gap-4 px-5 py-4">
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center flex-shrink-0 pt-1" style={{ width: '20px' }}>
                      {today ? (
                        <div className="relative">
                          <div
                            className="w-[14px] h-[14px] rounded-full"
                            style={{ backgroundColor: dotColor }}
                          />
                          <div
                            className="absolute -inset-[4px] rounded-full animate-ping"
                            style={{ backgroundColor: dotColor, opacity: 0.25 }}
                          />
                        </div>
                      ) : (
                        <div
                          className="w-[12px] h-[12px] rounded-full"
                          style={{ backgroundColor: past ? '#D8CDD0' : dotColor }}
                        />
                      )}
                      {!isLast && (
                        <div
                          className="flex-1 mt-1"
                          style={{
                            width: '2px',
                            minHeight: '20px',
                            backgroundColor: '#F0E4E6',
                            borderRadius: '1px',
                          }}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4
                            className="text-[15px] font-bold leading-snug"
                            style={{ color: today ? dotColor : (past ? '#A8929A' : '#2D2225') }}
                          >
                            {td.label}
                            {today && (
                              <span
                                className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                                style={{ backgroundColor: dotBg, color: dotColor }}
                              >
                                Today
                              </span>
                            )}
                          </h4>
                          {td.sublabel && (
                            <p className="text-[13px] font-medium mt-0.5" style={{ color: '#A8929A' }}>
                              {td.sublabel}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[13px] font-semibold whitespace-nowrap flex-shrink-0 pt-0.5"
                          style={{ color: past ? '#C9BCC0' : '#7A6469' }}
                        >
                          {formatDateRange(td.date, td.endDate || undefined)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {groupedByTerm.length === 0 && (
        <div
          className="bg-white p-12 text-center"
          style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
        >
          <p className="font-medium" style={{ color: '#A8929A' }}>No term dates published yet.</p>
        </div>
      )}

      {/* Next Academic Year (expandable) */}
      <NextYearSection />

      {/* Disclaimer */}
      {groupedByTerm.length > 0 && (
        <div className="flex items-start gap-2.5 px-1 py-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#A8929A' }} />
          <p className="text-[12px] leading-relaxed" style={{ color: '#A8929A' }}>
            These dates are based on the approved KHDA academic calendar. Public holidays are subject to official government announcement and may be updated. All dates are subject to change — the school will notify you of any amendments.
          </p>
        </div>
      )}
    </div>
  )
}

function NextYearSection() {
  const [expanded, setExpanded] = useState(false)

  // TODO: fetch next year's term dates from API when available
  // For now, show a placeholder that can be expanded
  const hasNextYearDates = false

  return (
    <div
      className="bg-white overflow-hidden"
      style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-[15px] font-bold" style={{ color: '#2D2225' }}>
            Next Academic Year
          </p>
          <p className="text-[13px] font-medium mt-0.5" style={{ color: '#A8929A' }}>
            {hasNextYearDates ? '2026/27 term dates available' : '2026/27 dates not yet published'}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="w-5 h-5 shrink-0" style={{ color: '#A8929A' }} />
          : <ChevronDown className="w-5 h-5 shrink-0" style={{ color: '#A8929A' }} />
        }
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-0" style={{ borderTop: '1px solid #F0E4E6' }}>
          {hasNextYearDates ? (
            // When dates are available, they will render here
            <p className="text-sm py-4" style={{ color: '#7A6469' }}>Term dates will appear here.</p>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm font-medium" style={{ color: '#A8929A' }}>
                Term dates for the next academic year will be published here once confirmed by the school.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
