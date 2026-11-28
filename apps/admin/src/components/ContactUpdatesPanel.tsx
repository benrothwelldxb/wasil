import React, { useState } from 'react'
import { Download, Check, ChevronDown, ChevronUp, PhoneOff } from 'lucide-react'
import { useApi, api, useToast } from '@wasil/shared'
import type { ContactChangeRequestItem } from '@wasil/shared'

/**
 * Parents who have corrected their phone or email in Connect.
 *
 * Connect cannot write to Hub or the MIS, so this is how a correction reaches
 * the school's records: download the CSV for IT to load into Nexquare, then
 * mark the rows done. A row also closes on its own when the next Hub sync
 * finds Hub holding the new value. Renders nothing when there is nothing open.
 */
export function ContactUpdatesPanel() {
  const toast = useToast()
  const { data, refetch } = useApi(() => api.contactChanges.list('open'), [])
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const rows: ContactChangeRequestItem[] = data?.requests ?? []
  if (rows.length === 0) return null

  const allSelected = selected.size === rows.length
  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const download = async () => {
    setBusy(true)
    try {
      await api.contactChanges.exportCsv()
      refetch()
    } catch (err) {
      toast.error(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  const markDone = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const { resolved } = await api.contactChanges.resolve([...selected])
      toast.success(`${resolved} marked done`)
      setSelected(new Set())
      refetch()
    } catch (err) {
      toast.error(`Could not mark done: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/60">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-start gap-3 text-left">
          <div>
            <p className="text-sm font-medium text-amber-900">
              Contact updates from parents <span className="ml-1 text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">{rows.length}</span>
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              Parents corrected these in Connect. Download the CSV for IT to add to Nexquare, then mark them done.
              They also clear themselves once Hub has the new details.
            </p>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />}
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={download}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" /> Download CSV
          </button>
          <button
            onClick={markDone}
            disabled={busy || selected.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
          >
            <Check className="h-3.5 w-3.5" /> Mark done{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-amber-200 max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-amber-900/70 sticky top-0 bg-amber-50">
              <tr>
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))}
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
                  <tr key={r.id} className="border-t border-amber-100">
                    <td className="px-4 py-2">
                      <input type="checkbox" aria-label={`Select ${r.parent.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-900">{r.parent.name}</div>
                      <div className="text-slate-500">{r.parent.email}</div>
                    </td>
                    <td className="px-2 py-2">
                      {r.parent.children.map(c => c.className ? `${c.name} (${c.className})` : c.name).join(', ') || '—'}
                    </td>
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
      )}
    </div>
  )
}
