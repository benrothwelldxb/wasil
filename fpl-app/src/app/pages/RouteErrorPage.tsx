import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { ErrorMessage, PageContainer } from "@/components/common";

/**
 * Router-level error element. Catches errors thrown during route rendering or
 * data loading and presents them with the shared {@link ErrorMessage}.
 */
export function RouteErrorPage() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading this page.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message =
      typeof error.data === "string" ? error.data : "This page could not be loaded.";
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <PageContainer size="narrow" className="py-16">
      <ErrorMessage
        title={title}
        message={message}
        onRetry={() => window.location.reload()}
      />
    </PageContainer>
  );
}
