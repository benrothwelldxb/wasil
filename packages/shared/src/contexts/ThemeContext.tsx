import React, { createContext, useContext, useEffect, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { useTenant } from './TenantContext'
import { config } from '../config'

interface ThemeColors {
  brandColor: string
  accentColor: string
  brandColorLight: string
}

interface ThemeContextType {
  schoolName: string
  shortName: string
  city: string
  tagline: string
  logoUrl: string
  logoIconUrl: string
  paymentUrl: string
  colors: ThemeColors
  isLoaded: boolean
}

// Default theme values (fallback when not authenticated)
const defaultTheme: ThemeContextType = {
  schoolName: config.defaultSchool.name,
  shortName: config.defaultSchool.shortName,
  city: config.defaultSchool.city,
  tagline: 'Stay Connected',
  logoUrl: '/school-logo.png',
  logoIconUrl: config.defaultSchool.wasilIcon,
  paymentUrl: '',
  colors: {
    brandColor: config.colors.burgundy,
    accentColor: config.colors.gold,
    brandColorLight: `${config.colors.burgundy}20`,
  },
  isLoaded: false,
}

const ThemeContext = createContext<ThemeContextType>(defaultTheme)

// Helper to create a lighter version of a color (with alpha)
function createLightColor(hexColor: string): string {
  return `${hexColor}20`
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const { tenant } = useTenant()

  const theme = useMemo<ThemeContextType>(() => {
    // Signed in: the parent's own school always wins.
    if (isAuthenticated && user?.school) {
      const school = user.school
      const brandColor = school.brandColor || config.colors.burgundy
      const accentColor = school.accentColor || config.colors.gold

      return {
        schoolName: school.name || config.defaultSchool.name,
        shortName: school.shortName || config.defaultSchool.shortName,
        city: school.city || config.defaultSchool.city,
        tagline: school.tagline || 'Stay Connected',
        logoUrl: school.logoUrl || '/school-logo.png',
        logoIconUrl: school.logoIconUrl || config.defaultSchool.wasilIcon,
        paymentUrl: school.paymentUrl || '',
        colors: {
          brandColor,
          accentColor,
          brandColorLight: createLightColor(brandColor),
        },
        isLoaded: true,
      }
    }

    // Pre-login on a school subdomain (e.g. vhpscoa.wasilconnect.com): brand the
    // sign-in page from the public tenant lookup.
    if (tenant) {
      const brandColor = tenant.brandColor || config.colors.burgundy
      const accentColor = tenant.accentColor || config.colors.gold

      return {
        schoolName: tenant.name || config.defaultSchool.name,
        shortName: tenant.shortName || config.defaultSchool.shortName,
        city: tenant.city || config.defaultSchool.city,
        tagline: tenant.tagline || 'Stay Connected',
        logoUrl: tenant.logoUrl || '/school-logo.png',
        logoIconUrl: tenant.logoIconUrl || config.defaultSchool.wasilIcon,
        paymentUrl: '',
        colors: {
          brandColor,
          accentColor,
          brandColorLight: createLightColor(brandColor),
        },
        isLoaded: true,
      }
    }

    // Root/platform host, or unknown slug: default Wasil branding.
    return defaultTheme
  }, [isAuthenticated, user?.school, tenant])

  // Apply CSS variables when theme changes
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--brand-color', theme.colors.brandColor)
    root.style.setProperty('--accent-color', theme.colors.accentColor)
    root.style.setProperty('--brand-color-light', theme.colors.brandColorLight)
  }, [theme.colors])

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
