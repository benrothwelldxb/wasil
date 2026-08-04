// No-FOUC theme bootstrap: applies the persisted (or system-preferred)
// theme class before first paint, ahead of the app bundle loading.
// Mirrors the shape zustand's `persist` middleware writes to
// localStorage: { state: { theme }, version }. See src/stores/ui-store.ts.
//
// Loaded via <script src="/theme-init.js"> (render-blocking, no defer) in
// index.html <head>, rather than inlined, so the page can ship a strict
// `script-src 'self'` CSP with no 'unsafe-inline' / hash.
(function () {
  try {
    var STORAGE_KEY = 'routecraft-ui';
    var theme = null;
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.state && (parsed.state.theme === 'dark' || parsed.state.theme === 'light')) {
        theme = parsed.state.theme;
      }
    }
    if (!theme) {
      theme =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    }
    document.documentElement.classList.add(theme);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
