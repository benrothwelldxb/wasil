// Resolve the tenant slug from the current hostname, for branded multi-tenant
// login. `<slug>.wasilconnect.com` → `slug`; the platform/root hosts (app, admin,
// api, provider, www) and any non-wasilconnect host → null (no tenant → default
// branding / school picker). A `?tenant=` query param overrides, for local and
// preview testing where the hostname carries no slug.
const RESERVED = new Set(['', 'app', 'admin', 'api', 'provider', 'www'])
const SUFFIX = '.wasilconnect.com'

export function resolveTenantSlug(): string | null {
  if (typeof window === 'undefined') return null

  const override = new URLSearchParams(window.location.search).get('tenant')
  if (override) return override.trim().toLowerCase() || null

  const host = window.location.hostname.toLowerCase()
  if (!host.endsWith(SUFFIX)) return null

  const label = host.slice(0, -SUFFIX.length)
  if (label.includes('.') || RESERVED.has(label)) return null
  return label
}
