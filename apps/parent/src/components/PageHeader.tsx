import React from 'react'
import { useTheme } from '@wasil/shared'

export function PageLogo() {
  const theme = useTheme()

  return (
    <div className="mb-2">
      {theme.logoUrl ? (
        <img
          src={theme.logoUrl}
          alt={theme.schoolName}
          style={{ height: '36px', borderRadius: '10px', objectFit: 'contain' }}
          onError={(e) => {
            e.currentTarget.onerror = null
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <img
          src="/wasil-icon.png"
          alt="Wasil"
          style={{ height: '36px', width: '36px', borderRadius: '10px' }}
        />
      )}
    </div>
  )
}
