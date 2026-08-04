import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { SkipLink } from './SkipLink';

export function AppShell() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip the very first mount — focusing `main` on initial load would
    // steal focus from wherever the browser naturally puts it (or hijack a
    // skip-link target the user hasn't used yet). Every navigation after
    // that moves focus to `main` so keyboard/screen-reader users get a cue
    // the route changed, the same job a full page load would normally do.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <Header />
      <main id="main" tabIndex={-1} ref={mainRef} className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
