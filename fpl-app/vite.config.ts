import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "favicon-32.png",
        "favicon-16.png",
        "apple-touch-icon.png",
        "robots.txt",
      ],
      manifest: {
        name: "MyFPLScout — Fantasy Premier League Companion",
        short_name: "MyFPLScout",
        description:
          "Statistical projections, squad optimisation, and transfer planning for Fantasy Premier League.",
        theme_color: "#14245c",
        background_color: "#14245c",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Serve the SPA shell for client-side routes when offline.
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // FPL API responses — fresh when online, cached for offline use.
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "fpl-api",
              expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Player photos & club badges — cache-first (they rarely change).
            urlPattern: ({ url }) =>
              url.origin === "https://resources.premierleague.com",
            handler: "CacheFirst",
            options: {
              cacheName: "fpl-images",
              expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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
