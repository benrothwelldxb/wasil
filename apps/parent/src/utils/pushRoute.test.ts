import { describe, expect, it } from 'vitest'
import { pushRoute } from './pushRoute'

describe('which page a tapped notification opens', () => {
  it('follows a path in the app', () => {
    expect(pushRoute('/this-week')).toBe('/this-week')
    expect(pushRoute('/inbox/abc')).toBe('/inbox/abc')
  })

  it('never leaves the app', () => {
    expect(pushRoute('https://example.com')).toBeNull()
    expect(pushRoute('//example.com/this-week')).toBeNull()
    expect(pushRoute('/\\example.com')).toBeNull()
    expect(pushRoute('javascript:alert(1)')).toBeNull()
  })

  it('ignores anything that is not a path', () => {
    expect(pushRoute(undefined)).toBeNull()
    expect(pushRoute('')).toBeNull()
    expect(pushRoute(42)).toBeNull()
  })
})
