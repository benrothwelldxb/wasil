// Post-build: create dist/404.html as a copy of the app shell so Cloudflare
// Pages serves the SPA for deep-link first loads (before the service worker is
// installed). Avoids the `_redirects` "infinite loop" validator entirely.
// After the SW registers, its navigateFallback serves index.html (200) on
// refresh. Cross-platform (Node, no shell `cp`).
import { copyFileSync, existsSync } from "node:fs";

const src = "dist/index.html";
const dest = "dist/404.html";

if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log(`[copy-404] ${src} -> ${dest}`);
} else {
  console.warn(`[copy-404] ${src} not found — skipped`);
}
