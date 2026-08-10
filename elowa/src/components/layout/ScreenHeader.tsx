import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

/**
 * Consistent top-of-screen header. Supports an optional back button, an
 * eyebrow/kicker, a title, and a trailing slot (e.g. an icon action).
 */
export function ScreenHeader({
  title,
  eyebrow,
  trailing,
  showBack = false,
  onBack,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  trailing?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate(-1));

  return (
    <header className={cn('flex items-start gap-3 px-5 pb-2 pt-6', className)}>
      {showBack ? (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back"
          className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="ChevronLeft" className="size-6" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="truncate text-2xl font-semibold text-foreground">{title}</h1>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
