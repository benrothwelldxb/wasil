/**
 * Cloudflare Worker entry — for the Workers Static Assets deploy
 * (…workers.dev). It:
 *   - proxies `/api/*` to the public FPL API (adds the browser-like
 *     User-Agent, brief edge caching), and
 *   - serves the built SPA from the ASSETS binding, with client-side routing
 *     fallback via `not_found_handling: single-page-application`.
 *
 * This is the Workers counterpart of `functions/api/[[path]].ts`, which only
 * runs on Cloudflare *Pages*. Configured by `wrangler.jsonc`.
 */

const FPL_API = "https://fantasy.premierleague.com/api";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0 Safari/537.36";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const path = url.pathname.slice("/api/".length);
      const upstream = await fetch(`${FPL_API}/${path}${url.search}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") ?? "application/json",
          "cache-control": "public, max-age=60, s-maxage=60",
        },
      });
    }

    // Everything else: static assets, with SPA fallback to index.html.
    return env.ASSETS.fetch(request);
  },
};
