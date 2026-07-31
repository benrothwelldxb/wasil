import { useLocation } from 'react-router-dom'

import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { navItems } from '@/components/layout/navigation'

function useCurrentTitle() {
  const { pathname } = useLocation()
  const match = navItems.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )
  return match?.label ?? 'SplitSnap'
}

/**
 * Top bar. On mobile it shows the current section title; on desktop the
 * sidebar carries navigation so the header stays minimal.
 */
export function Header() {
  const title = useCurrentTitle()

  return (
    <header className="safe-top sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4 lg:max-w-none lg:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        <h1 className="hidden text-base font-semibold lg:block">{title}</h1>
        <ThemeToggle />
      </div>
    </header>
  )
}
