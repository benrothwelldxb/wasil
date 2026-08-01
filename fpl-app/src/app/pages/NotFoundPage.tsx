import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState, PageContainer } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/routes/paths";

/** 404 page rendered for any unmatched route. */
export function NotFoundPage() {
  return (
    <PageContainer size="narrow" className="py-16">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={
          <Button asChild>
            <Link to={ROUTES.dashboard}>Back to dashboard</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
