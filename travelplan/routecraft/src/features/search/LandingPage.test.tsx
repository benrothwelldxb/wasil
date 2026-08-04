import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('renders the hero, search form, and example searches', () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    // The SearchForm is present with its submit control.
    expect(screen.getByRole('button', { name: /craft my journeys/i })).toBeInTheDocument();
    expect(screen.getByText(/try an example/i)).toBeInTheDocument();
  });

  it('is accessible (no axe violations)', async () => {
    const { container } = renderWithProviders(<LandingPage />);
    await expectNoA11yViolations(container);
  });
});
