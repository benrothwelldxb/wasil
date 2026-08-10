/** Small, dependency-free helpers shared across the app. */

/** Crypto-strong id when available, with a safe fallback for older engines. */
export function uid(prefix = ''): string {
  const c = globalThis.crypto
  if (c && 'randomUUID' in c) return prefix + c.randomUUID()
  return prefix + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const JOIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no confusable 0/O/1/I/L

/** Human-friendly, hard-to-mistype join code, e.g. "K7PMQX". */
export function makeJoinCode(len = 6): string {
  const c = globalThis.crypto
  let out = ''
  if (c && 'getRandomValues' in c) {
    const buf = new Uint32Array(len)
    c.getRandomValues(buf)
    for (let i = 0; i < len; i++) out += JOIN_ALPHABET[buf[i]! % JOIN_ALPHABET.length]
  } else {
    for (let i = 0; i < len; i++)
      out += JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)]
  }
  return out
}

export function joinUrl(code: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://beagoodegg.app'
  return `${origin}/join/${code}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** e.g. "10 Aug 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Compact relative time, e.g. "2h ago", "3d ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return formatDate(iso)
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/** Deterministic pastel avatar background from a seed. */
const AVATAR_BGS = ['#EEE7F7', '#E7F0E4', '#FDF3D6', '#FCE3DD', '#FDF0E6', '#F0E9D8'] as const
export function avatarBg(seed: string | null | undefined): string {
  const s = seed ?? 'egg'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_BGS[h % AVATAR_BGS.length]!
}

export function pluralise(n: number, one: string, many = one + 's'): string {
  return n === 1 ? one : many
}
