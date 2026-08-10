import { useParams } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/common/EmptyState';
import { HealthNotice } from '@/components/common/HealthNotice';
import { useArticle } from '@/hooks/queries';
import { LEARN_CATEGORY_META } from '@/domain/constants';
import { formatShortDate } from '@/lib/date';

export function ArticleScreen() {
  const { slug = '' } = useParams();
  const { data: article, isLoading } = useArticle(slug);

  if (isLoading) {
    return (
      <>
        <ScreenHeader title="Article" showBack />
        <Screen>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </Screen>
      </>
    );
  }

  if (!article) {
    return (
      <>
        <ScreenHeader title="Article" showBack />
        <Screen>
          <EmptyState icon="BookOpen" title="Article not found" />
        </Screen>
      </>
    );
  }

  const meta = LEARN_CATEGORY_META[article.category];

  return (
    <>
      <ScreenHeader eyebrow={meta.label} title={article.title} showBack />
      <Screen>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Icon name="BookOpen" className="size-3.5" />
            {article.readMinutes} min read
          </span>
          <Badge variant="example">Placeholder content</Badge>
        </div>

        <article className="mt-5 space-y-4">
          {article.body.map((para, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-foreground/90">
              {para}
            </p>
          ))}
        </article>

        {/* Provenance */}
        <Card className="mt-6 p-4">
          <h2 className="text-sm font-semibold text-foreground">About this article</h2>
          <dl className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {article.reviewedBy ? (
              <div className="flex gap-2">
                <dt className="font-medium text-foreground">Reviewed by</dt>
                <dd>{article.reviewedBy}</dd>
              </div>
            ) : null}
            {article.reviewedAt ? (
              <div className="flex gap-2">
                <dt className="font-medium text-foreground">Last reviewed</dt>
                <dd>{formatShortDate(article.reviewedAt)}</dd>
              </div>
            ) : null}
            {article.sources.length > 0 ? (
              <div className="flex gap-2">
                <dt className="font-medium text-foreground">Sources</dt>
                <dd>{article.sources.map((s) => s.label).join('; ')}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <HealthNotice className="mt-5" compact />
      </Screen>
    </>
  );
}
