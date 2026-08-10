import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Minimal global client state. Server data lives in TanStack Query; this only
 * holds the "which group am I looking at" pointer and lightweight UI prefs.
 */
interface SessionState {
  activeGroupId: string | null
  setActiveGroup: (id: string | null) => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      activeGroupId: null,
      setActiveGroup: (id) => set({ activeGroupId: id }),
    }),
    { name: 'goodegg.session' },
  ),
)
