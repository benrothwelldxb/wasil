import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Mirrors packages/shared/src/config.ts (defaultSchool.name / shortName / brandColor).
// Kept as plain constants here rather than imported so the PWA manifest generation
// doesn't depend on bundling a workspace package inside the Vite config loader.
const SCHOOL_NAME = 'Victory Heights Primary School'
const SCHOOL_SHORT_NAME = 'VHPS'
const THEME_COLOR = '#FFF8F4' // matches the <meta name="theme-color"> in index.html
const BACKGROUND_COLOR = '#FFF8F4'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Web-only: the native iOS/Android builds are wrapped by Capacitor and
      // load the app from the bundled `dist` output, not a browser, so the
      // generated service worker is irrelevant there. Registration itself is
      // gated in src/main.tsx to skip Capacitor.isNativePlatform().
      injectRegister: null,
      manifest: {
        name: SCHOOL_NAME,
        short_name: SCHOOL_SHORT_NAME,
        description: 'Wasil - School Communication for Parents',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          // NOTE: these reuse existing brand assets as-is; none are pre-sized
          // to exactly 192x192 / 512x512, and none have maskable safe-zone
          // padding. Good enough for installability, but proper 192/512/
          // maskable PNG exports are a small recommended follow-on.
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/school-logo.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/school-logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Keep the precache manifest lean; runtime API calls stay network-only
        // for now (no offline caching strategy has been designed yet).
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
    },
  },
})
