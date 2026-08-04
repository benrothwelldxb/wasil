# Production hardening — review & remediation

A pre-launch hardening pass across 13 dimensions. Five parallel review agents
audited the codebase (read-only); findings were then remediated in three waves
(platform/logic → UI → tests/docs) and re-verified. This is the record.

## Scorecard

| Dimension | Before | After remediation |
| --- | --- | --- |
| Accessibility | **FAIL** | Slider thumbs labelled; AA-contrast tokens (`--accent-strong`, `--destructive-strong`, `--score-*-text`, all ≥4.5:1 both themes); detail-page `<h1>` + heading order; focus moved to `<main>` on route change; `AirportCombobox` full listbox/keyboard ARIA; combobox/select triggers get associated labels; `CostBreakdownPanel` progressbar named; chatty `aria-live` fixed. Page-level axe tests added. |
| Performance | NEEDS-WORK | `main.tsx` boot parallelised (removed 2 serialized round-trips); `ExperienceRing` count-up drives the DOM node via Framer `animate()` instead of `setState`-per-frame (was ~14 concurrent re-render loops on the grid). |
| SEO | NEEDS-WORK | OG/Twitter tags, canonical, dual light/dark `theme-color`, `robots.txt`, `sitemap.xml`. (Static SPA; per-route head management noted as a future step, proportionate to the target.) |
| PWA | **FAIL** | `vite-plugin-pwa` (`generateSW`, auto-update): web manifest + 192/512/maskable icons + apple-touch-icon. Installable. |
| Offline | **FAIL** | Service worker precaches the shell (25 entries) + `navigateFallback`. Because the journey engine is client-side + deterministic, the whole flow works offline once cached. |
| Animations | NEEDS-WORK | Shared `lib/motion` tokens replace scattered magic numbers; `LazyMotion` + `m.*` everywhere; `transition-all` scoped; results `layout`/entrance animation capped at 24. Reduced-motion was already solid (double-guarded). |
| Error handling | PASS | Two-tier boundaries (root + per-route), reset-on-nav, query errors surfaced. Remote error-sink seam noted (`logger.setSink`) for a real service. |
| Analytics | PASS | `track()` never throws, no-op default sink in prod, typed event union, no PII. Added a Do-Not-Track gate; batching/beacon noted for when a real sink is wired. |
| Security | **FAIL** | CSP with strict `script-src 'self'` (no inline — theme boot externalised to `/theme-init.js`, SW registration in-bundle) + `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS via `_headers`. `style-src` allows `'unsafe-inline'` (Radix `react-remove-scroll` injects a runtime `<style>`; a static host can't mint per-request style nonces — `script-src` stays strict, which carries the XSS protection). Removed the unused `sonner` Toaster (dead code + boot-time style injection). No secrets/PII in bundle (verified). `npm audit fix` applied. |
| Code duplication | NEEDS-WORK | Shared `domain/math` (`clamp`/`clamp01`/`mean`, was ×6) and `domain/journey` (`routeNodes`, was ×3); shared `NightsChip`. |
| Bundle size | NEEDS-WORK | `LazyMotion` cut `motion-vendor` 38.4→27.9 kB gzip; removed unused `date-fns`. Route-splitting + devtools exclusion were already correct. |
| Documentation | NEEDS-WORK | README documents both scores, one-command deploy, PWA/offline, security, and the accepted `react-router` risk; `testing.md` coverage scope corrected; `PLAN.md` scoring note; `LICENSE` + `CONTRIBUTING.md` added. |
| Testing | NEEDS-WORK | Added `use-criteria-from-params` (URL inbound leg, was 0%), three page-level integration tests, `NightsChip`, and `cost.ts` boundary tests; fixed a real-clock flake. Suite 524→546 tests; coverage ~98% stmts / 91% branch. |

## Deploy

One command: `npm run deploy` (`build` + `wrangler pages deploy dist`), config
in `wrangler.toml`. Needs `CLOUDFLARE_API_TOKEN` in the environment.

## Accepted risks & deferred items

- **`react-router-dom` GHSA-wrjc-x8rr-h8h6** (open redirect) spans all of 6.x
  with no patched 6.x release; fix needs a v7 major bump. The app builds all
  navigation targets from validated criteria and passes no attacker-controlled
  paths to `navigate()` — accepted pending a v7 migration.
- **Remote error + analytics sinks** are seams (`logger.setSink`,
  `setAnalyticsSink`), not wired to a real service — a deliberate next step; the
  default prod sinks are safe no-ops.
- **Per-route `<title>`/meta** (react-helmet-style) not added; the static SPA
  ships site-level tags. A build-time prerender of the landing route is the
  proportionate next step if organic search becomes a priority.
