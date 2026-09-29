import React, { useState } from 'react'
import { Lightbulb, UserX, Check, X, Eye } from 'lucide-react'
import { useApi, api, useToast, useTheme } from '@wasil/shared'
import type { SuggestionItem } from '@wasil/shared'

const STATUSES = [
  { key: 'NEW', label: 'New' },
  { key: 'READ', label: 'Read' },
  { key: 'ACTIONED', label: 'Actioned' },
  { key: 'DECLINED', label: 'Declined' },
] as const

/**
 * What parents have suggested.
 *
 * ADMIN ONLY. A suggestion may name a member of staff despite the notice
 * asking that it does not, and a smaller readership is the only version of
 * this the school can describe honestly to a parent.
 *
 * AN ANONYMOUS SUGGESTION HAS NO AUTHOR TO REVEAL — not hidden here, absent
 * from the database. There is no id behind the blank, so there is nothing a
 * future screen could be asked to show. The page says so plainly rather than
 * leaving a gap that looks like missing data.
 */
export function SuggestionsPage() {
  const theme = useTheme()
  const toast = useToast()
  const [filter, setFilter] = useState<string>('NEW')
  const { data: suggestions, refetch } = useApi<SuggestionItem[]>(
    () => api.suggestions.list(filter || undefined),
    [filter],
  )
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  const move = async (id: string, status: string) => {
    try {
      await api.suggestions.update(id, { status })
      await refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update')
    }
  }

  const saveNote = async (id: string) => {
    try {
      await api.suggestions.update(id, { adminNote: noteText })
      setNoteFor(null)
      setNoteText('')
      await refetch()
      toast.success('Note saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the note')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="h-5 w-5" style={{ color: theme.colors.brandColor }} />
        <h1 className="text-2xl font-bold">Suggestion Box</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Ideas from parents and carers. Only admins can see this page.
      </p>

      <div className="flex gap-1.5 mb-5">
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{
              backgroundColor: filter === s.key ? theme.colors.brandColor : '#F3F4F6',
              color: filter === s.key ? 'white' : '#4B5563',
            }}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setFilter('')}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold"
          style={{
            backgroundColor: filter === '' ? theme.colors.brandColor : '#F3F4F6',
            color: filter === '' ? 'white' : '#4B5563',
          }}
        >
          All
        </button>
      </div>

      {(!suggestions || suggestions.length === 0) && (
        <div className="text-center py-12 text-gray-500">
          <Lightbulb className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nothing here.</p>
        </div>
      )}

      <div className="space-y-3">
        {(suggestions || []).map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {s.fromName ? (
                  <span className="text-sm font-semibold text-gray-800">{s.fromName}</span>
                ) : (
                  // Said plainly. A blank where a name goes reads as missing
                  // data, and somebody will eventually ask us to "fix" it.
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500">
                    <UserX className="h-3.5 w-3.5" />
                    Anonymous
                  </span>
                )}
                {s.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {s.category}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(s.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{s.status.toLowerCase()}</span>
            </div>

            <p className="text-sm text-gray-800 whitespace-pre-wrap">{s.body}</p>

            {!s.canReply && (
              <p className="text-xs text-gray-400 mt-2">
                Sent anonymously — there is no account behind this, so it cannot be replied to.
              </p>
            )}

            {s.adminNote && (
              <p className="text-xs text-gray-600 mt-2 p-2 rounded-lg bg-gray-50">
                <strong>Note:</strong> {s.adminNote}
                {s.handledByName && <span className="text-gray-400"> — {s.handledByName}</span>}
              </p>
            )}

            {noteFor === s.id ? (
              <div className="mt-3">
                <input
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  autoFocus
                  placeholder="For the school's own record — the parent never sees this"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => saveNote(s.id)}
                    className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  >
                    Save note
                  </button>
                  <button
                    onClick={() => { setNoteFor(null); setNoteText('') }}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {s.status === 'NEW' && (
                  <button onClick={() => move(s.id, 'READ')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700">
                    <Eye className="h-3 w-3" /> Mark read
                  </button>
                )}
                {s.status !== 'ACTIONED' && (
                  <button onClick={() => move(s.id, 'ACTIONED')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: '#E8F5EC', color: '#2D8B4E' }}>
                    <Check className="h-3 w-3" /> Actioned
                  </button>
                )}
                {s.status !== 'DECLINED' && (
                  <button onClick={() => move(s.id, 'DECLINED')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: '#FFF0F0', color: '#D14D4D' }}>
                    <X className="h-3 w-3" /> Not taking forward
                  </button>
                )}
                <button
                  onClick={() => { setNoteFor(s.id); setNoteText(s.adminNote || '') }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500"
                >
                  {s.adminNote ? 'Edit note' : 'Add a note'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
