import { useEffect, useRef, useState } from 'react'
import { api, useApi, useToast, ConfirmModal } from '@wasil/shared'
import type { Class, ClassInvitationBatch, ClassInvitationFamily } from '@wasil/shared'
import { Printer, RefreshCw, Ticket, XCircle } from 'lucide-react'
import QRCode from 'qrcode'

// A mass sign-up event: a teacher hands a family a slip and they're on the app
// in a minute, no email round-trip and no waiting for a code to arrive.
//
// One slip per FAMILY, not per pupil — three siblings shouldn't mean three
// codes to keep straight in a queue. Slips are individual cards rather than one
// class list, because a list left on a table is a key to every child in the
// class; a slip is a key to one family, for a few hours.

const EXPIRY_OPTIONS = [
  { hours: 6, label: '6 hours', hint: 'Same session' },
  { hours: 24, label: '1 day', hint: 'Event day' },
  { hours: 72, label: '3 days', hint: 'Stragglers welcome' },
]

export function SignUpEventPage() {
  const toast = useToast()
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])
  const [classId, setClassId] = useState('')
  const [hours, setHours] = useState(24)
  const [batch, setBatch] = useState<ClassInvitationBatch | null>(null)
  const [isMinting, setIsMinting] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const mint = async () => {
    if (!classId) return
    setIsMinting(true)
    try {
      const result = await api.parentInvitations.mintByClass(classId, hours)
      setBatch(result)
      const fresh = result.families.filter(f => !f.reused).length
      toast.success(
        fresh === result.families.length
          ? `${fresh} code${fresh === 1 ? '' : 's'} ready`
          : `${result.families.length} families — ${fresh} new, ${result.families.length - fresh} already had a live code`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create codes')
    } finally {
      setIsMinting(false)
    }
  }

  // Revoking is the other half of handing out paper: after the event every
  // unused slip is still a live key until someone kills it.
  const revokeUnused = async () => {
    if (!batch) return
    setConfirmRevoke(false)
    try {
      const { revoked } = await api.parentInvitations.revokeBatch(batch.families.map(f => f.invitationId))
      toast.success(revoked === 0 ? 'Nothing left to revoke' : `Revoked ${revoked} unused code${revoked === 1 ? '' : 's'}`)
      setBatch(null)
    } catch {
      toast.error('Failed to revoke')
    }
  }

  const needCodes = batch?.families.filter(f => !f.alreadyRegistered) ?? []
  const alreadyOn = batch?.families.filter(f => f.alreadyRegistered) ?? []

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-warm-text-primary">Sign-up event</h1>
        <p className="text-sm text-warm-text-tertiary mt-1">
          Print a slip per family so teachers can get parents onto the app on the spot.
        </p>
      </div>

      <div className="warm-card p-5 space-y-4 print:hidden">
        <div>
          <label className="block text-xs font-semibold text-warm-text-secondary mb-1">Class</label>
          <select
            value={classId}
            onChange={e => { setClassId(e.target.value); setBatch(null) }}
            className="w-full rounded-warm-btn border border-warm-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">Choose a class…</option>
            {(classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-warm-text-secondary mb-1">Codes stop working after</label>
          <div className="flex flex-wrap gap-2">
            {EXPIRY_OPTIONS.map(o => (
              <button
                key={o.hours}
                onClick={() => setHours(o.hours)}
                className={`rounded-warm-btn px-3.5 py-2 text-sm font-semibold border ${
                  hours === o.hours
                    ? 'bg-brand text-white border-transparent'
                    : 'border-warm-border text-warm-text-secondary hover:bg-slate-50'
                }`}
              >
                {o.label}
                <span className={`block text-[11px] font-medium ${hours === o.hours ? 'text-white/80' : 'text-warm-text-tertiary'}`}>
                  {o.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={mint}
            disabled={!classId || isMinting}
            className="flex items-center gap-2 rounded-warm-btn bg-brand text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-60"
          >
            <Ticket className="h-4 w-4" />
            {isMinting ? 'Creating…' : batch ? 'Refresh list' : 'Create codes'}
          </button>
          {batch && (
            <>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-warm-btn border border-warm-border px-4 py-2.5 text-sm font-semibold text-warm-text-secondary hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" /> Print slips
              </button>
              <button
                onClick={() => setConfirmRevoke(true)}
                className="flex items-center gap-2 rounded-warm-btn border border-warm-border px-4 py-2.5 text-sm font-semibold text-warm-error hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" /> Revoke unused
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-warm-text-tertiary">
          Re-running keeps codes already created for the same family, so slips you've printed stay valid.
          Each code works once and covers all of that family's children in this class.
        </p>
      </div>

      {batch && (
        <div className="mt-6 space-y-6">
          <div className="print:hidden flex items-center justify-between">
            <h2 className="text-sm font-bold text-warm-text-primary">
              {batch.className} · {needCodes.length} slip{needCodes.length === 1 ? '' : 's'} to hand out
            </h2>
            <span className="text-xs text-warm-text-tertiary">
              Expires {new Date(batch.expiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>

          {/* The printable sheet. Everything else is hidden at print time. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3">
            {needCodes.map(f => (
              <Slip key={f.invitationId} family={f} className={batch.className} />
            ))}
          </div>

          {alreadyOn.length > 0 && (
            <div className="warm-card p-4 print:hidden">
              <p className="text-sm font-bold text-warm-text-primary mb-1">
                {alreadyOn.length} famil{alreadyOn.length === 1 ? 'y is' : 'ies are'} already signed up
              </p>
              <p className="text-xs text-warm-text-tertiary mb-2">
                No slip printed for these — they already have a working login. A code was still created in case
                they need one on the day.
              </p>
              <p className="text-xs text-warm-text-secondary">
                {alreadyOn.map(f => f.studentNames.join(' & ')).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {confirmRevoke && (
        <ConfirmModal
          title="Revoke unused codes"
          message="Every code from this batch that hasn't been used will stop working immediately. Codes already redeemed are unaffected."
          confirmLabel="Revoke"
          variant="danger"
          onConfirm={revokeUnused}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
    </div>
  )
}

// One family's slip: who it's for, the code, and a QR so nobody has to type
// ABC-123-XYZ on a phone keyboard in a queue.
function Slip({ family, className }: { family: ClassInvitationFamily; className: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrFailed, setQrFailed] = useState(false)

  useEffect(() => {
    if (!canvasRef.current || !family.registrationUrl) return
    // Rendered locally on purpose: sending a live join code to a third-party QR
    // service would hand that key to someone else's server.
    QRCode.toCanvas(canvasRef.current, family.registrationUrl, { width: 132, margin: 0 })
      .catch(() => setQrFailed(true))
  }, [family.registrationUrl])

  return (
    <div className="warm-card p-4 break-inside-avoid print:border print:border-slate-300">
      <p className="text-[11px] font-bold uppercase tracking-wide text-warm-text-tertiary">{className}</p>
      <p className="text-base font-extrabold text-warm-text-primary mt-0.5">
        {family.studentNames.join(' & ')}
      </p>
      {family.parentNames.length > 0 && (
        <p className="text-xs text-warm-text-tertiary">{family.parentNames.join(', ')}</p>
      )}

      <div className="flex items-center gap-4 mt-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-warm-text-secondary">Your join code</p>
          <p className="text-[22px] font-extrabold tracking-wider text-warm-text-primary">{family.accessCode}</p>
          <p className="text-[11px] text-warm-text-tertiary mt-1 leading-snug">
            Scan the code, or open the app and enter this. It works once, and only for today.
          </p>
        </div>
        {!qrFailed && <canvas ref={canvasRef} className="shrink-0" />}
      </div>
    </div>
  )
}
