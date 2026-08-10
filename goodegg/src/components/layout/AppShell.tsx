import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

/**
 * The participant app column. Constrained to a phone-friendly max width and
 * centred on larger screens (desktop never just stretches mobile cards).
 */
export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col bg-cream-100">
      <main className="flex-1 px-4 pb-28 pt-3 safe-top">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
