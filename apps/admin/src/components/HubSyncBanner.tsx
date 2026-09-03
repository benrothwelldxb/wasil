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

  // ILSAs, spelled out the same way and for the same reason. An ILSA with no
  // IlsaLink resolves to no messaging actor at all, so a shortfall here is the
  // difference between an assistant who can message their pupil's parent and
  // one who is told they have nobody to message.
  const il = summary.ilsas
  // A crash first, and loudly. Reporting it as "no ILSAs" is how this went
  // unnoticed: the sync threw on every record and the toast said nothing.
  if (il?.failed) {
    parts.push(`ILSA sync failed — ${il.error ?? 'see server logs'}`)
  } else if (il?.fetched) {
    const detail: string[] = []
    if (il.linksActive) detail.push(`${il.linksActive} linked to a pupil`)
    if (il.skippedNoEmail) detail.push(`${il.skippedNoEmail} skipped, no email`)
    if (il.skippedNoPupil) detail.push(`${il.skippedNoPupil} skipped, pupil not synced`)
    if (il.skippedNoPupilId) detail.push(`${il.skippedNoPupilId} skipped, no pupil sent`)
    // The reason an ILSA can exist in Connect and still not be able to message:
    // Hub has no user id for them until they have signed in once.
    if (il.withoutHubUserId) detail.push(`${il.withoutHubUserId} not signed into Hub yet`)
    // Reads as success otherwise: the account was found and updated, but under
    // a role that cannot act as an ILSA.
    if (il.roleConflict) detail.push(`${il.roleConflict} already has another role`)
    if (il.linksDeactivated) detail.push(`${il.linksDeactivated} unlinked`)
    parts.push(`${il.fetched} ILSA${il.fetched !== 1 ? 's' : ''} from Hub${detail.length ? ` (${detail.join(', ')})` : ''}`)
  } else if (il && il.linksDeactivated) {
    // Hub sent none but we had some: every link was revoked this run, which is
    // a real event and not the same as "nothing happened".
    parts.push(`${il.linksDeactivated} ILSA link${il.linksDeactivated !== 1 ? 's' : ''} removed`)
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
