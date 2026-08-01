import { Suspense } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import { LoadingSpinner } from "@/components/common";

/**
 * Outermost layout for every route.
 *
 * Responsibilities that should apply app-wide regardless of the visual shell
 * live here: scroll restoration between navigations and a Suspense boundary
 * for lazily-loaded route content.
 */
export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<LoadingSpinner fullPage />}>
        <Outlet />
      </Suspense>
    </>
  );
}
