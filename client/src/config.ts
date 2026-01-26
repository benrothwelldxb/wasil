export const config = {
  apiUrl: import.meta.env.VITE_API_URL || '',

  // White-label configuration (can be overridden per school)
  defaultSchool: {
    name: 'Victory Heights Primary School',
    shortName: 'VHPS',
    city: 'City of Arabia',
    brandColor: '#7f0029',
    accentColor: '#D4AF37',
    wasilIcon: '/logo.png',
    wasilLogoGrey: '/wasil-logo-grey.png',
    wasilLogoWhite: '/wasil-logo-white.png',
    showWasilBranding: true,
  },

  colors: {
    burgundy: '#7f0029',
    gold: '#D4AF37',
    cream: '#eeede7',
  },
}
