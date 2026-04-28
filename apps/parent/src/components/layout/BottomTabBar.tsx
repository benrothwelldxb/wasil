import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Calendar, Star, BookOpen, MoreVertical } from 'lucide-react'

interface BottomTabBarProps {
  onMorePress: () => void
}

const tabs = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Calendar, label: 'Events', path: '/events' },
  { icon: Star, label: 'Activities', path: '/activities' },
  { icon: BookOpen, label: 'Resources', path: '/resources' },
  { icon: MoreVertical, label: 'More', path: null },
] as const

export function BottomTabBar({ onMorePress }: BottomTabBarProps) {
  const location = useLocation()
  const navigate = useNavigate()

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
