import React from 'react'
import { config } from '../config'

export function LoadingScreen() {
  const { defaultSchool } = config

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--brand-color)' }}
    >
      <div className="text-center">
        {/* School logo — primary element */}
        <img
          src="/school-logo.png"
          alt={defaultSchool.name}
          className="h-28 w-auto mx-auto mb-5"
          style={{ borderRadius: '16px', objectFit: 'contain' }}
          onError={(e) => {
            // Fallback to school name if logo fails
            e.currentTarget.style.display = 'none'
          }}
        />
        <h1 className="text-xl font-bold text-white mb-1">
          {defaultSchool.name}
        </h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {defaultSchool.city}
        </p>

        {/* Loading spinner */}
        <div className="mt-8 mb-8">
          <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto" style={{ borderWidth: '3px' }} />
        </div>

        {/* Powered by Wasil — small, at bottom */}
        {defaultSchool.showWasilBranding && defaultSchool.wasilLogoWhite && (
          <div className="flex items-center justify-center gap-2 opacity-50">
            <span className="text-[11px] text-white">Powered by</span>
            <img
              src={defaultSchool.wasilLogoWhite}
              alt="Wasil"
              className="h-4 w-auto"
            />
          </div>
        )}
      </div>
    </div>
  )
}
