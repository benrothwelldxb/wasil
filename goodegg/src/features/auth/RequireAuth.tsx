import { Navigate, useLocation } from 'react-router-dom'
import { provider } from '@/data'
import { useCurrentProfile } from '@/data/hooks'
import { Loading } from '@/components/ui/states'

/**
 * Gate for routes that need a signed-in user. The local demo provider is always
 * "signed in" (as Ben), so the gate is a pass-through there; for real backends
 * (api / supabase) an unauthenticated visitor is sent to /signin with a return path.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const me = useCurrentProfile()

  if (provider.kind === 'local') return <>{children}</>
  if (me.isLoading) return <div className="mx-auto max-w-app"><Loading /></div>
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/signin?next=${next}`} replace />
  }
  return <>{children}</>
}
