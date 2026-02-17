import React from 'react'
import { config } from '@wasil/shared'
import { useTheme } from '@wasil/shared'

export function Footer() {
  const theme = useTheme()
  const { defaultSchool } = config
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-12 py-6 border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
        <p className="text-sm text-gray-500">
          {currentYear} {theme.schoolName}
        </p>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Powered by</span>
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
