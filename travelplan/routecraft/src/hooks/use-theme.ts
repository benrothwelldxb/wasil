import { useEffect } from 'react';
import { useUiStore } from '@/stores/ui-store';

/** Applies the persisted theme to the document root and exposes the toggle. */
export function useTheme() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
  }, [theme]);

  return { theme, toggleTheme };
}
