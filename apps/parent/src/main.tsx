import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { AuthProvider, ThemeProvider, SessionExpiredModal, ContactConfirmModal } from '@wasil/shared'
import App from './App'
import './index.css'
import './i18n'

// Register the PWA service worker on the WEB build only. Inside the Capacitor
// native shell push is handled natively (APNs/FCM), so the SW is never
// registered there — it must not shadow native behaviour.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <App />
          <SessionExpiredModal />
          <ContactConfirmModal />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
