import React from 'react'
import { BookOpen } from 'lucide-react'
import { useApi, api } from '@wasil/shared'
import type { ClassWithDetails } from '@wasil/shared'
import { HubSyncBanner } from '../components/HubSyncBanner'
import { HubChip } from '../components/HubChip'

const CLASS_COLOR_PRESETS = [
  { bg: 'bg-gray-600', hex: '#4B5563' },
  { bg: 'bg-blue-600', hex: '#2563EB' },
  { bg: 'bg-red-600', hex: '#DC2626' },
  { bg: 'bg-green-600', hex: '#16A34A' },
  { bg: 'bg-purple-600', hex: '#9333EA' },
  { bg: 'bg-amber-500', hex: '#F59E0B' },
  { bg: 'bg-teal-600', hex: '#0D9488' },
  { bg: 'bg-pink-600', hex: '#DB2777' },
  { bg: 'bg-orange-600', hex: '#EA580C' },
  { bg: 'bg-indigo-600', hex: '#4F46E5' },
]

export function ClassesPage() {
  const { data: classesDetailed, refetch: refetchClasses } = useApi<ClassWithDetails[]>(() => api.classes.listAll(), [])

  return (
    <div>
      <HubSyncBanner noun="Classes" onSynced={refetchClasses} />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Classes</h2>
      </div>

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
                  {cls.fromHub && <HubChip />}
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
                </div>
              </div>
            </div>
          )
        })}
        {(!classesDetailed || classesDetailed.length === 0) && (
          <div className="text-center py-12 text-gray-500">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No classes yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
