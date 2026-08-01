import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so the app build stays on the app's Vite copy
// (Vitest bundles its own). Only the pieces tests need are configured here.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    css: false,
  },
});
