import { defineConfig } from 'vitest/config'

// Integration tests run against a REAL Postgres (they do not mock Prisma), so
// they are kept separate from the default `npm test` unit suite and only run
// where DATABASE_URL points at a throwaway database (CI, or local dev with one).
export default defineConfig({
  resolve: {
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }],
  },
  test: {
    environment: 'node',
    include: ['test/integration/**/*.itest.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    // DB writes serialize on shared tables — avoid cross-file races.
    fileParallelism: false,
    hookTimeout: 30000,
  },
})
