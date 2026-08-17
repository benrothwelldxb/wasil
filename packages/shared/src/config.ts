export const config = {
  apiUrl: import.meta.env.VITE_API_URL || '',

  // White-label configuration (can be overridden per school). When the parent
  // app becomes multi-tenant, this whole block (name, logos, supportEmail)
  // should be sourced per-tenant — e.g. a public branding endpoint keyed on the
  // request domain — rather than hard-coded here. Keeping supportEmail in this
  // one seam means it rides along with the rest of the branding at that point,
  // instead of being scattered as a literal in a component.
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
    // Shown on the parent login when a code isn't arriving.
    supportEmail: 'moureen@vhprimarycoa.ae',
  },

  colors: {
    burgundy: '#7f0029',
    gold: '#D4AF37',
    cream: '#eeede7',
  },
}
