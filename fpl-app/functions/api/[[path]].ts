/**
 * Cloudflare Pages Function — proxies `/api/*` to the public FPL API.
 *
 * In development Vite proxies `/api` (see vite.config.ts). In production this
 * Function does the same job on the deployed origin, so the browser makes a
 * same-origin request (no CORS) and this server-side fetch adds the
 * browser-like User-Agent the FPL API expects. The app keeps calling `/api/…`
 * unchanged.
 *
 * Matched before the `_redirects` SPA fallback, so only `/api/*` is proxied.
 */

const FPL_API = "https://fantasy.premierleague.com/api";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0 Safari/537.36";

interface Context {
  request: Request;
  params: { path?: string | string[] };
}

export async function onRequestGet(context: Context): Promise<Response> {
  const { request, params } = context;
  const path = Array.isArray(params.path)
    ? params.path.join("/")
    : (params.path ?? "");
  const search = new URL(request.url).search;

  const upstream = await fetch(`${FPL_API}/${path}${search}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      // Let Cloudflare's edge cache FPL responses briefly (eases rate limits).
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}
