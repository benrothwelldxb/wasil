import React from 'react'
import { Bus, MapPin, Sunrise, Sunset, AlertCircle, CheckCircle2 } from 'lucide-react'
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

const LEG_LABEL: Record<string, string> = { AM: 'Morning', PM: 'Afternoon', FRI_PM: 'Friday afternoon' }

/**
 * What to call a leg, given the others this child has.
 *
 * The label does the work here, not the icon — "Afternoon" and "Friday
 * afternoon" distinguish themselves in words whatever glyph sits beside them,
 * and a third icon that is not obviously "Friday" would be decoration.
 *
 * The subtle half is the OTHER card. A child with a Friday bus has an ordinary
 * afternoon bus that no longer runs on Fridays, and two cards reading
 * "Afternoon" and "Friday afternoon" leave a parent to guess whether the first
 * one includes Friday. So it only says Mon–Thu when there is actually a Friday
 * service to exclude; a child with no Friday bus keeps the plain label, because
 * for them the afternoon bus IS every day.
 *
 * THIS IS PER CHILD, NOT PER SCHOOL, and it is meant to be. Two children at the
 * same school — one on the consolidated Friday bus, one not — correctly see
 * different words for the same leg, because the same leg means different things
 * to them. It looks like an inconsistency to anyone who has not thought it
 * through, so: it is not one, and making the label school-wide would tell every
 * family without a Friday bus that their afternoon bus stops on Thursday.
 */
/**
 * "Left school at 15:42 · 2 minutes late".
 *
 * The wording is OPPOSITE between legs and that is the whole point of carrying
 * the leg: a morning bus ARRIVES at school, an afternoon or Friday one DEPARTS
 * from it. Same mark, opposite journey. A parent told their child's bus
 * "arrived" when it has just driven away from school is worse than telling them
 * nothing.
 *
 * Built here rather than sent ready-made by Desk, which knows both numbers and
 * could. A finished English sentence is the one thing machine translation
 * handles worst, and this app translates for families who need it.
 *
 * With no expected time there is no lateness to state — and "on time" is an
 * assertion nobody made, so it is not the fallback.
 */
function runSentence(leg: TransportLegInfo): string | null {
  const run = leg.run
  if (!run) return null

  const when = new Date(run.markedAt)
  if (Number.isNaN(when.getTime())) return null
  const at = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const verb = leg.leg === 'AM' ? 'Arrived at school' : 'Left school'

  const due = run.dueAt ? /^(\d{1,2}):(\d{2})$/.exec(run.dueAt.trim()) : null
  if (!due) return `${verb} at ${at}`

  const dueMins = Number(due[1]) * 60 + Number(due[2])
  const actualMins = when.getHours() * 60 + when.getMinutes()
  const diff = actualMins - dueMins
  if (diff === 0) return `${verb} at ${at} · on time`
  const mins = Math.abs(diff)
  const unit = mins === 1 ? 'minute' : 'minutes'
  return `${verb} at ${at} · ${mins} ${unit} ${diff > 0 ? 'late' : 'early'}`
}

function legLabel(leg: string, allLegs: string[]): string {
  if (leg === 'PM' && allLegs.includes('FRI_PM')) return 'Afternoon (Mon–Thu)'
  return LEG_LABEL[leg] || leg
}

function formatTime(time: string) {
  const [h, m] = time.split(':')
  const hour = parseInt(h, 10)
  if (Number.isNaN(hour)) return time
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

function Leg({ leg, allLegs }: { leg: TransportLegInfo; allLegs: string[] }) {
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
          <span style={{ fontWeight: 700, color: '#2D2225', fontSize: 15 }}>{legLabel(leg.leg, allLegs)}</span>
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
        {runSentence(leg) && (
          // Today's mark from the school office. Absent until the bus is
          // marked, and gone again if the mark is withdrawn — a bus marked away
          // by mistake must stop saying so.
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 5, marginTop: 6,
              fontSize: 13, fontWeight: 700, color: '#2D7A4E',
            }}
          >
            <CheckCircle2 size={13} /> {runSentence(leg)}
          </div>
        )}
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
                    <Leg leg={leg} allLegs={child.legs.map(l => l.leg)} />
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
