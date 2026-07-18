import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The source uses NodeNext-style `.js` extensions on relative imports
    // (e.g. `import prisma from './prisma.js'`). Rewrite those to extensionless
    // so Vite/Vitest resolves them to the real `.ts` files — and so vi.mock()
    // ids line up with what the source actually imports.
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})
