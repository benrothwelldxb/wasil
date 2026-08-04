import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ResultsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Crafting journeys">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-16 w-16 rounded-full" />
          </div>
          <div className="mt-4 border-t pt-4">
            <Skeleton className="h-8 w-28" />
          </div>
        </Card>
      ))}
    </div>
  );
}
