import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'
import { primaryNavItems } from '@/components/layout/navigation'

/** Mobile-first bottom tab bar. Hidden on large screens (sidebar takes over). */
export function BottomNav() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-2">
        {primaryNavItems.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className="group flex flex-col items-center gap-1 py-2.5"
            >
              {({ isActive }) => (
                <>
                  <span className="relative grid h-8 w-14 place-items-center">
                    {isActive && (
                      <motion.span
                        layoutId="bottomnav-pill"
                        className="absolute inset-0 rounded-full bg-secondary"
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 32,
                        }}
                      />
                    )}
                    <item.icon
                      className={cn(
                        'relative h-[22px] w-[22px] transition-colors',
                        isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground group-active:text-foreground',
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      'text-[11px] font-medium transition-colors',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
