import React from 'react'
import { Bus, MapPin, Sunrise, Sunset, AlertCircle } from 'lucide-react'
import { PageLogo } from '../components/PageHeader'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { TransportResponse, TransportLegInfo } from '@wasil/shared'

/**
 * A parent's own children's bus arrangements.
 *
 * Reads the one guardian-scoped endpoint. There is no school-wide view here and
 * there is no staff equivalent of this screen anywhere in Connect — a stop name
 * is a child's home address (see docs/adr/0001).
 */

const LEG_LABEL: Record<string, string> = { AM: 'Morning', PM: 'Afternoon' }

function formatTime(time: string) {
  const [h, m] = time.split(':')
  const hour = parseInt(h, 10)
  if (Number.isNaN(hour)) return time
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

function Leg({ leg }: { leg: TransportLegInfo }) {
  const Icon = leg.leg === 'AM' ? Sunrise : Sunset
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0' }}>
      <div
        style={{
          width: 34, height: 34, borderRadius: 11, flexShrink: 0,
          background: leg.leg === 'AM' ? '#FFF7EC' : '#F0E4E6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon size={17} color={leg.leg === 'AM' ? '#C47A20' : '#7A6469'} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#2D2225', fontSize: 15 }}>{LEG_LABEL[leg.leg] || leg.leg}</span>
          <span style={{ fontWeight: 800, color: '#C4506E', fontSize: 15 }}>{formatTime(leg.timeLocal)}</span>
        </div>
        <div style={{ fontSize: 13, color: '#7A6469', marginTop: 2 }}>
          {leg.routeName}{leg.routeCode ? ` · ${leg.routeCode}` : ''}
        </div>
        {leg.stopName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#7A6469', marginTop: 4 }}>
            <MapPin size={13} /> {leg.stopName}
          </div>
        ) : leg.stopNameHidden ? (
          // Withheld deliberately, so say so rather than leaving a blank a
          // parent would read as missing information.
          <div style={{ fontSize: 12, color: '#A8929A', marginTop: 4 }}>
            Pickup point not shown here — please contact the school office.
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function TransportPage() {
  const { data, isLoading, error } = useApi<TransportResponse>(() => api.transport.mine(), [])

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageLogo />
      <div style={{ padding: '0 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#2D2225', margin: '4px 0 2px' }}>School bus</h1>
        <p style={{ fontSize: 14, color: '#7A6469', margin: '0 0 18px' }}>
          Your child's route and pickup time.
        </p>

        {isLoading && <div style={{ color: '#A8929A', fontSize: 14 }}>Loading…</div>}

        {/* A failed read must never look like "no bus". Absent data and empty
            data render differently, on purpose. */}
        {error && !isLoading && (
          <div
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              background: '#FDECEC', borderRadius: 14, padding: '14px 16px',
            }}
          >
            <AlertCircle size={18} color="#C0392B" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#C0392B', fontSize: 14 }}>Couldn't load bus details</div>
              <div style={{ fontSize: 13, color: '#8C4A45', marginTop: 2 }}>
                This is a problem at our end, not a change to your child's bus. Pull to refresh, and
                contact the office if it keeps happening.
              </div>
            </div>
          </div>
        )}

        {data && data.children.length === 0 && !isLoading && !error && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: '#A8929A' }}>
            <Bus size={28} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, margin: 0 }}>No school bus is set up for your children.</p>
            <p style={{ fontSize: 13, margin: '6px 0 0' }}>Contact the office if you think this is wrong.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data?.children.map(child => (
            <div
              key={child.studentId}
              style={{ background: '#fff', borderRadius: 18, border: '1px solid #F0E4E6', padding: '14px 16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bus size={16} color="#C4506E" />
                <span style={{ fontWeight: 700, color: '#2D2225', fontSize: 16 }}>{child.studentName}</span>
              </div>
              <div style={{ marginTop: 4 }}>
                {child.legs.map((leg, i) => (
                  <React.Fragment key={leg.leg}>
                    {i > 0 && <div style={{ height: 1, background: '#F5EDEE' }} />}
                    <Leg leg={leg} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
