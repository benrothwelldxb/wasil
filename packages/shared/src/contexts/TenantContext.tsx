import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { publicTenant, type TenantBranding } from '../services/api'
import { resolveTenantSlug } from '../services/tenant'

// Resolves the current school (tenant) from the hostname BEFORE login and fetches
// its public branding, so the sign-in page can paint itself in the school's
// colours. Post-login, ThemeContext switches to the authenticated user's own
// school. On the root/platform hosts there's no slug → tenant stays null → the
// app falls back to default Wasil branding (and, later, the school picker).
interface TenantContextValue {
  slug: string | null
  tenant: TenantBranding | null
  isLoading: boolean
}

const TenantContext = createContext<TenantContextValue>({ slug: null, tenant: null, isLoading: false })

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const slug = useMemo(() => resolveTenantSlug(), [])
  const [tenant, setTenant] = useState<TenantBranding | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(!!slug)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    publicTenant
      .get(slug)
      .then((b) => { if (!cancelled) setTenant(b) })
      .catch(() => { if (!cancelled) setTenant(null) }) // unknown slug → no branding
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [slug])

  const value = useMemo(() => ({ slug, tenant, isLoading }), [slug, tenant, isLoading])
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  return useContext(TenantContext)
}
