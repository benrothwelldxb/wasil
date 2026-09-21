/**
 * How well a candidate slot sits alongside the appointments a family already
 * holds.
 *
 * The constraint is the PARENT's own diary, not the sibling relationship: a
 * parent with two appointments has to physically get between them, whichever
 * child each one is for. So every booking the family holds in this
 * consultation counts, including ones for the same child with another teacher.
 *
 * The school's rule: at least a ten-minute buffer, ideally no more than thirty
 * minutes of waiting. Ten because back-to-back means walking between two rooms
 * with no gap and arriving late to the second; thirty because beyond that a
 * parent is sitting in a corridor.
 */

export const MIN_GAP_MINUTES = 10
export const MAX_IDEAL_GAP_MINUTES = 30

export type Proximity =
  /** No other appointments, so nothing to sit alongside. */
  | { kind: 'none' }
  /** Overlaps an existing appointment — they cannot attend both. */
  | { kind: 'clash'; withLabel: string }
  /** Under the buffer: no time to get between rooms. */
  | { kind: 'tight'; gap: number; withLabel: string }
  /** The sweet spot. */
  | { kind: 'ideal'; gap: number; withLabel: string }
  /** A long wait between appointments. */
  | { kind: 'far'; gap: number; withLabel: string }

export interface ExistingAppointment {
  startTime: string // "15:40"
  endTime: string   // "15:50"
  /** For the message: "Raees with Ms Khan". */
  label: string
  /** Only same-day appointments constrain each other. */
  date?: string | null
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Judge one candidate slot against everything else the family holds.
 *
 * Returns the worst verdict, not the best: a slot that sits beautifully beside
 * one appointment and clashes with another is a clash. A parent cannot attend
 * the one it fits.
 */
export function proximityOf(
  candidate: { startTime: string; endTime: string; date?: string | null },
  existing: ExistingAppointment[],
): Proximity {
  const cStart = toMinutes(candidate.startTime)
  const cEnd = toMinutes(candidate.endTime)
  if (cStart === null || cEnd === null) return { kind: 'none' }

  // A multi-day evening only constrains within a day. Where either side has no
  // date the evening is a single day and they are comparable.
  const sameDay = (e: ExistingAppointment) =>
    !candidate.date || !e.date || candidate.date === e.date

  let worst: Proximity = { kind: 'none' }
  const rank = { none: 0, ideal: 1, far: 2, tight: 3, clash: 4 }

  for (const e of existing.filter(sameDay)) {
    const eStart = toMinutes(e.startTime)
    const eEnd = toMinutes(e.endTime)
    if (eStart === null || eEnd === null) continue

    let verdict: Proximity
    if (cStart < eEnd && eStart < cEnd) {
      verdict = { kind: 'clash', withLabel: e.label }
    } else {
      const gap = cStart >= eEnd ? cStart - eEnd : eStart - cEnd
      if (gap < MIN_GAP_MINUTES) verdict = { kind: 'tight', gap, withLabel: e.label }
      else if (gap <= MAX_IDEAL_GAP_MINUTES) verdict = { kind: 'ideal', gap, withLabel: e.label }
      else verdict = { kind: 'far', gap, withLabel: e.label }
    }

    if (rank[verdict.kind] > rank[worst.kind]) worst = verdict
  }

  return worst
}

/** One line a parent can act on, or null where there is nothing to say. */
export function proximityMessage(p: Proximity): string | null {
  switch (p.kind) {
    case 'none':
      return null
    case 'clash':
      return `This overlaps your appointment with ${p.withLabel} — you can't attend both.`
    case 'tight':
      return p.gap === 0
        ? `This runs straight into your appointment with ${p.withLabel}, with no time to get between rooms.`
        : `Only ${p.gap} minutes between this and ${p.withLabel} — you may not make it between rooms.`
    case 'ideal':
      return `${p.gap} minutes after your appointment with ${p.withLabel}.`
    case 'far':
      return `${Math.round(p.gap / 5) * 5} minutes apart from ${p.withLabel} — there may be a closer slot.`
  }
}
