/**
 * A link whose words were never filled in shows the address instead.
 *
 * Desk's Link button writes `[text](https://…)` and selects "text" to type
 * over. When it was not typed over, parents were shown a link reading "text"
 * (the TeachRex and Winter Fayre posts, November 2026). A parent cannot tell
 * where "text" goes; the address itself they can. Only the placeholder words
 * the editors write, or an empty label, are replaced. A label anyone chose is
 * never touched.
 */
const PLACEHOLDER_LINK =
  /\[\s*(?:text|link text|link)?\s*\]\(\s*<?((?:https?:\/\/|mailto:|tel:)[^\s()<>]+)>?\s*\)/gi

export function linkDisplayText(url: string): string {
  return url
    .replace(/^(?:https?:\/\/|mailto:|tel:)/i, '')
    .replace(/\/$/, '')
}

export function repairPlaceholderLinkLabels(markdown: string): string {
  if (!markdown) return markdown
  return markdown.replace(PLACEHOLDER_LINK, (_m, url: string) => `[${linkDisplayText(url)}](${url})`)
}
