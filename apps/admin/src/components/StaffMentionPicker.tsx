import React, { useMemo, useState } from 'react'
import { X, Search, AtSign } from 'lucide-react'
import { useApi, api } from '@wasil/shared'
import type { StaffMember } from '@wasil/shared'

/**
 * Pick a member of staff to tag in an announcement.
 *
 * Tagging someone points every parent who reads the update at them, so the
 * choice is made from the real staff list rather than typed — a typed "@rob"
 * would be a name that resolves to nobody, and the parent would find that out
 * by tapping it.
 */
export function StaffMentionPicker({
  onSelect,
  onClose,
}: {
  onSelect: (staff: StaffMember) => void
  onClose: () => void
}) {
  const { data: staff, isLoading } = useApi<StaffMember[]>(() => api.staff.list(), [])
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    // Never offer somebody who has left. A mention is an instruction to a
    // parent to go and message that person, so a stale name here becomes a
    // message nobody will ever read.
    const all = (staff || []).filter(s => !s.leftAt)
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      s =>
        s.name?.toLowerCase().includes(q) ||
        s.position?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q)
    )
  }, [staff, query])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <AtSign className="w-4 h-4 text-slate-500" />
            Tag a staff member
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or role"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Parents who tap the tag will start a message to this person, and they'll be told
            they've been tagged.
          </p>
        </div>

        <div className="overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-6 text-sm text-slate-500">Loading staff…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No staff match “{query}”.</p>
          ) : (
            results.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-b-0"
              >
                {s.avatarUrl ? (
                  <img src={s.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                    {s.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 truncate">{s.position || s.role}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
