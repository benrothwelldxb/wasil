import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import type { LearningArticle } from '@/domain/models';
import { LEARN_CATEGORY_META } from '@/domain/constants';
import { formatShortDate } from '@/lib/date';

/**
 * Article preview card. Deliberately surfaces the source/review metadata slots
 * so professionally-reviewed content can display provenance later.
 */
export function ArticleCard({ article }: { article: LearningArticle }) {
  const meta = LEARN_CATEGORY_META[article.category];
  return (
    <Card className="transition-colors hover:bg-muted/40">
      <Link
        to={`/learn/${article.slug}`}
        className="flex items-start gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon name={meta.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {meta.label}
          </p>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
            {article.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{article.summary}</p>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Icon name="BookOpen" className="size-3.5" />
              {article.readMinutes} min read
            </span>
            {article.reviewedAt ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="Check" className="size-3.5" />
                Reviewed {formatShortDate(article.reviewedAt)}
              </span>
            ) : null}
          </div>
        </div>
        <Icon name="ChevronRight" className="mt-1 size-5 shrink-0 text-muted-foreground" />
      </Link>
    </Card>
  );
}
