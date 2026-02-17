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
        {defaultSchool.wasilLogoWhite ? (
          <img
            src={defaultSchool.wasilLogoWhite}
            alt="Wasil"
            className="h-24 w-auto mx-auto mb-6 animate-pulse"
          />
        ) : (
          <div className="text-6xl text-white mb-6 animate-pulse">W</div>
        )}
        <h1 className="text-2xl font-bold text-white mb-2">
          {defaultSchool.name}
        </h1>
        <p className="text-sm" style={{ color: 'var(--accent-color)' }}>
          {defaultSchool.city}
        </p>
        <div className="mt-8">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    </div>
  )
}
