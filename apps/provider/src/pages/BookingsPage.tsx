import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Mail, Phone, Users } from 'lucide-react'
import { apiFetch, ApiError } from '../api'

interface Booking {
  id: string
  activityId: string
  activityName: string
  studentName: string
  className: string | null
  allergies: string[]
  medicalNotes: string | null
  paymentStatus: 'UNPAID' | 'PAID' | 'PARTIAL' | 'WAIVED'
  parent: { name: string; email: string; phone: string | null } | null
  createdAt: string
}

const STATUSES: Booking['paymentStatus'][] = ['UNPAID', 'PARTIAL', 'PAID', 'WAIVED']
const STATUS_STYLE: Record<string, string> = {
  PAID: 'bg-green-50 text-green-700',
  WAIVED: 'bg-slate-100 text-warm-text-secondary',
  PARTIAL: 'bg-yellow-50 text-yellow-700',
  UNPAID: 'bg-yellow-50 text-yellow-700',
}

export function BookingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    try {
      setBookings(await apiFetch<Booking[]>('/api/provider-portal/bookings'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load bookings.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const setStatus = async (b: Booking, paymentStatus: Booking['paymentStatus']) => {
    setSavingId(b.id)
    const prev = bookings
    setBookings(list => list.map(x => (x.id === b.id ? { ...x, paymentStatus } : x)))
    try {
      await apiFetch(`/api/provider-portal/bookings/${b.id}`, { method: 'PATCH', body: JSON.stringify({ paymentStatus }) })
    } catch {
      setBookings(prev) // roll back
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-warm-text-tertiary" />
      </div>
    )
  }

  const anyContact = bookings.some(b => b.parent)

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-warm-text-primary">Bookings</h1>
      <p className="text-warm-text-secondary mt-1">Families enrolled in your clubs. Update payment as you receive it.</p>

      {error && <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5 mt-4">{error}</div>}

      {!anyContact && bookings.length > 0 && (
        <div className="warm-card p-3 text-xs text-warm-text-secondary mt-4">
          Parent contact details aren't shared for these bookings. Ask the school if you need to reach families directly.
        </div>
      )}

      {bookings.length === 0 && !error ? (
        <div className="warm-card p-10 text-center mt-6">
          <Users className="h-8 w-8 text-warm-text-tertiary mx-auto mb-3" />
          <p className="text-warm-text-secondary text-sm">No bookings yet.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-warm-text-tertiary border-b border-warm-border">
                <th className="font-semibold py-2 pr-4">Child</th>
                <th className="font-semibold py-2 pr-4">Club</th>
                <th className="font-semibold py-2 pr-4">Parent</th>
                <th className="font-semibold py-2">Payment</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id} className="border-b border-warm-border/60 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-warm-text-primary">{b.studentName}</div>
                    {b.className && <div className="text-xs text-warm-text-tertiary">{b.className}</div>}
                    {(b.allergies.length > 0 || b.medicalNotes) && (
                      <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                        {b.allergies.map(a => (
                          <span key={a} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                            <AlertTriangle className="h-3 w-3" /> {a}
                          </span>
                        ))}
                        {b.medicalNotes && <span className="text-[11px] text-warm-error" title={b.medicalNotes}>⚕ {b.medicalNotes}</span>}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-warm-text-secondary">{b.activityName}</td>
                  <td className="py-3 pr-4">
                    {b.parent ? (
                      <div className="text-xs text-warm-text-secondary space-y-0.5">
                        <div className="font-semibold text-warm-text-primary">{b.parent.name}</div>
                        <a href={`mailto:${b.parent.email}`} className="flex items-center gap-1.5 hover:text-brand"><Mail className="h-3 w-3" /> {b.parent.email}</a>
                        {b.parent.phone && <a href={`tel:${b.parent.phone}`} className="flex items-center gap-1.5 hover:text-brand"><Phone className="h-3 w-3" /> {b.parent.phone}</a>}
                      </div>
                    ) : (
                      <span className="text-xs text-warm-text-tertiary">Not shared</span>
                    )}
                  </td>
                  <td className="py-3">
                    <select
                      value={b.paymentStatus}
                      disabled={savingId === b.id}
                      onChange={e => setStatus(b, e.target.value as Booking['paymentStatus'])}
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30 ${STATUS_STYLE[b.paymentStatus]}`}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
