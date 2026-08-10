import type { DataProvider } from './provider'
import { LocalProvider } from './localProvider'
import { SupabaseProvider } from './supabaseProvider'

export type { DataProvider } from './provider'
export type { CreateGroupInput, BuddyProfileInput, ReceivedQuestion } from './provider'

function create(): DataProvider {
  const kind = import.meta.env.VITE_DATA_PROVIDER ?? 'local'
  if (kind === 'supabase') return new SupabaseProvider()
  return new LocalProvider()
}

/** The app-wide data provider. The UI never imports a concrete implementation. */
export const provider: DataProvider = create()

/** Wipe the in-browser demo database (local provider only). */
export function resetDemo(): void {
  if (provider.kind === 'local') (provider as LocalProvider).reset()
}
