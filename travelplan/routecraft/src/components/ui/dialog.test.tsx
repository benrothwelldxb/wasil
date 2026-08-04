import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

// jsdom does not implement these APIs, but Radix's positioning/focus-scope
// logic reaches for them. Stubbed locally (not in the shared setup file)
// because only Radix-based components need them.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  window.matchMedia =
    window.matchMedia ??
    (vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia);

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function renderDialog() {
  return render(
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogHeader>
        <button type="button">Inner action</button>
      </DialogContent>
    </Dialog>,
  );
}

describe('Dialog', () => {
  it('is closed until the trigger is activated', () => {
    renderDialog();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows dialog content with its title after activating the trigger', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Dialog title')).toBeInTheDocument();
  });

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement | null),
    );
  });

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('has no detectable accessibility violations while open', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog');

    // Dialog content renders into a portal on document.body, so audit the
    // whole document rather than the render container. color-contrast is
    // disabled: jsdom has no real layout/canvas engine, so axe-core's
    // contrast check can't compute rendered colors reliably here.
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
