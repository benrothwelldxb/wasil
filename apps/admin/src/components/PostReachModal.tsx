import React, { useEffect, useState } from 'react'
import { X, RefreshCw } from 'lucide-react'
import { api, useTheme } from '@wasil/shared'
import type { PostReach, PostReachParent } from '@wasil/shared'

/**
 * Who has seen a post. Headlined in CHILDREN — the roll is the number a school
 * can check — with the parent figure beside it, since most children have two
 * linked adults and a per-parent count reads as nearly double the class.
 *
 * Opens on "Not seen" because that is the list someone acts on: the families
 * to chase.
 */
type Tab = 'notSeen' | 'seen' | 'noParent'

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function ParentLine({ parent }: { parent: PostReachParent }) {
  const when = parent.seenAt ?? parent.acknowledgedAt
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{parent.name}</span>
      <span className={when ? 'text-emerald-700' : 'text-slate-400'}>
        {when ? `Seen ${formatWhen(when)}${parent.acknowledgedAt ? ' · acknowledged' : ''}` : 'Not seen'}
      </span>
    </div>
  )
}

export function PostReachModal({ messageId, title, createdAt, onClose }: {
  messageId: string
  title: string
  createdAt: string
  onClose: () => void
}) {
  const theme = useTheme()
  const [reach, setReach] = useState<PostReach | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('notSeen')

  useEffect(() => {
    let cancelled = false
    api.messages.reach(messageId)
      .then(r => { if (!cancelled) setReach(r) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
    return () => { cancelled = true }
  }, [messageId])

  // A post that went out before tracking began: its "not seen" means "not
  // known", and must not read as a list of families who ignored it.
  const predatesTracking = !!reach && (!reach.trackingSince || new Date(createdAt) < new Date(reach.trackingSince))

  const reachable = reach ? reach.rows.filter(r => r.parents.length > 0) : []
  const lists: Record<Tab, PostReach['rows']> = {
    notSeen: reachable.filter(r => !r.seen),
    seen: reachable.filter(r => r.seen),
    noParent: reach ? reach.rows.filter(r => r.parents.length === 0) : [],
  }
  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'notSeen', label: 'Not seen' },
    { key: 'seen', label: 'Seen' },
    { key: 'noParent', label: 'No parent on Connect' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">Who's seen it</h3>
            <p className="text-sm text-slate-500 mt-0.5 truncate">{title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !reach ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
            </div>
          ) : reach.scheduled ? (
            <p className="text-sm text-slate-500">This post is scheduled and hasn't gone out yet.</p>
          ) : (
            <>
              {reach.audienceKnown && (
                <div className="mb-4">
                  <p className="text-2xl font-semibold text-slate-900">
                    {reach.children.seen} of {reach.children.total - reach.children.noParentOnConnect} children
                  </p>
                  <p className="text-sm text-slate-500">
                    have a parent who has seen this · {reach.parents.seen} of {reach.parents.total} parents
                  </p>
                </div>
              )}

              {predatesTracking && (
                <p className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2 mb-4">
                  This post went out before Connect started recording who has seen posts
                  {reach.trackingSince ? ` (${new Date(reach.trackingSince).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})` : ''}.
                  Only acknowledgements and later views are shown, so "not seen" may not be accurate.
                </p>
              )}

              {reach.audienceKnown ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {TABS.map(t => (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold border"
                        style={tab === t.key
                          ? { backgroundColor: theme.colors.brandColor, color: '#FFFFFF', borderColor: theme.colors.brandColor }
                          : { backgroundColor: '#FFFFFF', color: '#64748B', borderColor: '#E2E8F0' }}
                      >
                        {t.label}<span className="ml-1.5 opacity-70">{lists[t.key].length}</span>
                      </button>
                    ))}
                  </div>
                  {lists[tab].length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">Nobody here.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {lists[tab].map(row => (
                        <div key={row.studentId} className="py-2.5">
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm font-medium text-slate-900">{row.name}</span>
                            <span className="text-xs text-slate-400">{row.className}</span>
                          </div>
                          {row.parents.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {row.parents.map(p => <ParentLine key={p.id} parent={p} />)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500 mb-3">
                  This post's audience can't be matched to a class list, so only the parents who have seen it are shown.
                </p>
              )}

              {reach.otherViewers.length > 0 && (
                <div className="mt-5">
                  <h4 className="text-xs font-semibold text-slate-500 mb-1">
                    {reach.audienceKnown ? 'Also seen by (no child in this audience now)' : 'Seen by'}
                  </h4>
                  <div className="space-y-0.5">
                    {reach.otherViewers.map(p => <ParentLine key={p.id} parent={p} />)}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 mt-5">
                "Seen" means the post was on the parent's screen in the Connect app, or they acknowledged it.
                It can't tell whether they read it, and parents who only got the email aren't counted.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
