import { useEffect } from 'react';
import { useUiStore } from '@/stores/ui-store';

const THEME_COLOR: Record<'dark' | 'light', string> = {
  dark: '#0f172a',
  light: '#f8fafc',
};

/**
 * Applies the persisted theme to the document root, keeps the browser-chrome
 * `theme-color` meta tag in sync, and exposes the toggle.
 */
export function useTheme() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', THEME_COLOR[theme]);
    }
  }, [theme]);

  return { theme, toggleTheme };
}
