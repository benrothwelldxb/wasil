import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { axe } from 'vitest-axe';

import { AppShell } from './AppShell';

function renderAppShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<p>Page content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('renders the banner, main, and contentinfo landmarks', () => {
    renderAppShell();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders a skip link targeting #main as the first link', () => {
    renderAppShell();

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('Skip to content');
    expect(links[0]).toHaveAttribute('href', '#main');
  });

  it('gives main the id "main" so the skip link can target it', () => {
    renderAppShell();

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('renders routed page content inside main via Outlet', () => {
    renderAppShell();

    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = renderAppShell();

    // color-contrast is disabled: jsdom has no real layout/canvas engine, so
    // axe-core's contrast check can't compute rendered colors reliably here.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
