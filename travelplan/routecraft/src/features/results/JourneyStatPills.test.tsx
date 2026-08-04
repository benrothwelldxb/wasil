import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';
import { CabinPill, DurationPill, SavingsPill } from './JourneyStatPills';

describe('SavingsPill', () => {
  it('shows the formatted savings amount when there is headroom', () => {
    render(<SavingsPill headroom={{ amount: 650, currency: 'USD' }} />);
    expect(screen.getByText(/You save/)).toHaveTextContent('You save $650');
  });

  it('falls back to a neutral note when headroom is zero', () => {
    render(<SavingsPill headroom={{ amount: 0, currency: 'USD' }} />);
    expect(screen.getByText('Under budget')).toBeInTheDocument();
  });

  it('is axe-clean', async () => {
    const { container } = render(<SavingsPill headroom={{ amount: 650, currency: 'USD' }} />);
    await expectNoA11yViolations(container);
  });
});

describe('CabinPill', () => {
  it('title-cases economy', () => {
    render(<CabinPill cabin="economy" />);
    expect(screen.getByText('Economy')).toBeInTheDocument();
  });

  it('title-cases premium_economy', () => {
    render(<CabinPill cabin="premium_economy" />);
    expect(screen.getByText('Premium economy')).toBeInTheDocument();
  });

  it('title-cases business', () => {
    render(<CabinPill cabin="business" />);
    expect(screen.getByText('Business')).toBeInTheDocument();
  });
});

describe('DurationPill', () => {
  it('formats minutes as hours and minutes, flying', () => {
    render(<DurationPill minutes={615} />);
    expect(screen.getByText('10h 15m flying')).toBeInTheDocument();
  });

  it('formats sub-hour durations', () => {
    render(<DurationPill minutes={45} />);
    expect(screen.getByText('45m flying')).toBeInTheDocument();
  });
});
