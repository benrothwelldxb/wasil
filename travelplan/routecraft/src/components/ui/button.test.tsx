import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Button } from './button';

describe('Button', () => {
  it('renders default variant/size text and classes', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-primary', 'text-primary-foreground', 'h-9', 'px-4', 'py-2');
  });

  it('applies the destructive variant classes', () => {
    render(<Button variant="destructive">Delete</Button>);

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass(
      'bg-destructive',
      'text-destructive-foreground',
    );
  });

  it('applies the outline variant classes', () => {
    render(<Button variant="outline">Outline</Button>);

    expect(screen.getByRole('button', { name: 'Outline' })).toHaveClass(
      'border',
      'border-input',
      'bg-background',
    );
  });

  it('applies the secondary variant classes', () => {
    render(<Button variant="secondary">Secondary</Button>);

    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass(
      'bg-secondary',
      'text-secondary-foreground',
    );
  });

  it('applies the ghost variant classes', () => {
    render(<Button variant="ghost">Ghost</Button>);

    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveClass('hover:bg-accent');
  });

  it('applies the link variant classes', () => {
    render(<Button variant="link">Link</Button>);

    expect(screen.getByRole('button', { name: 'Link' })).toHaveClass(
      'text-primary',
      'underline-offset-4',
    );
  });

  it('applies size classes for icon size', () => {
    render(
      <Button size="icon" aria-label="Icon action">
        <svg aria-hidden="true" />
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Icon action' })).toHaveClass('h-9', 'w-9');
  });

  it('sets the disabled attribute and prevents clicks when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50');
  });

  it('renders the child element directly when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/somewhere">Go</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/somewhere');
    expect(link).toHaveClass('bg-primary');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('carries focus-visible ring classes for keyboard focus styling', () => {
    render(<Button>Focusable</Button>);

    expect(screen.getByRole('button', { name: 'Focusable' })).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
    );
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(
      <>
        <Button>Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button size="icon" aria-label="Icon action">
          <svg aria-hidden="true" />
        </Button>
      </>,
    );

    // color-contrast is disabled: jsdom has no real layout/canvas engine, so
    // axe-core's contrast check can't compute rendered colors reliably here.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
