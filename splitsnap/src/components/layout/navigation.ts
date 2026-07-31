import type { LucideIcon } from 'lucide-react'
import { Home, Camera, ReceiptText, Users, Settings } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Show in the primary (bottom / sidebar) navigation. */
  primary?: boolean
  end?: boolean
}

/**
 * Single source of truth for the app's routes and navigation.
 * The flow — Home → Scan → Review → Split — mirrors the product journey.
 */
export const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, primary: true, end: true },
  { to: '/scan', label: 'Scan', icon: Camera, primary: true },
  { to: '/review', label: 'Review', icon: ReceiptText, primary: true },
  { to: '/split', label: 'Split', icon: Users, primary: true },
  { to: '/settings', label: 'Settings', icon: Settings, primary: true },
]

export const primaryNavItems = navItems.filter((item) => item.primary)
