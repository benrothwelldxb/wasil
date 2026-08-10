/**
 * Brand configuration — the single source of truth for the product name.
 *
 * The product is "elowa". Keeping the name here (and reading from this module
 * everywhere) means any future rename is a one-line change.
 */
export const BRAND = {
  name: 'elowa',
  tagline: 'Understand what’s changing.',
  /** One-line product promise. */
  promise: 'Track. Understand. Act.',
} as const;
