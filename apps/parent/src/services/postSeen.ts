import { api } from '@wasil/shared'

/**
 * Reports posts that have been on screen, so the school can see who has seen a
 * post. Batched: a scroll down the dashboard passes several cards at once, and
 * one request per card would be a burst of near-identical calls.
 *
 * Best effort. A failed report is retried with the next batch rather than
 * surfaced — this is the school's statistic, not something the parent asked
 * for, so it must never show them an error. Ids reported this session are
 * remembered so a post scrolled past twice is sent once.
 */
const FLUSH_DELAY_MS = 2000

const reported = new Set<string>()
const pending = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  if (pending.size === 0) return
  const ids = [...pending].slice(0, 50)
  ids.forEach(id => pending.delete(id))
  try {
    await api.messages.markSeen(ids)
    ids.forEach(id => reported.add(id))
  } catch {
    ids.forEach(id => pending.add(id))
  }
  if (pending.size > 0 && !timer) timer = setTimeout(flush, FLUSH_DELAY_MS)
}

export function reportPostSeen(id: string) {
  if (reported.has(id) || pending.has(id)) return
  pending.add(id)
  if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS)
}
