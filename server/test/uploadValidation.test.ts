import { describe, it, expect } from 'vitest'
import { checkUpload } from '../src/services/uploadValidation'

const svg = (inner: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`)
const SVG = ['image/svg+xml']

// Guards L2: SVG uploads can't smuggle script/event-handler XSS into a context
// that might render them inline.
describe('checkUpload — SVG hardening', () => {
  it('rejects an SVG with an inline event handler (onload/onerror/…)', () => {
    expect(checkUpload(svg('<rect onload="steal()" />'), 'image/svg+xml', 'logo.svg', SVG).valid).toBe(false)
    expect(checkUpload(svg('<image onerror="x()" />'), 'image/svg+xml', 'logo.svg', SVG).valid).toBe(false)
  })

  it('rejects an SVG containing <script> or javascript:', () => {
    expect(checkUpload(svg('<script>alert(1)</script>'), 'image/svg+xml', 'logo.svg', SVG).valid).toBe(false)
    expect(checkUpload(svg('<a href="javascript:alert(1)">x</a>'), 'image/svg+xml', 'logo.svg', SVG).valid).toBe(false)
  })

  it('accepts a clean SVG', () => {
    expect(checkUpload(svg('<rect width="10" height="10" fill="red" />'), 'image/svg+xml', 'logo.svg', SVG).valid).toBe(true)
  })

  it('rejects a MIME not on the route allowlist', () => {
    expect(checkUpload(svg('<rect/>'), 'image/svg+xml', 'logo.svg', ['image/png']).valid).toBe(false)
  })
})
