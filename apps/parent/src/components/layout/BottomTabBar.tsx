import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Home, MoreVertical, Calendar, CalendarDays, CalendarCheck, CalendarClock,
  Megaphone, ClipboardCheck, Star, Sparkles, Clock, UtensilsCrossed,
  MessageCircle, BookOpen, type LucideIcon,
} from 'lucide-react'
import { useApi } from '@wasil/shared'
import {
  PARENT_BOTTOM_NAV_CATALOG, DEFAULT_BOTTOM_NAV_KEYS, isNavItemAvailable,
} from '@wasil/shared'
import * as api from '@wasil/shared'
import type { SchoolSettings, BottomNavKey } from '@wasil/shared'

interface BottomTabBarProps {
  onMorePress: () => void
}

// One icon per catalog destination — kept here (not in the shared catalog) so the
// shared package stays free of a lucide dependency.
const NAV_ICONS: Record<BottomNavKey, LucideIcon> = {
  events: Calendar,
  termDates: CalendarDays,
  principalUpdates: Megaphone,
  attendance: ClipboardCheck,
  timetable: CalendarClock,
  activities: Star,
  consultations: CalendarCheck,
  schoolServices: Clock,
  lunchMenu: UtensilsCrossed,
  clubs: Sparkles,
  messages: MessageCircle,
  resources: BookOpen,
}

type Tab = { icon: LucideIcon; label: string; path: string | null }

// Resolve the three middle tabs from the school's saved choice, honouring module
// toggles: keep the admin's order, drop anything whose module is off, then
// backfill toward three from the default set so the bar never looks half-empty.
function resolveMiddleTabs(settings: SchoolSettings | null | undefined): Tab[] {
  const flags = settings // SchoolSettings extends SchoolModuleFlags
  const isOn = (key: BottomNavKey) => {
    const item = PARENT_BOTTOM_NAV_CATALOG.find(i => i.key === key)
    if (!item) return false
    // Before settings load, assume available (matches the app's default bar).
    return flags ? isNavItemAvailable(item, flags) : true
  }

  const chosen = (settings?.bottomNavItems && settings.bottomNavItems.length > 0)
    ? settings.bottomNavItems
    : DEFAULT_BOTTOM_NAV_KEYS

  const keys: BottomNavKey[] = []
  const add = (k: BottomNavKey) => { if (!keys.includes(k) && isOn(k) && keys.length < 3) keys.push(k) }
  chosen.forEach(add)
  // Backfill to three: prefer the defaults, then anything else available.
  if (keys.length < 3) DEFAULT_BOTTOM_NAV_KEYS.forEach(add)
  if (keys.length < 3) PARENT_BOTTOM_NAV_CATALOG.forEach(i => add(i.key))

  return keys.map(k => {
    const item = PARENT_BOTTOM_NAV_CATALOG.find(i => i.key === k)!
    return { icon: NAV_ICONS[k], label: item.label, path: item.path }
  })
}

export function BottomTabBar({ onMorePress }: BottomTabBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  // One fetch per session (the bar stays mounted across route changes). Falls
  // back to the default bar while loading or if the request fails.
  const { data: settings } = useApi<SchoolSettings>(() => api.schoolSettings.get(), [])

  const tabs: Tab[] = [
    { icon: Home, label: 'Home', path: '/' },
    ...resolveMiddleTabs(settings),
    { icon: MoreVertical, label: 'More', path: null },
  ]

  const isActive = (path: string | null) => {
    if (path === null) return false
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const handlePress = (path: string | null) => {
    if (path === null) {
      onMorePress()
    } else {
      navigate(path)
    }
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 frosted-glass safe-area-bottom"
      style={{
        borderTop: '1px solid #F0E4E6',
      }}
    >
      <div className="flex items-center justify-around" role="tablist" style={{ height: '60px' }}>
        {tabs.map((tab) => {
          const active = isActive(tab.path)
          const Icon = tab.icon
          return (
            <button
              key={tab.label}
              onClick={() => handlePress(tab.path)}
              role="tab"
              aria-selected={active}
              aria-label={tab.label}
              className="flex flex-col items-center justify-center relative"
              style={{
                minWidth: '48px',
                minHeight: '48px',
                padding: '4px 12px',
              }}
            >
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: active ? '#FFF0F3' : 'transparent',
                  transition: 'background-color 0.2s ease',
                }}
              >
                <Icon
                  className="h-5 w-5"
                  style={{
                    color: active ? '#C4506E' : '#A8929A',
                    transition: 'color 0.2s ease',
                  }}
                  strokeWidth={active ? 2.5 : 2}
                />
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: active ? '#C4506E' : '#A8929A',
                  marginTop: '2px',
                  transition: 'color 0.2s ease',
                }}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
