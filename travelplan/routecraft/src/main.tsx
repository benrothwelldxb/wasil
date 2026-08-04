import './index.css';

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

  // Validate environment first — an invalid VITE_* value fails fast with a
  // designed message rather than a blank screen. The dynamic import keeps the
  // env module's load-time validation inside this try/catch.
  try {
    const { assertEnv } = await import('@/config/env');
    assertEnv();
  } catch {
    renderBootError();
    return;
  }

  const [{ default: App }, React, ReactDOM] = await Promise.all([
    import('./App'),
    import('react'),
    import('react-dom/client'),
  ]);

  ReactDOM.createRoot(rootEl).render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  );
}

void boot();
