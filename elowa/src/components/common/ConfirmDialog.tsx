import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A calm, accessible confirmation dialog for destructive/irreversible actions.
 * No manipulative retention language — just a clear statement and choice.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2',
            'rounded-3xl border border-border bg-card p-6 shadow-raised focus:outline-none data-[state=open]:animate-scale-in',
          )}
        >
          <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </Dialog.Description>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              variant={destructive ? 'primary' : 'primary'}
              className={cn('w-full', destructive && 'bg-attention hover:bg-attention/90')}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
            <Dialog.Close asChild>
              <Button variant="ghost" className="w-full">
                {cancelLabel}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
