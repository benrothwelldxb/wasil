import './index.css';
import { registerSW } from 'virtual:pwa-register';

// CSP-safe service-worker registration: `virtual:pwa-register` is bundled
// in-module (same-origin), not an injected inline <script>, so it works
// under a strict `script-src 'self'` CSP with no unsafe-inline/hash needed.
// `immediate: true` registers on load rather than waiting for a `load`
// event handoff. The app's journey engine is fully client-side/deterministic,
// so precaching the shell (see vite.config.ts workbox config) makes deep
// links usable offline.
registerSW({ immediate: true });

const rootEl = document.getElementById('root');

/** Plain-DOM boot error — no React dependency, so it works even if config fails. */
function renderBootError(): void {
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div role="alert" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:system-ui,-apple-system,sans-serif;text-align:center;background:#f8fafc;color:#0f172a;">
      <div style="max-width:28rem;">
        <h1 style="font-size:1.25rem;font-weight:600;margin:0 0 .5rem;">RouteCraft couldn’t start</h1>
        <p style="margin:0;color:#475569;line-height:1.5;">The application configuration is invalid. Please check the environment settings and reload.</p>
      </div>
    </div>`;
}

async function boot(): Promise<void> {
  if (!rootEl) return;

  // Fetch all boot chunks in parallel (one round-trip, not a serialized
  // chain) — env validation, App, and the React runtime. `env.ts` validates
  // at MODULE LOAD (`export const env = parseEnv(...)` throws on bad
  // config), so importing it inside this try/catch keeps the fail-fast
  // EnvError path intact: the throw happens during the `import()` itself and
  // is caught below, before anything renders.
  try {
    const [{ assertEnv }, { default: App }, React, ReactDOM] = await Promise.all([
      import('@/config/env'),
      import('./App'),
      import('react'),
      import('react-dom/client'),
    ]);

    // env module is already loaded (import above resolved) — this is a sync
    // re-check, not a second async hop.
    assertEnv();

    ReactDOM.createRoot(rootEl).render(
      React.createElement(React.StrictMode, null, React.createElement(App)),
    );
  } catch {
    renderBootError();
  }
}

void boot();
