import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { AuthProvider, TenantProvider, ThemeProvider, SessionExpiredModal, ContactConfirmModal } from '@wasil/shared'
import App from './App'
import './index.css'
import './i18n'
// Side-effect import: attaches the `beforeinstallprompt` listener at startup so
// the install prompt is captured even if it fires before login (see installState).
import './services/installState'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <ThemeProvider>
            <App />
            <SessionExpiredModal />
            <ContactConfirmModal />
          </ThemeProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

// Service worker registration is web-only. The native iOS/Android apps load
// the bundled dist via Capacitor's own webview lifecycle and never need — or
// should get — a browser service worker, so this is skipped there entirely
// (mirrors the isPushSupported() native gate in services/pushNotifications.ts).
// Web push is NOT wired up yet; this only enables installability + auto-update
// of cached assets for the PWA. That's a separate follow-on.
if (!Capacitor.isNativePlatform()) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
    .catch(() => {
      // Service worker isn't critical to app function — fail silently.
    })
}
