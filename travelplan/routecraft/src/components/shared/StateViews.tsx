import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Compass, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-4 text-muted-foreground">{icon ?? <SearchX className="h-10 w-10" />}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
      title="Something went wrong"
      description={message ?? 'We could not craft journeys for this search. Please try again.'}
      action={
        <Button asChild variant="outline">
          <Link to="/">Start a new search</Link>
        </Button>
      }
    />
  );
}

export function NotFoundPage() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center text-center">
      <Compass className="mb-4 h-12 w-12 text-primary" />
      <h1 className="text-3xl font-bold">Off the map</h1>
      <p className="mt-2 text-muted-foreground">That route doesn&apos;t exist.</p>
      <Button asChild className="mt-6">
        <Link to="/">Back to search</Link>
      </Button>
    </div>
  );
}
