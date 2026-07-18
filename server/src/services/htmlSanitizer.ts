import sanitizeHtml from 'sanitize-html'

/**
 * Sanitize user-authored rich text (message bodies, knowledge articles, etc.)
 * before it is stored and later rendered with dangerouslySetInnerHTML.
 *
 * We keep the formatting tags the rich-text editor can produce, but strip
 * anything that can execute: <script>, event-handler attributes (onerror,
 * onload, …), javascript: URLs, <style>, <iframe>, and inline styles. This is
 * the authoritative XSS defense — clients render the stored HTML directly, so
 * everything must be safe by the time it lands in the database.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'span', 'div',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'mark',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'hr',
]

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    // Allow the editor's text-align / list markers, but not arbitrary style.
    '*': ['class'],
  },
  // Only safe URL schemes; this drops javascript:, data:, vbscript: hrefs.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto', 'tel'] },
  disallowedTagsMode: 'discard',
  // Force external links to open safely.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' }),
  },
}

export function sanitizeRichText(html: string): string {
  if (typeof html !== 'string') return ''
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}
