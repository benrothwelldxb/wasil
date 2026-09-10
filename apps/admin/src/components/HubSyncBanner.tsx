import React, { useEffect, useState } from 'react'
import { Cloud, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { api, useToast } from '@wasil/shared'
import type { HubSyncSummary } from '@wasil/shared'

interface HubSyncBannerProps {
  /** What this page's rows are, e.g. "Pupils", "Classes". Used in the sub-line. */
  noun: string
  /** Called after a successful sync so the page can refetch its list. */
  onSynced?: () => void
}

function summarizeSync(summary: HubSyncSummary): string {
  const parts: string[] = []
  if (summary.pupils) parts.push(`${summary.pupils} pupil${summary.pupils !== 1 ? 's' : ''}`)
  if (summary.classes) parts.push(`${summary.classes} class${summary.classes !== 1 ? 'es' : ''}`)
  if (summary.teacherAssignments.created) {
    parts.push(`${summary.teacherAssignments.created} teacher assignment${summary.teacherAssignments.created !== 1 ? 's' : ''}`)
  }
  // Leavers, said out loud. A pupil coming OFF the roster is the one change a
  // school will not otherwise see happen — nothing on any page announces it,
  // and it silently moves every count on the analytics page.
  const lv = summary.leavers
  if (lv?.marked) parts.push(`${lv.marked} pupil${lv.marked !== 1 ? 's' : ''} marked as left`)
  if (lv?.returned) parts.push(`${lv.returned} back on roll`)
  if (summary.staff.created) parts.push(`${summary.staff.created} staff added`)
  if (summary.staff.updated) parts.push(`${summary.staff.updated} staff updated`)

  // Parents, spelled out — `fetched` is what Hub sent, and the breakdown says
  // where any shortfall went. Without this the Parents page count could sit
  // below Hub's roster with nothing on screen explaining why: a guardian Hub
  // holds no email for can't become a Connect login (User.email is required and
  // unique), and one whose email already belongs to a staff account is linked
  // onto it rather than added as a parent.
  const g = summary.guardians
  if (g?.fetched) {
    const detail: string[] = []
    if (g.created) detail.push(`${g.created} added`)
    if (g.linked) detail.push(`${g.linked} linked to existing`)
    if (g.skippedNoEmail) detail.push(`${g.skippedNoEmail} skipped, no email`)
    parts.push(`${g.fetched} parent${g.fetched !== 1 ? 's' : ''} from Hub${detail.length ? ` (${detail.join(', ')})` : ''}`)
  }

  // ILSAs: only when something is wrong.
  //
  // What used to be here — who Hub sent, their ids, the repairs, the counts of
  // each skip reason, the line confirming everyone can message — was
  // scaffolding for a bug that is now fixed, and it had grown into a toast too
  // long to read. An unread toast is its own kind of silence, which is the
  // thing all of it was fighting.
  //
  // What stays is the alarm, and nothing else: a sync that threw, an ILSA who
  // cannot message, and a link to the wrong child. Each is silent when healthy,
  // so a school with working ILSAs now sees no ILSA text at all. The checks
  // themselves are untouched — the server still runs every one of them; this
  // only decides what is worth interrupting an admin about.
  const il = summary.ilsas
  if (il?.failed) {
    parts.push(`ILSA sync failed — ${il.error ?? 'see server logs'}`)
  } else if (il) {
    const count = (n: number) => `${n} ILSA${n !== 1 ? 's' : ''}`
    // Above the rest: a crossed link is a private thread about the wrong
    // family, and it looks healthy from every other angle.
    if (il.wrongPupil?.length) {
      parts.push(
        `${count(il.wrongPupil.length)} LINKED TO THE WRONG CHILD: ` +
          il.wrongPupil.map(w => w.email).join(', '),
      )
    }
    // The outcome-level check: provisioned, counted as linked, and still unable
    // to resolve to a messaging actor. It subsumes the per-step skip counters
    // that used to be listed one by one.
    if (il.unresolvable?.length) {
      parts.push(
        `${count(il.unresolvable.length)} cannot message: ` +
          il.unresolvable.map(u => `${u.email} — ${u.why}`).join('; '),
      )
    }
    // Not covered by that check, which can only verify an ILSA Hub gave an id
    // for. Named, because an unnamed one can't be checked against a staff list.
    if (il.withoutHubUserId) {
      const who = il.withoutHubUserIdEmails?.length ? `: ${il.withoutHubUserIdEmails.join(', ')}` : ''
      parts.push(`${count(il.withoutHubUserId)} cannot message — not signed into Hub yet${who}`)
    }
  }

  if (parts.length === 0) return 'Synced from Hub — no changes'
  return `Synced from Hub — ${parts.join(', ')}`
}

/**
 * Slim, calm informational banner shown at the top of Hub-sourced roster
 * pages (Pupils, Classes, Year groups, Parents, Staff). Explains provenance,
 * shows the last-synced time, and offers a manual "Sync now" trigger.
 */
export function HubSyncBanner({ noun, onSynced }: HubSyncBannerProps) {
  const toast = useToast()
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.hub.syncStatus()
      .then(res => {
        if (!cancelled) setLastSyncedAt(res.lastSyncedAt)
      })
      .catch(() => { /* leave as "never" if the status check fails */ })
      .finally(() => {
        if (!cancelled) setIsLoadingStatus(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const result = await api.hub.sync()
      setLastSyncedAt(result.lastSyncedAt)
      toast.success(summarizeSync(result.summary))
      onSynced?.()
    } catch (error) {
      toast.error(`Hub sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const lastSyncedLabel = isLoadingStatus
    ? 'Checking last sync…'
    : lastSyncedAt
      ? `Last synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}`
      : 'Last synced: never'

  return (
    <div className="flex items-center justify-between gap-4 mb-6 px-4 py-3 rounded-lg border border-indigo-100 bg-indigo-50/60">
      <div className="flex items-start gap-3">
        <Cloud className="h-5 w-5 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-indigo-900">Synced directly from Wasil Hub</p>
          <p className="text-xs text-indigo-700 mt-0.5">
            {noun} are managed in Hub and mirrored here. Changes are made in Hub.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-indigo-600 whitespace-nowrap">{lastSyncedLabel}</span>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
    </div>
  )
}
