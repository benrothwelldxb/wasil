/**
 * Privacy-first, cookieless analytics — no personal data, no consent banner.
 *
 * Two optional providers, both enabled purely by environment variables (so the
 * code ships doing nothing until you add a token):
 *
 * - **Cloudflare Web Analytics** (`VITE_CF_BEACON_TOKEN`): visitors, page views,
 *   referrers, countries. Ideal for launch traction (see where traffic comes
 *   from). Auto-tracks the SPA.
 * - **Plausible** (`VITE_PLAUSIBLE_DOMAIN`, optional): adds custom events
 *   (team imported, shared, installed…) via `track()`. Also cookieless.
 *
 * Nothing here collects names, emails, or Manager IDs.
 */
import { env } from "./env";

type Props = Record<string, string | number | boolean>;

interface PlausibleFn {
  (event: string, options?: { props?: Props }): void;
  q?: unknown[];
}

function plausible(): PlausibleFn | undefined {
  return (window as unknown as { plausible?: PlausibleFn }).plausible;
}

let initialized = false;

/** Inject the configured analytics beacons. Safe to call once, on startup. */
export function initAnalytics(): void {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  if (env.cfBeaconToken) {
    const s = document.createElement("script");
    s.defer = true;
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute(
      "data-cf-beacon",
      JSON.stringify({ token: env.cfBeaconToken, spa: true }),
    );
    document.head.appendChild(s);
  }

  if (env.plausibleDomain) {
    // Queue shim so track() works before the script finishes loading.
    const w = window as unknown as { plausible?: PlausibleFn };
    w.plausible =
      w.plausible ||
      (((...args: unknown[]) => {
        (w.plausible!.q = w.plausible!.q || []).push(args);
      }) as PlausibleFn);

    const s = document.createElement("script");
    s.defer = true;
    s.setAttribute("data-domain", env.plausibleDomain);
    s.src = `${env.plausibleHost}/js/script.js`;
    document.head.appendChild(s);
  }
}

/**
 * Record a privacy-safe custom event (no PII). No-op unless an events-capable
 * provider (Plausible) is configured.
 */
export function track(event: string, props?: Props): void {
  const p = plausible();
  if (p) p(event, props ? { props } : undefined);
}
