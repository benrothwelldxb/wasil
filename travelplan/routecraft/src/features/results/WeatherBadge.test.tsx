import { describe, expect, it } from 'vitest';
import { render } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';
import type { WeatherSummary } from '@/domain/hotels/types';
import { WeatherBadge } from './WeatherBadge';

function makeWeather(overrides: Partial<WeatherSummary> = {}): WeatherSummary {
  return {
    condition: 'sunny',
    averageHighC: 28,
    averageLowC: 20,
    precipitationChance: 0.1,
    ...overrides,
  };
}

describe('WeatherBadge', () => {
  it('renders the sunny condition with icon label and average temp', () => {
    const { container } = render(<WeatherBadge weather={makeWeather()} />);
    const badge = container.querySelector('[role="img"]');
    expect(badge).toHaveAttribute('aria-label', 'Weather: sunny, 24°');
    expect(badge).toHaveTextContent('24°');
    expect(badge).toHaveTextContent('Sunny');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders partly_cloudy as "Partly cloudy"', () => {
    const { container } = render(
      <WeatherBadge weather={makeWeather({ condition: 'partly_cloudy', averageHighC: 20, averageLowC: 10 })} />,
    );
    const badge = container.querySelector('[role="img"]');
    expect(badge).toHaveAttribute('aria-label', 'Weather: partly cloudy, 15°');
    expect(badge).toHaveTextContent('Partly cloudy');
  });

  it('renders cloudy with the rounded average temp', () => {
    const { container } = render(
      <WeatherBadge weather={makeWeather({ condition: 'cloudy', averageHighC: 15, averageLowC: 9 })} />,
    );
    const badge = container.querySelector('[role="img"]');
    expect(badge).toHaveAttribute('aria-label', 'Weather: cloudy, 12°');
    expect(badge).toHaveTextContent('Cloudy');
  });

  it('renders rainy', () => {
    const { container } = render(
      <WeatherBadge weather={makeWeather({ condition: 'rainy', averageHighC: 12, averageLowC: 8 })} />,
    );
    const badge = container.querySelector('[role="img"]');
    expect(badge).toHaveAttribute('aria-label', 'Weather: rainy, 10°');
    expect(badge).toHaveTextContent('Rainy');
  });

  it('renders snowy', () => {
    const { container } = render(
      <WeatherBadge weather={makeWeather({ condition: 'snowy', averageHighC: -1, averageLowC: -5 })} />,
    );
    const badge = container.querySelector('[role="img"]');
    expect(badge).toHaveAttribute('aria-label', 'Weather: snowy, -3°');
    expect(badge).toHaveTextContent('Snowy');
  });

  it('is axe-clean', async () => {
    const { container } = render(<WeatherBadge weather={makeWeather()} />);
    await expectNoA11yViolations(container);
  });

  it('accepts a className override', () => {
    const { container } = render(<WeatherBadge weather={makeWeather()} className="mt-2" />);
    expect(container.querySelector('[role="img"]')).toHaveClass('mt-2');
  });
});
