import React, { useState } from 'react'
import { useApi, useAuth } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { StudentIep } from '@wasil/shared'
import { ChevronDown, ChevronUp, Target, User, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: '#EDF4FC', text: '#5B8EC4', label: 'Active' },
  COMPLETED: { bg: '#EDFAF2', text: '#2D8B4E', label: 'Completed' },
  ARCHIVED: { bg: '#F0E4E6', text: '#7A6469', label: 'Archived' },
}

const TARGET_STATUS_STYLES: Record<string, { color: string; icon: React.ElementType }> = {
  'Not Started': { color: '#A8929A', icon: Clock },
  'In Progress': { color: '#5B8EC4', icon: AlertCircle },
  'Achieved': { color: '#2D8B4E', icon: CheckCircle },
}

export function InclusionPage() {
  const { user } = useAuth()
  const { data: ieps, isLoading } = useApi<StudentIep[]>(
    () => api.inclusion.myChildrenIeps(),
    []
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Group by student
  const groupedByStudent = (ieps || []).reduce((acc, iep) => {
    const key = iep.studentId
    if (!acc[key]) acc[key] = { studentName: iep.studentName, className: iep.className, ieps: [] }
    acc[key].ieps.push(iep)
    return acc
  }, {} as Record<string, { studentName: string; className: string; ieps: StudentIep[] }>)

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>Inclusion</h1>
          <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>Individual Education Plans</p>
        </div>
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: '#F0E4E6', borderTopColor: '#C4506E' }} />
        </div>
      </div>
    )
  }

  if (!ieps || ieps.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>Inclusion</h1>
          <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>Individual Education Plans</p>
        </div>
        <div className="bg-white rounded-[22px] p-12 text-center" style={{ border: '1.5px solid #F0E4E6' }}>
          <Target className="w-12 h-12 mx-auto mb-4" style={{ color: '#D8CDD0' }} />
          <p className="font-medium" style={{ color: '#A8929A' }}>No IEPs available</p>
          <p className="text-sm mt-1" style={{ color: '#C9BCC0' }}>Individual Education Plans will appear here when shared by the school</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>Inclusion</h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>Individual Education Plans for your children</p>
      </div>

      {Object.entries(groupedByStudent).map(([studentId, group]) => (
        <div key={studentId}>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: '#C4506E' }}
            >
              {group.studentName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: '#2D2225' }}>{group.studentName}</p>
              <p className="text-xs" style={{ color: '#A8929A' }}>{group.className}</p>
            </div>
          </div>

          <div className="space-y-3">
            {group.ieps.map(iep => {
              const isExpanded = expandedId === iep.id
              const statusStyle = STATUS_STYLES[iep.status] || STATUS_STYLES.ACTIVE
              const targets = (iep.targets || []) as Array<{ area: string; target: string; strategies: string; progress?: string; status?: string }>

              return (
                <div
                  key={iep.id}
                  className="bg-white rounded-[22px] overflow-hidden"
                  style={{ border: '1.5px solid #F0E4E6' }}
                >
                  {/* Header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : iep.id)}
                    className="w-full text-left px-5 py-4 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-bold" style={{ color: '#2D2225' }}>{iep.title}</h3>
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                        >
                          {statusStyle.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: '#A8929A' }}>
                        {iep.keyWorker && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />{iep.keyWorker}
                          </span>
                        )}
                        {iep.reviewDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />Review: {iep.reviewDate}
                          </span>
                        )}
                      </div>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-5 h-5 shrink-0" style={{ color: '#A8929A' }} />
                      : <ChevronDown className="w-5 h-5 shrink-0" style={{ color: '#A8929A' }} />
                    }
                  </button>

                  {/* Targets (expanded) */}
                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-3" style={{ borderTop: '1px solid #F0E4E6' }}>
                      {targets.map((target, idx) => {
                        const tStatus = TARGET_STATUS_STYLES[target.status || 'Not Started'] || TARGET_STATUS_STYLES['Not Started']
                        const TIcon = tStatus.icon

                        return (
                          <div
                            key={idx}
                            className="rounded-[16px] p-4 mt-3"
                            style={{ backgroundColor: '#FFF8F4', border: '1px solid #F5EEF0' }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span
                                  className="text-[10px] font-bold uppercase tracking-wider"
                                  style={{ color: '#C4506E' }}
                                >
                                  {target.area}
                                </span>
                                <p className="text-sm font-semibold mt-0.5" style={{ color: '#2D2225' }}>
                                  {target.target}
                                </p>
                              </div>
                              <span
                                className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0"
                                style={{ backgroundColor: tStatus.color + '15', color: tStatus.color }}
                              >
                                <TIcon className="w-3 h-3" />
                                {target.status || 'Not Started'}
                              </span>
                            </div>
                            {target.strategies && (
                              <div className="mt-2">
                                <p className="text-[11px] font-bold uppercase" style={{ color: '#A8929A' }}>Strategies</p>
                                <p className="text-sm mt-0.5" style={{ color: '#7A6469' }}>{target.strategies}</p>
                              </div>
                            )}
                            {target.progress && (
                              <div className="mt-2">
                                <p className="text-[11px] font-bold uppercase" style={{ color: '#A8929A' }}>Progress</p>
                                <p className="text-sm mt-0.5" style={{ color: '#7A6469' }}>{target.progress}</p>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {iep.notes && (
                        <div className="mt-2">
                          <p className="text-[11px] font-bold uppercase" style={{ color: '#A8929A' }}>Notes</p>
                          <p className="text-sm mt-0.5" style={{ color: '#7A6469' }}>{iep.notes}</p>
                        </div>
                      )}

                      <p className="text-[11px] text-right" style={{ color: '#C9BCC0' }}>
                        Last updated: {new Date(iep.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
