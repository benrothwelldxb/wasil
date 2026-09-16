/**
 * Markdown → plain text, for push/email bodies built from a markdown source.
 *
 * Weekly updates are authored as markdown, so the notification preview would
 * otherwise read "**Sports Day** is on - Friday". Notifications have no
 * formatting to give, so the markers have to come out rather than ship.
 *
 * This is a deliberate twin of `stripMarkdown` in
 * `packages/shared/src/components/RichText.tsx`: the server does not depend on
 * `@wasil/shared` (see server/package.json), and adding that dependency to pull
 * in one pure function would drag a React package into the API. Keep the two in
 * step if either changes.
 */
export function stripMarkdown(input: string): string {
  if (!input) return ''
  return (
    input
      // Links: keep the label, drop the target. First, so @mention chips read
      // as "@Rob Davies" rather than as a URL.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Emphasis markers, longest run first so **bold** leaves no stray *.
      .replace(/(\*\*\*|___)(.*?)\1/g, '$2')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Leading list markers, blockquotes and headings, per line.
      .replace(/^[ \t]*([-*+]|\d+\.)[ \t]+/gm, '')
      .replace(/^[ \t]*[>#]+[ \t]*/gm, '')
      // Collapse the blank lines that separate markdown paragraphs.
      .replace(/\s*\n\s*\n\s*/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  )
}

/**
 * Repair markdown that has been round-tripped through machine translation.
 *
 * Google Translate is called with `format: 'text'`, so it treats `**` and `[](
 * )` as ordinary punctuation and routinely pads them — "**Friday**" comes back
 * as "** Friday **", which react-markdown does not read as emphasis, so the
 * parent sees literal asterisks. Before weekly updates carried formatting this
 * could not happen; without this repair, adding formatting would be a visible
 * regression for exactly the families who rely on translation.
 *
 * Only the padding is corrected. If a translation mangles a marker beyond
 * recognition the text still reads fine — `unwrapDisallowed` renders the
 * leftovers as plain text rather than swallowing them.
 */
export function repairTranslatedMarkdown(input: string): string {
  if (!input) return ''
  return (
    input
      // "** bold **" → "**bold**" (also ***, __, ___); the inner capture is
      // non-greedy and must not start/end with whitespace after trimming.
      .replace(/(\*\*\*|___|\*\*|__)[ \t]+([^\n]*?)[ \t]+\1/g, '$1$2$1')
      .replace(/(\*\*\*|___|\*\*|__)[ \t]+([^\n]*?)\1/g, '$1$2$1')
      .replace(/(\*\*\*|___|\*\*|__)([^\n]*?)[ \t]+\1/g, '$1$2$1')
      // "[ label ] ( /url )" → "[label](/url)". Whitespace between the bracket
      // groups breaks the link outright, so it matters more than emphasis.
      .replace(/\[[ \t]*([^\]\n]*?)[ \t]*\][ \t]*\([ \t]*([^)\n]*?)[ \t]*\)/g, '[$1]($2)')
      // Single-marker italics are riskier: a lone `*` is also a bullet and a
      // multiplication sign. So this only fires when the run is delimited like
      // prose (whitespace or an opener before, punctuation or end after) AND
      // contains a letter — which leaves "2 * 3 * 4" alone.
      // The run must also be at least two characters, so "5 * x * 2" keeps its
      // multiplication signs while "* Rob *" becomes italic.
      .replace(
        /(^|[\s(])([*_])[ \t]*(?=[^\n*_]*[A-Za-z\u00C0-\u024F\u0600-\u06FF])([^\n*_\s][^\n*_]*?[^\n*_\s])[ \t]*\2(?=[\s.,;:!?)]|$)/g,
        '$1$2$3$2'
      )
      // Some locales return a full-width asterisk for the ASCII one.
      .replace(/＊/g, '*')
  )
}
