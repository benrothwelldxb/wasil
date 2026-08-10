import { forwardRef } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The app's primary call-to-action. Full-width and large by default — the
 * shape used for "Complete check-in", "Continue", etc.
 */
export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = 'lg', ...props }, ref) => (
    <Button ref={ref} size={size} className={cn('w-full', className)} {...props} />
  ),
);
PrimaryButton.displayName = 'PrimaryButton';
