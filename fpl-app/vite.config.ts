import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into their own cacheable chunks.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query", "@tanstack/react-virtual"],
          "form-vendor": ["zod", "react-hook-form"],
          "icons-vendor": ["lucide-react"],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy the API layer to the public FPL API in development.
      // Keeps the FPL host out of client code and avoids browser CORS errors.
      // `VITE_API_BASE_URL` defaults to `/api`, so requests hit this proxy.
      "/api": {
        target: "https://fantasy.premierleague.com",
        changeOrigin: true,
        secure: true,
        headers: {
          // FPL rejects requests without a browser-like User-Agent.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        },
      },
    },
  },
});
