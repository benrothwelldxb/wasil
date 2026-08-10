import { Icon } from '@/components/ui/icon';
import type { ContextTag } from '@/domain/models';
import { cn } from '@/lib/utils';

/**
 * A selectable "what changed?" context chip. Toggles on tap; selected state is
 * shown by a filled style plus a check icon (not colour alone).
 */
export function ContextTagChip({
  tag,
  selected = false,
  onToggle,
  interactive = true,
}: {
  tag: ContextTag;
  selected?: boolean;
  onToggle?: (tagId: string) => void;
  interactive?: boolean;
}) {
  const content = (
    <>
      <Icon name={selected ? 'Check' : tag.icon} className="size-4" />
      <span>{tag.label}</span>
    </>
  );

  const classes = cn(
    'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
    selected
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-foreground hover:bg-muted/60',
  );

  if (!interactive) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle?.(tag.id)}
      className={cn(
        classes,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      {content}
    </button>
  );
}
