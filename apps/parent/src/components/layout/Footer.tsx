import React from 'react'
import { config } from '@wasil/shared'
import { useTheme } from '@wasil/shared'

export function Footer() {
  const theme = useTheme()
  const { defaultSchool } = config
  const currentYear = new Date().getFullYear()

  // Footer is hidden on mobile (bottom tab bar is used instead).
  // Only shows when scrolled to the bottom on larger screens.
  return (
    <footer className="hidden md:block mt-12 py-6" style={{ borderTop: '1px solid #F0E4E6' }}>
      <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
        <p className="text-sm" style={{ color: '#A8929A' }}>
          {currentYear} {theme.schoolName}
        </p>
        <div className="flex items-center space-x-2">
          <span className="text-sm" style={{ color: '#A8929A' }}>Powered by</span>
          <img
            src={defaultSchool.wasilLogoGrey}
            alt="Wasil"
            className="h-4 w-auto opacity-60"
          />
        </div>
      </div>
    </footer>
  )
}
