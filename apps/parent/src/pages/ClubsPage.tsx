import React, { useState } from 'react'
import { Sparkles, MapPin, ExternalLink, X, Check, CreditCard } from 'lucide-react'
import { PageLogo } from '../components/PageHeader'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ClubsResponse, ClubActivity } from '@wasil/shared'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SLOT: Record<string, string> = { BEFORE_SCHOOL: 'Before school', AFTER_SCHOOL: 'After school' }
const PAYMENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  PAID: { bg: '#E8F5EC', text: '#2D8B4E', label: 'Paid' },
  UNPAID: { bg: '#FFF3E6', text: '#C47A20', label: 'Payment due' },
  PARTIAL: { bg: '#FFF3E6', text: '#C47A20', label: 'Part paid' },
  WAIVED: { bg: '#F0E4E6', text: '#7A6469', label: 'Waived' },
}

export function ClubsPage() {
  const { data, isLoading, error, refetch } = useApi<ClubsResponse>(() => api.clubs.list(), [])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pickFor, setPickFor] = useState<ClubActivity | null>(null)

  const book = async (activityId: string, studentId: string) => {
    setBusyId(activityId)
    setActionError(null)
    try {
      await api.clubs.book(activityId, studentId)
      setPickFor(null)
      await refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not book this club.')
    } finally {
      setBusyId(null)
    }
  }

  const cancel = async (bookingId: string) => {
    setBusyId(bookingId)
    setActionError(null)
    try {
      await api.clubs.cancelBooking(bookingId)
      await refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel this booking.')
    } finally {
      setBusyId(null)
    }
  }

  const startBooking = (club: ClubActivity) => {
    const students = data?.students || []
    if (students.length === 1) {
      void book(club.id, students[0].id)
    } else {
      setPickFor(club)
    }
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageLogo />
      <div style={{ padding: '0 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#2D2225', margin: '4px 0 2px' }}>Clubs</h1>
        <p style={{ fontSize: 14, color: '#7A6469', margin: '0 0 18px' }}>Paid clubs run by our partners. Book a place, then pay on the provider's link.</p>

        {actionError && (
          <div style={{ background: '#FDECEC', color: '#C0392B', fontSize: 13, padding: '10px 12px', borderRadius: 12, marginBottom: 14 }}>{actionError}</div>
        )}

        {isLoading && <div style={{ color: '#A8929A', fontSize: 14 }}>Loading…</div>}
        {error && <div style={{ color: '#C0392B', fontSize: 14 }}>Couldn't load clubs. Pull to refresh.</div>}

        {data && data.clubs.length === 0 && !isLoading && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: '#A8929A' }}>
            <Sparkles size={28} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, margin: 0 }}>No clubs are open for booking right now.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data?.clubs.map(club => {
            const booking = data.bookings.find(b => b.activityId === club.id && !b.cancelled)
            const full = club.spotsLeft === 0 && !booking
            const pay = booking ? PAYMENT_COLORS[booking.paymentStatus] || PAYMENT_COLORS.UNPAID : null

            return (
              <div key={club.id} style={{ background: '#fff', borderRadius: 18, border: '1px solid #F0E4E6', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#2D2225', fontSize: 16 }}>{club.name}</div>
                    {club.providerName && <div style={{ fontSize: 12, color: '#A8929A', marginTop: 1 }}>by {club.providerName}</div>}
                  </div>
                  {club.cost != null && club.cost > 0 && (
                    <div style={{ flexShrink: 0, background: '#FFF7EC', color: '#C47A20', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, height: 'fit-content' }}>
                      {club.costDescription || `${club.cost} AED`}
                    </div>
                  )}
                </div>

                {club.description && <p style={{ fontSize: 13, color: '#7A6469', margin: '8px 0 0' }}>{club.description}</p>}

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#7A6469', marginTop: 10 }}>
                  <span>{DAYS[club.dayOfWeek]} · {SLOT[club.timeSlot] || club.timeSlot}</span>
                  {club.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {club.location}</span>}
                  {club.spotsLeft != null && <span>{club.spotsLeft} place{club.spotsLeft === 1 ? '' : 's'} left</span>}
                </div>

                <div style={{ marginTop: 14 }}>
                  {booking ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#E8F5EC', color: '#2D8B4E', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 999 }}>
                        <Check size={13} /> Booked
                      </span>
                      {pay && (
                        <span style={{ background: pay.bg, color: pay.text, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 999 }}>{pay.label}</span>
                      )}
                      {booking.paymentUrl && booking.paymentStatus !== 'PAID' && booking.paymentStatus !== 'WAIVED' && (
                        <a
                          href={booking.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#C4506E', color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 12, textDecoration: 'none' }}
                        >
                          <CreditCard size={15} /> Pay now <ExternalLink size={13} />
                        </a>
                      )}
                      <button
                        onClick={() => cancel(booking.id)}
                        disabled={busyId === booking.id}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#A8929A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startBooking(club)}
                      disabled={full || busyId === club.id}
                      style={{
                        width: '100%', background: full ? '#F0E4E6' : '#C4506E', color: full ? '#A8929A' : '#fff',
                        fontSize: 14, fontWeight: 700, padding: '11px', borderRadius: 12, border: 'none', cursor: full ? 'default' : 'pointer',
                      }}
                    >
                      {full ? 'Full' : busyId === club.id ? 'Booking…' : 'Book a place'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Child picker */}
      {pickFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }} onClick={() => setPickFor(null)}>
          <div style={{ background: '#fff', width: '100%', borderRadius: '20px 20px 0 0', padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#2D2225' }}>Book for which child?</div>
              <button onClick={() => setPickFor(null)} style={{ background: 'none', border: 'none', color: '#A8929A' }} aria-label="Close"><X size={22} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data?.students || []).map(s => (
                <button
                  key={s.id}
                  onClick={() => book(pickFor.id, s.id)}
                  disabled={busyId === pickFor.id}
                  style={{ textAlign: 'left', background: '#FAF8F6', border: '1px solid #F0E4E6', borderRadius: 14, padding: '12px 14px', fontSize: 15, fontWeight: 600, color: '#2D2225', cursor: 'pointer' }}
                >
                  {s.name}{s.className ? <span style={{ color: '#A8929A', fontWeight: 400 }}> · {s.className}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
