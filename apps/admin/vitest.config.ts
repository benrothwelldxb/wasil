import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Frontend interaction tests for the Operations Console. jsdom + Testing
// Library give genuine click tests; the API client (`api.ops`) is stubbed per
// test so we exercise real component behaviour (search, confirm, toast) without
// a backend. MSW is available for a future full-integration layer.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
