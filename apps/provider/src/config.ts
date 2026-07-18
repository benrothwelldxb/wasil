export const config = {
  // Empty in dev — Vite proxies /provider and /api to the API server.
  // Set VITE_API_URL to the API origin for production builds.
  apiUrl: import.meta.env.VITE_API_URL || '',
}
