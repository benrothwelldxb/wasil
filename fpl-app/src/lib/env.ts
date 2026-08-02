/**
 * Centralised, typed access to environment configuration.
 *
 * Vite exposes env vars prefixed with `VITE_` on `import.meta.env`. Reading
 * them here (instead of scattering `import.meta.env` across the codebase)
 * gives us a single place to apply defaults, coercion, and validation.
 */

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  /** Base URL for the API layer. */
  apiBaseUrl: readString(import.meta.env.VITE_API_BASE_URL, "/api"),
  /** Timeout applied to outgoing API requests, in milliseconds. */
  apiTimeout: readNumber(import.meta.env.VITE_API_TIMEOUT, 15_000),
  /** Cloudflare Web Analytics beacon token (cookieless). Empty = disabled. */
  cfBeaconToken: readString(import.meta.env.VITE_CF_BEACON_TOKEN, ""),
  /** Plausible domain for optional cookieless custom events. Empty = disabled. */
  plausibleDomain: readString(import.meta.env.VITE_PLAUSIBLE_DOMAIN, ""),
  /** Plausible host (self-hosted or plausible.io). */
  plausibleHost: readString(
    import.meta.env.VITE_PLAUSIBLE_HOST,
    "https://plausible.io",
  ),
  /** Whether the app is running in development mode. */
  isDev: import.meta.env.DEV,
  /** Whether the app is running in a production build. */
  isProd: import.meta.env.PROD,
} as const;

export type Env = typeof env;
