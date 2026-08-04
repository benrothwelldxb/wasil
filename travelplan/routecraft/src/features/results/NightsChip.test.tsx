import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/render';
import { NightsChip } from './NightsChip';

describe('NightsChip', () => {
  it('renders the night count', () => {
    render(<NightsChip nights={2} size="sm" />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('uses the AA-readable accent-strong text token, not the plain fill token', () => {
    const { container } = render(<NightsChip nights={1} size="xs" />);
    const chip = container.firstElementChild as HTMLElement;
    const classes = chip.className.split(/\s+/);
    expect(classes).toContain('text-accent-strong');
    // The plain fill token `text-accent` fails AA as text; it must not be used.
    expect(classes).not.toContain('text-accent');
  });

  it('applies size-specific classes', () => {
    const { container: sm } = render(<NightsChip nights={1} size="sm" />);
    const { container: xs } = render(<NightsChip nights={1} size="xs" />);
    expect((sm.firstElementChild as HTMLElement).className).toContain('text-xs');
    expect((xs.firstElementChild as HTMLElement).className).toContain('text-[10px]');
  });
});
