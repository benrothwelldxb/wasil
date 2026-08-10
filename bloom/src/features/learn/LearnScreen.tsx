import { useMemo, useState } from 'react';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { ArticleCard } from '@/components/product/ArticleCard';
import { EmptyState } from '@/components/common/EmptyState';
import { Icon } from '@/components/ui/icon';
import { useArticles } from '@/hooks/queries';
import { LEARN_CATEGORY_META, LEARN_CATEGORY_ORDER } from '@/domain/constants';
import type { LearnCategory } from '@/domain/models';
import { cn } from '@/lib/utils';

type Filter = 'all' | LearnCategory;

export function LearnScreen() {
  const { data: articles } = useArticles();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (!articles) return [];
    return filter === 'all' ? articles : articles.filter((a) => a.category === filter);
  }, [articles, filter]);

  return (
    <>
      <ScreenHeader eyebrow="Evidence-based & calm" title="Learn" />
      <Screen padded={false}>
        <p className="px-5 text-sm text-muted-foreground">
          Clear, reassuring information about what you might be experiencing.
        </p>

        {/* Category filter row */}
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} icon="Sparkles">
            All
          </FilterChip>
          {LEARN_CATEGORY_ORDER.map((cat) => (
            <FilterChip
              key={cat}
              active={filter === cat}
              onClick={() => setFilter(cat)}
              icon={LEARN_CATEGORY_META[cat].icon}
            >
              {LEARN_CATEGORY_META[cat].label}
            </FilterChip>
          ))}
        </div>

        <div className="mt-4 space-y-3 px-5 pb-28">
          {filtered.length > 0 ? (
            filtered.map((article) => <ArticleCard key={article.id} article={article} />)
          ) : (
            <EmptyState icon="BookOpen" title="No articles in this topic yet" />
          )}
        </div>
      </Screen>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-muted/60',
      )}
    >
      <Icon name={icon} className="size-4" />
      {children}
    </button>
  );
}
