/** YYYY-MM-DD plus n days. Calendar arithmetic only: the date is the school's,
 *  so no timezone is applied. */
export function addDaysISO(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * What a hidden fixture card was showing when it was hidden. The card stays
 * hidden only while this is unchanged: a new update from the school, or the
 * fixture being cancelled, postponed or back on, brings it back, because that
 * is news the parent has not seen.
 */
export function fixtureCardSignature(card: {
  item: { status?: string | null } | null
  updates: { sentAt: string }[]
}): string {
  const lastUpdate = card.updates.reduce((latest, u) => (u.sentAt > latest ? u.sentAt : latest), '')
  return `${card.item?.status ?? ''}|${card.updates.length}|${lastUpdate}`
}

export function fixtureCardKey(card: { studentId: string; fixtureId: string }): string {
  return `${card.studentId}:${card.fixtureId}`
}

const HIDDEN_KEY = 'wasil.fixtureDay.hidden'

export type HiddenFixtureCards = Record<string, { sig: string; date: string | null }>

/** Hidden cards, this device only. Storage can be missing or throw (private
 *  mode); then nothing is hidden, which errs toward showing the fixture. */
export function readHiddenFixtureCards(): HiddenFixtureCards {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Saves, dropping cards for fixtures more than two days past so the list
 *  never grows. */
export function writeHiddenFixtureCards(hidden: HiddenFixtureCards, today: string): void {
  const cutoff = addDaysISO(today, -2)
  const kept = Object.fromEntries(Object.entries(hidden).filter(([, v]) => !v.date || v.date >= cutoff))
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(kept))
  } catch {
    /* not saved: the card returns next time, which is safe */
  }
}
