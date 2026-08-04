import { defineConfig, type UserConfig } from 'vite';
import type { InlineConfig } from 'vitest/node';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const test: InlineConfig = {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  coverage: {
    provider: 'v8',
    // Logic + platform layers held to coverage thresholds. Presentational
    // components (features/*, components/shared/*, components/ui/*) get
    // behaviour + a11y tests but are not held to a line-coverage %; broader UI
    // coverage is a Phase Two item (see docs/conventions/testing.md).
    include: [
      'src/domain/**',
      'src/data/synthetic/**',
      'src/data/adapters/**',
      'src/data/cache/**',
      'src/data/engine/**',
      'src/data/hotels/**',
      'src/data/journey-score/**',
      'src/data/normalise/**',
      'src/data/stopover/**',
      'src/lib/**',
      'src/config/**',
      'src/stores/**',
      'src/hooks/**',
    ],
    thresholds: {
      lines: 80,
      functions: 80,
      statements: 80,
      branches: 70,
    },
  },
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We register the service worker ourselves via `virtual:pwa-register`
      // in src/main.tsx (in-bundle, same-origin) so no inline registration
      // script needs to be injected into index.html — that keeps CSP at a
      // strict `script-src 'self'` with no unsafe-inline/hash.
      injectRegister: null,
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      manifest: {
        name: 'RouteCraft',
        short_name: 'RouteCraft',
        description:
          'RouteCraft — discover the best overall travel experience within your budget, not just the cheapest flight.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0d1417',
        background_color: '#0d1417',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The app's journey engine is fully client-side/deterministic, so
        // precaching the shell and falling back to it for all navigations
        // makes deep links (e.g. /results, /journeys/:id) load offline too.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'motion-vendor': ['framer-motion'],
          // NOTE: any shared code imported by both the results list and the
          // journey detail view (e.g. journey badge/score-chip components)
          // gets auto-chunked by Rollup under a name derived from one of its
          // entry modules (observed as "journey-badges") — that name is an
          // artifact of Rollup's chunk-naming heuristic, not a deliberate
          // "badges-only" chunk; it's the shared results/detail bundle.
        },
      },
    },
  },
  test,
} as UserConfig & { test: InlineConfig });
