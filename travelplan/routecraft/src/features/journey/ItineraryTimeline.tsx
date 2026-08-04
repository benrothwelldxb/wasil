import { Fragment } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bed, Moon, Plane } from 'lucide-react';
import type { Journey, Leg, StopoverCity } from '@/domain/types';
import { formatDuration, formatMoney, formatTime } from '@/domain/format';

function Node({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      className="relative flex gap-4 pb-6 last:pb-0"
      initial={reduce ? false : { opacity: 0, x: -12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35 }}
    >
      <div className="relative flex flex-col items-center">
        <div className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-card">
          {icon}
        </div>
        <div className="absolute top-9 h-full w-px bg-border" aria-hidden="true" />
      </div>
      <div className="flex-1 pt-1">{children}</div>
    </motion.li>
  );
}

function LegNode({ leg }: { leg: Leg }) {
  return (
    <Node icon={<Plane className="h-4 w-4 text-primary" />}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {leg.from.cityName} ({leg.from.iata}) → {leg.to.cityName} ({leg.to.iata})
        </span>
        <span className="text-sm text-muted-foreground">{formatDuration(leg.durationMinutes)}</span>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {formatTime(leg.departure)} – {formatTime(leg.arrival)} · {leg.airline.name} {leg.flightNumber}
        {leg.isRedEye ? ' · red-eye' : ''}
      </div>
    </Node>
  );
}

function StopoverNode({ stopover }: { stopover: StopoverCity }) {
  return (
    <Node icon={<Moon className="h-4 w-4 text-accent" />}>
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            {stopover.nights}-night stopover in {stopover.cityName}
          </span>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Bed className="h-3.5 w-3.5" />
            {stopover.hotel.name}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {stopover.transfers.arrival.mode} transfer in ·{' '}
          {formatDuration(stopover.transfers.arrival.durationMinutes)} ·{' '}
          {formatMoney(stopover.hotel.totalPrice)} for the stay
        </p>
      </div>
    </Node>
  );
}

/** Interleaves flight legs with the overnight stopovers between them. */
export function ItineraryTimeline({ journey }: { journey: Journey }) {
  return (
    <ol className="relative">
      {journey.legs.map((leg, i) => (
        <Fragment key={leg.id}>
          <LegNode leg={leg} />
          {journey.stopovers[i] ? <StopoverNode stopover={journey.stopovers[i]} /> : null}
        </Fragment>
      ))}
    </ol>
  );
}
