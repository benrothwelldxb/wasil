import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { BottomNav } from '@/components/layout/BottomNav'
import { DesktopSidebar } from '@/components/layout/DesktopSidebar'
import { Header } from '@/components/layout/Header'
import { RouteFallback } from '@/components/RouteFallback'

/**
 * App shell: sidebar on desktop, bottom tab bar on mobile, animated page
 * transitions in between. Every route renders inside this frame.
 */
export function AppLayout() {
  const location = useLocation()

  return (
    <div className="flex min-h-full w-full">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <DesktopSidebar />

      <div className="flex min-h-full w-full flex-1 flex-col">
        <Header />

        <main id="main" className="flex-1">
          {/* initial={false}: no fade on first load (keeps LCP fast), but
              navigation between routes still animates. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 lg:max-w-3xl lg:px-8 lg:pb-12"
            >
              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav />
      </div>
    </div>
  )
}
