import { describe, it, expect } from 'vitest'
import { withConnectionLimit } from '../src/services/prisma'

/**
 * The size of the database connection pool.
 *
 * Prisma defaults to CPUs × 2 + 1 — three to five on a small container, for
 * the whole API. A consultation booking is six to eight queries, so three
 * hundred parents arriving when booking opens queue on that pool and then time
 * out. The slot is still free; the parent is told it failed.
 *
 * Tested because the failure is SILENT. A malformed connection string does not
 * throw: Prisma ignores what it cannot parse and quietly uses the default, so
 * a mistake here looks like nothing at all until an evening that should have
 * worked does not.
 */
describe('withConnectionLimit', () => {
  it('adds the limit to a plain connection string', () => {
    expect(withConnectionLimit('postgresql://u:p@host:5432/db', 15))
      .toBe('postgresql://u:p@host:5432/db?connection_limit=15')
  })

  // Railway's URL already carries parameters, so appending a second `?` would
  // produce a string Prisma parses as having no limit at all.
  it('appends with & when the URL already has a query string', () => {
    expect(withConnectionLimit('postgresql://u:p@host:5432/db?sslmode=require', 15))
      .toBe('postgresql://u:p@host:5432/db?sslmode=require&connection_limit=15')
  })

  // Someone who has tuned this deliberately, or who is running behind a
  // pooler that manages connections itself, must not be overridden by us.
  it('leaves an explicit limit alone', () => {
    const url = 'postgresql://u:p@host:5432/db?connection_limit=5'
    expect(withConnectionLimit(url, 15)).toBe(url)
  })

  it('leaves an explicit limit alone even among other params', () => {
    const url = 'postgresql://u:p@host:5432/db?sslmode=require&connection_limit=1&foo=bar'
    expect(withConnectionLimit(url, 15)).toBe(url)
  })

  // An absent DATABASE_URL is a deployment problem, and it should surface as
  // Prisma's own clear error rather than as a string reading "undefined?...".
  it('passes undefined straight through rather than inventing a URL', () => {
    expect(withConnectionLimit(undefined)).toBeUndefined()
  })

  it('passes an empty string through untouched', () => {
    expect(withConnectionLimit('')).toBe('')
  })
})
