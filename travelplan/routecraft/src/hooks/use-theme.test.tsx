import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from './use-theme';
import { useUiStore } from '@/stores/ui-store';

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="" />';
  document.documentElement.classList.remove('dark', 'light');
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.classList.remove('dark', 'light');
});

describe('useTheme', () => {
  it('applies the current theme as a class on the document root', () => {
    useUiStore.setState({ theme: 'dark' });
    render(<ThemeProbe />);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('sets the theme-color meta content to match a dark theme', () => {
    useUiStore.setState({ theme: 'dark' });
    render(<ThemeProbe />);

    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#0f172a');
  });

  it('sets the theme-color meta content to match a light theme', () => {
    useUiStore.setState({ theme: 'light' });
    render(<ThemeProbe />);

    expect(document.documentElement.classList.contains('light')).toBe(true);
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#f8fafc');
  });

  it('flips the root class and the meta content when toggled', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ theme: 'dark' });
    render(<ThemeProbe />);

    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#0f172a');
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'toggle' }));

    expect(screen.getByTestId('theme-value').textContent).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(meta?.getAttribute('content')).toBe('#f8fafc');
  });
});
