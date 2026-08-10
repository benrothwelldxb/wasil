import { useDataMode } from '@/hooks/queries';
import { Icon } from '@/components/ui/icon';

/** A clear, dismissable-free banner shown whenever demo data is active. */
export function DemoBanner() {
  const { mode, exitDemo } = useDataMode();
  if (mode !== 'demo') return null;
  return (
    <div className="flex items-center gap-2 bg-beige/70 px-5 py-2 text-xs text-foreground">
      <Icon name="Sparkles" className="size-4 text-primary" />
      <span className="flex-1 font-medium">Demo data — a fictional example user</span>
      <button
        type="button"
        onClick={exitDemo}
        className="rounded-full px-2 py-1 font-semibold text-primary hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Exit demo
      </button>
    </div>
  );
}
