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
          // Purpose-built PWA icons, exported from the burgundy brand tile
          // (ios-icon-burgundy-1024.png): solid background (iOS-safe) with the
          // crest inside the maskable safe zone.
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512-maskable.png',
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
