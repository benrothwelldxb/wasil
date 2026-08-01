import type { ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { queryClient } from "@/lib/queryClient";

/**
 * Provides the shared TanStack Query client, with its cache **persisted to
 * localStorage**. On reload the cache is rehydrated, so the app renders
 * instantly from cache and remains usable offline. Bump `buster` to
 * invalidate all persisted caches after a breaking data-shape change.
 */
const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "fpl-query-cache",
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        buster: "v1",
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
