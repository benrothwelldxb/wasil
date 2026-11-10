/**
 * The page a tapped notification should open, or null.
 *
 * The route arrives in a push payload, so it is only ever followed when it is a
 * path in this app: "/this-week", never "https://elsewhere" or "//elsewhere",
 * which a browser would read as another site.
 */
export function pushRoute(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const route = raw.trim()
  if (!route.startsWith('/') || route.startsWith('//') || route.startsWith('/\\')) return null
  return route
}
