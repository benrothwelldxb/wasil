/**
 * Staff @mentions inside markdown bodies.
 *
 * A mention is stored as an ordinary markdown link whose target is the parent
 * app's own compose route:
 *
 *     [@Rob Davies](/inbox/new?staff=clx123abc)
 *
 * Nothing bespoke is invented. That matters in three ways:
 *
 *  - Any markdown renderer already handles it, so a mention degrades to the
 *    staff member's name rather than to syntax if it is ever rendered
 *    elsewhere (a digest email, Desk, a plain-text export).
 *  - `stripMarkdown` already reduces it to "@Rob Davies" for push bodies.
 *  - The link target IS the behaviour — no lookup table, no second source of
 *    truth about where a tag should go.
 *
 * The display name is a snapshot taken at authoring time; the id is what
 * resolves. A staff member who changes their name keeps working links, and the
 * old name stays in the text that was actually published, which is the honest
 * record of what the school sent.
 */

/** The route a mention points at. Kept here so the writer and reader agree. */
export const MENTION_PATH = '/inbox/new'

/** Matches a mention link and captures the staff user id. */
const MENTION_RE = /\[@([^\]]*)\]\(\/inbox\/new\?staff=([A-Za-z0-9_-]+)\)/g

export interface ParsedMention {
  /** Staff user id — the part that actually resolves. */
  staffId: string
  /** Display name as it was when the author inserted it. */
  name: string
}

/** Build the markdown for a mention. */
export function buildMention(staffId: string, name: string): string {
  // Brackets in a name would terminate the link label early.
  const safeName = name.replace(/[[\]]/g, '').trim()
  return `[@${safeName}](${MENTION_PATH}?staff=${staffId})`
}

/** Every mention in a body, in document order, de-duplicated by staff id. */
export function parseMentions(content: string): ParsedMention[] {
  if (!content) return []
  const seen = new Set<string>()
  const out: ParsedMention[] = []
  for (const m of content.matchAll(MENTION_RE)) {
    const staffId = m[2]
    if (seen.has(staffId)) continue
    seen.add(staffId)
    out.push({ staffId, name: m[1] })
  }
  return out
}

/**
 * Is this link href a staff mention? Used by renderers to decide between a
 * mention chip and an ordinary link.
 */
export function mentionStaffId(href: string): string | null {
  if (!href) return null
  const match = /^\/inbox\/new\?staff=([A-Za-z0-9_-]+)$/.exec(href)
  return match ? match[1] : null
}
