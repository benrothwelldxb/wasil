import { axe } from 'vitest-axe';
import { expect } from 'vitest';

type AxeOptions = Parameters<typeof axe>[1];

/**
 * Asserts a container has no axe-core accessibility violations. Uses the
 * results-based form (not a global matcher) to avoid vitest matcher type
 * augmentation. `color-contrast` is disabled by default because jsdom has no
 * layout/canvas engine to compute rendered colors.
 */
export async function expectNoA11yViolations(
  container: Element,
  options: AxeOptions = { rules: { 'color-contrast': { enabled: false } } },
): Promise<void> {
  const results = await axe(container, options);
  expect(results.violations).toEqual([]);
}
