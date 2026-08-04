import { defineConfig, type UserConfig } from 'vite';
import type { InlineConfig } from 'vitest/node';
import react from '@vitejs/plugin-react';
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
      'src/data/normalise/**',
      'src/lib/**',
      'src/config/**',
      'src/stores/**',
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
  plugins: [react()],
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
        },
      },
    },
  },
  test,
} as UserConfig & { test: InlineConfig });
