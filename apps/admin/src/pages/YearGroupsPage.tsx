import React from 'react'
import { GraduationCap } from 'lucide-react'
import { useApi, api } from '@wasil/shared'
import type { YearGroup } from '@wasil/shared'
import { HubSyncBanner } from '../components/HubSyncBanner'
import { HubChip } from '../components/HubChip'

export function YearGroupsPage() {
  const { data: yearGroups, refetch } = useApi<YearGroup[]>(() => api.yearGroups.list(), [])

  const sorted = [...(yearGroups || [])].sort((a, b) => a.order - b.order)

  return (
    <div>
      <HubSyncBanner noun="Year groups" onSynced={refetch} />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Year Groups</h2>
      </div>

      {/* Read-only list */}
      <div className="space-y-2">
        {sorted.map((group) => (
          <div
            key={group.id}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-5 h-5 text-slate-400" />
                <span className="font-semibold text-slate-900">{group.name}</span>
                {group.fromHub && <HubChip />}
                {group.classCount !== undefined && (
                  <span className="text-sm text-slate-500">
                    {group.classCount} class{group.classCount !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {yearGroups && yearGroups.length === 0 && (
          <p className="text-center text-slate-400 py-8">No year groups yet.</p>
        )}
      </div>
    </div>
  )
}
