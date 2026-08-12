import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, useApi, useToast, ConfirmModal, type OpsSearchResult } from '@wasil/shared'
import { Search, Mail, Link2, Unlock, LogOut, RotateCcw, Copy } from 'lucide-react'
import { Card, PageHeader, Badge, Skeleton, Btn, Table, Th, Td, relTime, EmptyState, Highlight } from './kit'

type ConfirmState = { title: string; message: string; variant?: 'danger' | 'warning'; run: () => Promise<void> } | null

export function ParentSupportPage() {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchParams] = useSearchParams()

  // Deep-link from the command palette: /ops/support?id=<parentId> preselects.
  useEffect(() => {
    const id = searchParams.get('id')
    if (id) setSelectedId(id)
  }, [searchParams])

  // Debounce the query (250ms) so we don't hammer the search endpoint.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useApi<{ results: OpsSearchResult[] }>(
    () => (debounced.length >= 2 ? api.ops.searchParents(debounced) : Promise.resolve({ results: [] })),
    [debounced],
  )
  const detail = useApi(() => (selectedId ? api.ops.parent(selectedId) : Promise.resolve(null)), [selectedId])
  const p = detail.data?.parent

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); detail.refetch() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false); setConfirm(null) }
  }

  const copyLoginLink = async () => {
    if (!selectedId) return
    setBusy(true)
    try {
      const { url } = await api.ops.magicLink(selectedId)
      await navigator.clipboard.writeText(url).catch(() => {})
      toast.success('Login link copied (valid 15 min)')
      detail.refetch()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to mint link') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Parent Support" subtitle="Search by name, email or child — resolve without SQL" />

      {/* Universal search */}
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search parents by name, email or child…"
          className="w-full rounded-lg border border-slate-800 bg-slate-900 py-3 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-600"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,340px)_1fr]">
        {/* Results */}
        <Card className="max-h-[70vh] overflow-y-auto p-2">
          {debounced.length < 2 ? (
            <EmptyState>Type at least 2 characters.</EmptyState>
          ) : results.isLoading ? (
            <div className="space-y-2 p-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (results.data?.results.length ?? 0) === 0 ? (
            <EmptyState>No parents match “{debounced}”.</EmptyState>
          ) : (
            <ul className="space-y-1">
              {results.data!.results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${selectedId === r.id ? 'bg-sky-600/15 ring-1 ring-sky-700' : 'hover:bg-slate-800/60'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-slate-100"><Highlight text={r.name} q={debounced} /></span>
                      {r.activated ? <Badge tone="green">active</Badge> : r.invited ? <Badge tone="amber">invited</Badge> : <Badge>new</Badge>}
                    </div>
                    <div className="truncate text-xs text-slate-500"><Highlight text={r.email} q={debounced} /></div>
                    {r.matchedVia.startsWith('child') && <div className="text-[11px] text-slate-600">matched {r.matchedVia}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Detail */}
        <div>
          {!selectedId ? (
            <Card className="p-10"><EmptyState>Select a parent to see their full record and support actions.</EmptyState></Card>
          ) : detail.isLoading || !p ? (
            <Skeleton className="h-96" />
          ) : (
            <div className="space-y-4">
              {/* Profile + actions */}
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-100">{p.name}</h2>
                      {p.activated ? <Badge tone="green">activated</Badge> : p.invited ? <Badge tone="amber">invited, not activated</Badge> : <Badge>not invited</Badge>}
                      {p.locked && <Badge tone="red">locked</Badge>}
                      {p.twoFactorEnabled && <Badge tone="sky">2FA</Badge>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-400">
                      {p.email}
                      <button onClick={() => { navigator.clipboard?.writeText(p.email); toast.info('Email copied') }} title="Copy email"><Copy className="h-3.5 w-3.5 text-slate-500 hover:text-slate-300" /></button>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Last login {relTime(p.lastLoginAt)} · joined {relTime(p.createdAt)} · {p.failedLoginAttempts} failed attempts</div>
                    {p.children.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.children.map((c, i) => <Badge key={i}>{c.name}{c.className ? ` · ${c.className}` : ''}</Badge>)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Support actions */}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                  <Btn tone="primary" disabled={busy} onClick={() => run(() => api.ops.resendInvite(selectedId!), 'Invitation re-sent')}><Mail className="h-3.5 w-3.5" /> Resend invite</Btn>
                  <Btn disabled={busy} onClick={copyLoginLink}><Link2 className="h-3.5 w-3.5" /> Copy login link</Btn>
                  <Btn disabled={busy || !p.locked} onClick={() => setConfirm({ title: 'Unlock account', message: `Clear the lockout on ${p.name}?`, variant: 'warning', run: () => run(() => api.ops.unlock(selectedId!), 'Account unlocked') })}><Unlock className="h-3.5 w-3.5" /> Unlock</Btn>
                  <Btn tone="danger" disabled={busy} onClick={() => setConfirm({ title: 'Invalidate sessions', message: `Sign ${p.name} out of all devices? They'll need to sign in again.`, variant: 'danger', run: () => run(() => api.ops.invalidateSessions(selectedId!), 'Sessions invalidated') })}><LogOut className="h-3.5 w-3.5" /> Invalidate sessions</Btn>
                  <Btn tone="danger" disabled={busy} onClick={() => setConfirm({ title: 'Reset onboarding', message: `Mark ${p.name} un-invited so a fresh invite can be sent? Their account and data are kept.`, variant: 'danger', run: () => run(() => api.ops.resetOnboarding(selectedId!), 'Onboarding reset') })}><RotateCcw className="h-3.5 w-3.5" /> Reset onboarding</Btn>
                </div>
              </Card>

              {/* Authentication history */}
              <Card className="p-4">
                <div className="mb-2 text-sm font-medium text-slate-200">Authentication history</div>
                {detail.data!.authEvents.length === 0 ? <EmptyState>No auth events.</EmptyState> : (
                  <Table head={<><Th>Event</Th><Th>IP</Th><Th>When</Th></>}>
                    {detail.data!.authEvents.slice(0, 12).map((e, i) => (
                      <tr key={i}><Td className="text-slate-200">{e.event}</Td><Td>{e.ipAddress ?? '—'}</Td><Td>{relTime(e.createdAt)}</Td></tr>
                    ))}
                  </Table>
                )}
              </Card>

              {/* Email delivery (Resend) — answers "why didn't they get it?" */}
              <Card className="p-4">
                <div className="mb-2 text-sm font-medium text-slate-200">Email delivery</div>
                {(detail.data!.emailDelivery?.length ?? 0) === 0 ? (
                  <EmptyState>No delivery events yet (Resend webhook not configured, or none for this address).</EmptyState>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {detail.data!.emailDelivery!.slice(0, 8).map((e, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Badge tone={e.type === 'delivered' ? 'green' : e.type === 'bounced' || e.type === 'complained' ? 'red' : e.type === 'opened' || e.type === 'clicked' ? 'sky' : 'amber'}>{e.type}</Badge>
                          {e.reason && <span className="truncate text-xs text-slate-500">{e.reason}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">{relTime(e.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Notifications + bookings */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <div className="mb-2 text-sm font-medium text-slate-200">Notifications</div>
                  {detail.data!.notifications.length === 0 ? <EmptyState>None.</EmptyState> : (
                    <ul className="space-y-1.5 text-sm">
                      {detail.data!.notifications.slice(0, 8).map((n, i) => (
                        <li key={i} className="flex items-center justify-between"><span className="truncate text-slate-300">{n.title}</span><span className="ml-2 shrink-0 text-xs text-slate-500">{relTime(n.createdAt)}</span></li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card className="p-4">
                  <div className="mb-2 text-sm font-medium text-slate-200">Bookings</div>
                  {detail.data!.bookings.clubs.length === 0 && detail.data!.bookings.consultations.length === 0 ? <EmptyState>None.</EmptyState> : (
                    <ul className="space-y-1.5 text-sm">
                      {detail.data!.bookings.clubs.slice(0, 6).map((b) => (
                        <li key={b.id} className="flex items-center justify-between"><span className="truncate text-slate-300">Club · {b.student.firstName} {b.student.lastName}</span><Badge tone={b.cancelledAt ? 'red' : 'slate'}>{b.cancelledAt ? 'cancelled' : b.paymentStatus}</Badge></li>
                      ))}
                      {detail.data!.bookings.consultations.slice(0, 4).map((b) => (
                        <li key={b.id} className="flex items-center justify-between"><span className="text-slate-300">Consultation</span><span className="text-xs text-slate-500">{relTime(b.createdAt)}</span></li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          variant={confirm.variant ?? 'default'}
          isLoading={busy}
          confirmLabel="Confirm"
          onConfirm={() => { void confirm.run() }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
