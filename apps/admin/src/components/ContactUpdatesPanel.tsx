import React, { useState } from 'react'
import { Download, Check, ChevronDown, ChevronUp, PhoneOff } from 'lucide-react'
import { useApi, api, useToast } from '@wasil/shared'
import type { ContactChangeRequestItem, ContactConfirmationSummary } from '@wasil/shared'

/**
 * Parent contact details: who has confirmed them this term, who hasn't, and
 * the corrections parents have sent.
 *
 * Counts are in CHILDREN — the number the school can check against its roll —
 * with a child covered once any of their parents has answered. Adult figures
 * sit alongside.
 *
 * Connect cannot write to Hub or the MIS, so a correction reaches the school's
 * records through the CSV: IT loads it into Nexquare, then the rows are marked
 * done. A row also closes on its own when the next Hub sync finds Hub holding
 * the new value.
 */
export function ContactUpdatesPanel() {
  const toast = useToast()
  const { data, refetch } = useApi(() => api.contactChanges.list('open'), [])
  const { data: summary } = useApi(() => api.contactChanges.summary(), [])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState<'changes' | 'outstanding' | 'noUae' | null>(null)

  const rows: ContactChangeRequestItem[] = data?.requests ?? []
  if (!summary?.enabled && rows.length === 0) return null

  const run = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error(`${failure}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  const markDone = () => run(async () => {
    const { resolved } = await api.contactChanges.resolve([...selected])
    toast.success(`${resolved} marked done`)
    setSelected(new Set())
    refetch()
  }, 'Could not mark done')

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const toggleShow = (s: typeof show) => setShow(cur => (cur === s ? null : s))
  const btn = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap'
  const tab = (active: boolean) =>
    `flex items-center gap-1 text-xs font-medium ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Parent contact details</p>
            {summary?.enabled ? (
              <SummaryLine summary={summary} />
            ) : (
              <p className="text-xs text-slate-500 mt-0.5">The details check is turned off in Settings.</p>
            )}
          </div>
          {summary?.enabled && summary.parents.outstanding > 0 && (
            <button onClick={() => run(() => api.contactChanges.exportOutstanding(), 'Download failed')} disabled={busy} className={btn}>
              <Download className="h-3.5 w-3.5" /> Not confirmed (CSV)
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
          {rows.length > 0 && (
            <button onClick={() => toggleShow('changes')} className={tab(show === 'changes')}>
              <span className="bg-amber-100 text-amber-800 px-1.5 rounded-full">{rows.length}</span> changes to add to Nexquare
              {show === 'changes' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          {summary?.enabled && summary.parents.outstanding > 0 && (
            <button onClick={() => toggleShow('outstanding')} className={tab(show === 'outstanding')}>
              {summary.parents.outstanding} parents still to answer
              {show === 'outstanding' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          {summary && summary.noUaeChildren.length > 0 && (
            <button onClick={() => toggleShow('noUae')} className={tab(show === 'noUae')}>
              {summary.noUaeChildren.length} children with no UAE number
              {show === 'noUae' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {show === 'changes' && rows.length > 0 && (
        <div className="border-t border-slate-200">
          <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50/60">
            <p className="text-xs text-amber-900">
              Download the CSV for IT to add to Nexquare, then mark the rows done. They also clear once Hub has the new details.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => run(async () => { await api.contactChanges.exportCsv(); refetch() }, 'Download failed')} disabled={busy} className={btn}>
                <Download className="h-3.5 w-3.5" /> Download CSV
              </button>
              <button onClick={markDone} disabled={busy || selected.size === 0} className={btn}>
                <Check className="h-3.5 w-3.5" /> Mark done{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500 sticky top-0 bg-white">
                <tr>
                  <th className="px-4 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selected.size === rows.length}
                      onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))}
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Parent</th>
                  <th className="px-2 py-2 font-medium">Children</th>
                  <th className="px-2 py-2 font-medium">What</th>
                  <th className="px-2 py-2 font-medium">School records</th>
                  <th className="px-2 py-2 font-medium">New</th>
                  <th className="px-2 py-2 font-medium">Asked</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {rows.map(r => {
                  const foreign = r.field === 'PHONE' && !/^\+?(00)?971|^0\d/.test(r.newValue.replace(/\s/g, ''))
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.parent.name}`}
                          checked={selected.has(r.id)}
                          onChange={() => setSelected(prev => {
                            const next = new Set(prev)
                            if (next.has(r.id)) next.delete(r.id)
                            else next.add(r.id)
                            return next
                          })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-900">{r.parent.name}</div>
                        <div className="text-slate-500">{r.parent.email}</div>
                      </td>
                      <td className="px-2 py-2">{childList(r.parent.children)}</td>
                      <td className="px-2 py-2">{r.field === 'PHONE' ? 'Phone' : 'Email'}</td>
                      <td className="px-2 py-2 text-slate-500">{r.oldValue || '—'}</td>
                      <td className="px-2 py-2 font-medium text-slate-900">
                        <span className="inline-flex items-center gap-1">
                          {r.newValue}
                          {foreign && <span title="Not a UAE number — the office can't ring it"><PhoneOff className="h-3.5 w-3.5 text-amber-600" /></span>}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-500 whitespace-nowrap">
                        {fmt(r.requestedAt)}
                        {r.exportedAt && <span className="block text-[10px] text-amber-700">in CSV {fmt(r.exportedAt)}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {show === 'outstanding' && summary && (
        <div className="border-t border-slate-200 max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 sticky top-0 bg-white">
              <tr>
                <th className="px-4 py-2 font-medium">Parent</th>
                <th className="px-2 py-2 font-medium">Children</th>
                <th className="px-2 py-2 font-medium">Phone</th>
                <th className="px-2 py-2 font-medium">Last confirmed</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {summary.outstanding.map(o => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{o.name}</div>
                    <div className="text-slate-500">{o.email}</div>
                    {!o.signedIn && <div className="text-[10px] text-slate-400">Never signed in to Connect</div>}
                  </td>
                  <td className="px-2 py-2">{childList(o.children)}</td>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1">
                      {o.phone || '—'}
                      {!o.phoneReachable && <span title="Not a UAE number — the office can't ring it"><PhoneOff className="h-3.5 w-3.5 text-amber-600" /></span>}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{o.lastConfirmedAt ? fmt(o.lastConfirmedAt) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show === 'noUae' && summary && (
        <div className="border-t border-slate-200 max-h-80 overflow-auto">
          <p className="px-4 pt-2 text-xs text-slate-500">No parent of these children has a number the school can ring as a UAE call.</p>
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 sticky top-0 bg-white">
              <tr>
                <th className="px-4 py-2 font-medium">Child</th>
                <th className="px-2 py-2 font-medium">Class</th>
                <th className="px-2 py-2 font-medium">Parents in Connect</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {summary.noUaeChildren.map((c, i) => (
                <tr key={`${c.name}-${i}`} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{c.name}</td>
                  <td className="px-2 py-2">{c.className || '—'}</td>
                  <td className="px-2 py-2">{c.parents.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function childList(children: Array<{ name: string; className: string | null }>) {
  return children.map(c => (c.className ? `${c.name} (${c.className})` : c.name)).join(', ') || '—'
}

function SummaryLine({ summary }: { summary: ContactConfirmationSummary }) {
  const { children, parents, termStart } = summary
  const pct = children.total > 0 ? Math.round((children.confirmed / children.total) * 100) : 0
  const since = termStart
    ? `since term started ${new Date(termStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : 'in the current round'
  return (
    <>
      <p className="text-xs text-slate-600 mt-0.5">
        Confirmed for <strong>{children.confirmed} of {children.total} children</strong> {since}
        <span className="text-slate-400"> · {parents.confirmed} of {parents.total} parents</span>
      </p>
      <div className="mt-1.5 h-1.5 w-64 max-w-full rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      {parents.outstandingNeverSignedIn > 0 && (
        <p className="text-[11px] text-slate-400 mt-1">
          {parents.outstandingNeverSignedIn} of the parents still to answer have never signed in to Connect, so can't answer yet.
        </p>
      )}
    </>
  )
}
