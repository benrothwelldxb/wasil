import React from 'react'
import { Menu, X, BookOpen } from 'lucide-react'
import { config } from '@wasil/shared'
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'

interface HeaderProps {
  menuOpen: boolean
  onMenuToggle: () => void
}

export function Header({ menuOpen, onMenuToggle }: HeaderProps) {
  const { user } = useAuth()
  const theme = useTheme()
  const { defaultSchool } = config

  return (
    <header className="sticky top-0 z-50" style={{ backgroundColor: theme.colors.brandColor, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {theme.logoIconUrl ? (
            <img
              src={theme.logoIconUrl}
              alt={theme.schoolName}
              style={{ height: '48px', width: '48px' }}
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/logo.png'
              }}
            />
          ) : (
            <div style={{ backgroundColor: 'white', padding: '8px', borderRadius: '8px' }}>
              <BookOpen style={{ height: '32px', width: '32px', color: theme.colors.brandColor }} />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">{theme.schoolName}</h1>
            <div className="flex items-center space-x-2">
              <p className="text-sm" style={{ color: theme.colors.accentColor }}>
                {theme.city} - {theme.tagline}
              </p>
              {defaultSchool.showWasilBranding && (
                <>
                  <span className="text-xs text-white opacity-50">-</span>
                  <p className="text-xs text-white opacity-70">powered by Wasil</p>
                </>
              )}
            </div>
          </div>
        </div>
        {user && (
          <button
            onClick={onMenuToggle}
            className="p-2 rounded-lg text-white hover:bg-white hover:bg-opacity-10"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        )}
      </div>
    </header>
  )
}
